import { fetch } from "scripting"
import { buildMailPlan, type MailOptions } from "./email_plan"
import { loadState } from "./storage"
const KEY = "due-manager-email-v1"
const TOKEN = "due-manager-email-token-v1"
const SHARED = { shared: true } as const
export interface EmailSettings extends MailOptions { url: string }
function normalizeMutedItemIDs(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((id): id is string => typeof id === "string" && id.length > 0))]
    .slice(0, 1000)
}
function isPrivateHTTP(url: string): boolean {
  return /^http:\/\/(?:10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})(?::\d{1,5})?$/.test(url)
}
export function loadEmailSettings(): EmailSettings {
  const stored = Storage.get<Partial<EmailSettings>>(KEY, SHARED) ?? {}
  const settings: EmailSettings = {
    enabled: stored.enabled === true,
    url: typeof stored.url === "string" ? stored.url : "https://due.284290.xyz",
    hour: Number.isInteger(stored.hour) && stored.hour! >= 0 && stored.hour! <= 23 ? stored.hour! : 9,
    minute: Number.isInteger(stored.minute) && stored.minute! >= 0 && stored.minute! <= 59 ? stored.minute! : 0,
    includeDueDate: stored.includeDueDate === true,
    mutedItemIDs: normalizeMutedItemIDs(stored.mutedItemIDs),
  }
  if (["http://172.16.0.34:8787", "https://due.284290.xyz:8443"].includes(settings.url)) {
    settings.url = "https://due.284290.xyz"
  }
  return settings
}
export function saveEmailSettings(settings: EmailSettings) {
  const url = settings.url.trim().replace(/\/+$/, "")
  if (!/^https:\/\/[^\s?#]+$/.test(url) && !isPrivateHTTP(url)) {
    throw new Error("请输入受信任的 HTTPS 地址，或私有局域网 IP 的 HTTP 地址（不带路径和查询参数）。")
  }
  if (!Storage.set(KEY, { ...settings, url, mutedItemIDs: normalizeMutedItemIDs(settings.mutedItemIDs) }, SHARED)) throw new Error("邮件设置保存失败。")
}
async function keychain() {
  const module = await import("scripting") as unknown as Record<string, any>
  const kc = module.Keychain ?? (globalThis as any).Keychain
  if (!kc?.get || !kc?.set) throw new Error("请更新 Scripting，当前版本缺少钥匙串支持。")
  return kc
}
export async function saveEmailToken(value: string) {
  if (value.trim().length < 32) throw new Error("同步密钥至少 32 个字符，需与云服务器配置一致。")
  if (!(await keychain()).set(TOKEN, value.trim())) throw new Error("同步密钥未能保存。")
}
async function request(path: string, body?: unknown): Promise<any> {
  const settings = loadEmailSettings()
  if (!settings.url) throw new Error("请先保存服务器地址。")
  const token = (await keychain()).get(TOKEN)
  if (!token) throw new Error("请先输入同步密钥并保存。")
  const response = await fetch(settings.url + path, { method: body === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    allowInsecureRequest: isPrivateHTTP(settings.url), timeout: 15, debugLabel: "到期管家服务器同步" })
  if (!response.ok) throw new Error(`服务器请求失败（HTTP ${response.status}），请检查地址、密钥及服务器日志。`)
  return response.json()
}
let queue: Promise<unknown> = Promise.resolve()
export function syncEmail(force = false, allowEmpty = false): Promise<string> {
  const next = queue.then(async () => {
    const settings = loadEmailSettings()
    if (!force && !settings.enabled) return "云邮件提醒未启用；服务器旧计划保持不变。"
    const remote = await request("/status")
    const plan = buildMailPlan(loadState().items, settings)
    if (!force && !allowEmpty && plan.rolling.rules.length === 0 && (remote.pending > 0 || remote.rolling)) {
      return "检测到本地事项暂时为空，已保留服务器旧计划；如需清空请在云邮件提醒中手动保存。"
    }
    const result = await request("/sync", { ...plan, expectedRevision: remote.revision })
    const message = result.rolling
      ? `长期滚动计划已启用，待发 ${result.pending} 条；服务器会自动续期。`
      : `服务器已接收，待发 ${result.pending} 条；计划至 ${new Date(plan.through).toLocaleDateString()}。`
    Storage.set(KEY + "-status", `${new Date().toLocaleString()}：${message}`, SHARED)
    return message
  }).catch(error => {
    Storage.set(KEY + "-status", `同步失败：${String(error)}。服务器仍按上次成功同步的计划发送。`, SHARED)
    throw error
  })
  queue = next.catch(() => undefined)
  return next
}
export function emailSyncStatus(): string { return Storage.get<string>(KEY + "-status", SHARED) ?? "尚未同步" }
export async function emailServerStatus(): Promise<string> {
  const s = await request("/status")
  return `${s.rolling ? "长期滚动：已启用；" : "长期滚动：未启用；"}待发 ${s.pending}；已发 ${s.sent}；失败待重试 ${s.failed}；结果不明 ${s.uncertain}；过期跳过 ${s.expired}。最近错误：${s.lastError || "无"}`
}
export async function testEmail(): Promise<string> {
  await request("/test", {})
  return "服务器已提交测试邮件，请检查收件箱及垃圾邮件。"
}
