import { Button, DatePicker, LabeledContent, List, NavigationLink, Section, Text, TextField, Toggle, useState } from "scripting"
import { humanDate } from "./date"
import { emailServerStatus, emailSyncStatus, loadEmailSettings, saveEmailSettings, saveEmailToken, syncEmail, testEmail } from "./email"
import { loadState } from "./storage"

export function EmailView() {
  const [settings, setSettings] = useState(loadEmailSettings)
  const [token, setToken] = useState("")
  const [message, setMessage] = useState(emailSyncStatus)
  const [busy, setBusy] = useState(false)
  const [gate] = useState(() => ({ busy: false }))
  const run = async (fn: () => Promise<string>) => {
    if (gate.busy) return
    gate.busy = true; setBusy(true)
    try { setMessage(await fn()) }
    catch (e) { setMessage(String(e)) }
    finally { gate.busy = false; setBusy(false) }
  }
  return <List navigationTitle="云邮件提醒" listStyle="insetGroup">
    <Section header={<Text>服务器连接</Text>} footer={<Text>服务器地址使用受信任的 HTTPS。同步密钥与服务器的 api_token 一致，保存至钥匙串；此处不是邮箱授权码。</Text>}>
      <TextField title="服务器地址" prompt="https://due.284290.xyz" value={settings.url} onChanged={url => setSettings({ ...settings, url })} />
      <TextField title="同步密钥（保存后清空）" value={token} onChanged={setToken} />
      <Toggle title="启用云邮件提醒" value={settings.enabled} onChanged={enabled => setSettings({ ...settings, enabled })} />
      <DatePicker title="全天／提前日发送时间" displayedComponents={["hourAndMinute"]} value={new Date(2000, 0, 1, settings.hour, settings.minute).getTime()}
        onChanged={value => { const d = new Date(value); setSettings({ ...settings, hour: d.getHours(), minute: d.getMinutes() }) }} />
      <Toggle title="到期日再发一次" value={settings.includeDueDate} onChanged={includeDueDate => setSettings({ ...settings, includeDueDate })} />
      <Button title="保存并同步到服务器" disabled={busy} action={() => { void run(async () => {
        if (token.trim()) { await saveEmailToken(token); setToken("") }
        saveEmailSettings(settings)
        return syncEmail(true)
      }) }} />
      <Text>{busy ? "正在连接服务器…" : message}</Text>
    </Section>
    <Section header={<Text>连接与发送状态</Text>} footer={<Text>修改、完成、删除或关闭事项后仍要成功同步，服务器才会更新待发邮件。只同步手动事项的标题、到期时间、周期规则和邮件计划，不同步金额、备注及 Apple 提醒事项。服务器会按手机时区长期滚动补充计划，不需要每年重新续期。首次同步补发最近 24 小时提醒，更早的跳过。</Text>}>
      <NavigationLink destination={<CloudMailTasksView onSaved={setSettings} />}>
        <Text>查看与调整云端任务</Text>
      </NavigationLink>
      <Button title="查看服务器发送记录汇总" disabled={busy} action={() => { void run(emailServerStatus) }} />
      <Button title="发送一封测试邮件" disabled={busy} action={() => { void run(testEmail) }} />
      <Text font="caption">打开脚本、修改事项和组件完成操作时尝试同步。手机离线或连接失败时，服务器仍按旧计划发送；恢复网络后请重新同步。仅使用一部手机管理此服务。</Text>
    </Section>
  </List>
}

function CloudMailTasksView({ onSaved }: { onSaved: (settings: ReturnType<typeof loadEmailSettings>) => void }) {
  const initial = loadEmailSettings()
  const items = loadState().items.filter(item => item.enabled)
  const [mutedIDs, setMutedIDs] = useState<string[]>(() => initial.mutedItemIDs ?? [])
  const [status, setStatus] = useState("点下方按钮读取服务器状态。")
  const [busy, setBusy] = useState(false)
  const [gate] = useState(() => ({ busy: false }))

  const run = async (operation: () => Promise<void>) => {
    if (gate.busy) return
    gate.busy = true
    setBusy(true)
    try { await operation() }
    catch (error) { setStatus(String(error)) }
    finally { gate.busy = false; setBusy(false) }
  }

  const refreshStatus = () => run(async () => { setStatus(await emailServerStatus()) })
  const saveAndSync = () => run(async () => {
    const next = { ...loadEmailSettings(), mutedItemIDs: [...new Set(mutedIDs)] }
    saveEmailSettings(next)
    onSaved(next)
    setStatus(await syncEmail(true))
  })
  const toggle = (id: string, enabled: boolean) => {
    const next = new Set(mutedIDs)
    if (enabled) next.delete(id)
    else next.add(id)
    setMutedIDs([...next])
  }
  const selectedCount = items.filter(item => !mutedIDs.includes(item.id)).length

  return <List navigationTitle="云端任务" navigationBarTitleDisplayMode="inline" listStyle="insetGroup">
    <Section
      header={<Text>服务器状态</Text>}
      footer={<Text>服务器当前接口提供发送队列汇总；下方开关代表下一次同步后服务器应保留的滚动任务。若手机与服务器状态不一致，请保存并同步。</Text>}
    >
      <LabeledContent title="将同步的任务"><Text>{selectedCount} 项</Text></LabeledContent>
      <Text font="caption">{busy ? "正在连接服务器…" : status}</Text>
      <Button title="刷新服务器状态" systemImage="arrow.clockwise" disabled={busy} action={() => { void refreshStatus() }} />
    </Section>

    <Section
      header={<Text>滚动邮件任务</Text>}
      footer={<Text>关闭某一项后，保存并同步会从服务器后续邮件计划中移除该事项，但不会删除到期管家中的事项，也不会影响本地通知和桌面组件。</Text>}
    >
      {items.length === 0
        ? <Text foregroundStyle="secondaryLabel">暂无启用的手动事项</Text>
        : items.map(item => (
          <Toggle
            key={item.id}
            title={`${item.title} · ${humanDate(item.dueDate, item.includesTime, item.hour, item.minute)}`}
            value={!mutedIDs.includes(item.id)}
            disabled={busy}
            onChanged={(enabled: boolean) => toggle(item.id, enabled)}
          />
        ))}
    </Section>

    <Section>
      <Button title="保存并同步服务器任务" systemImage="arrow.triangle.2.circlepath" disabled={busy}
        action={() => { void saveAndSync() }} />
    </Section>
  </List>
}
