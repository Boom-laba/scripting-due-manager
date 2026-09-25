import { actionDateKey, addCalendarDays, dateKeyToLocalDate, localDateKey, nextOccurrence, parseDateKey } from "./date"
import type { ManualDueItem } from "./types"

export interface MailOptions {
  enabled: boolean
  hour: number
  minute: number
  includeDueDate: boolean
  /** Manual items excluded from the cloud mail schedule. */
  mutedItemIDs?: string[]
}
export interface MailJob { id: string; fireAt: number; title: string; body: string }

function activeMailItems(items: ManualDueItem[], settings: MailOptions): ManualDueItem[] {
  const muted = new Set(settings.mutedItemIDs ?? [])
  return items.filter(item => item.enabled && !muted.has(item.id))
}

function rollingRules(items: ManualDueItem[]) {
  return items.map(item => ({
    id: item.id,
    title: item.title,
    dueDate: item.dueDate,
    includesTime: item.includesTime,
    hour: item.hour,
    minute: item.minute,
    remindBeforeDays: item.remindBeforeDays,
    // A floating next date does not exist until completion; sync only the current occurrence.
    recurrence: item.recurrence?.fromCompletion ? null : item.recurrence,
  }))
}

// Reuse the original calendar rules, including month-end and leap-day anchors.
export function buildMailPlan(items: ManualDueItem[], settings: MailOptions, now = new Date()) {
  const through = dateKeyToLocalDate(addCalendarDays(localDateKey(now), 730)).getTime()
  const jobs: MailJob[] = []
  const activeItems = activeMailItems(items, settings)
  const rolling = {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai",
    hour: settings.hour,
    minute: settings.minute,
    includeDueDate: settings.includeDueDate,
    rules: rollingRules(activeItems),
  }
  if (!settings.enabled) return { enabled: false, through, jobs, rolling }
  for (const item of activeItems) {

    let due = item.dueDate
    let steps = 0
    while (true) {
      if (++steps > 100000 || !parseDateKey(due)) throw new Error("事项日期或周期超出支持范围，请检查后重试。")
      const advance = item.remindBeforeDays > 0
      const actionAt = dateKeyToLocalDate(actionDateKey(due, item.remindBeforeDays), true,
        !advance && item.includesTime ? item.hour : settings.hour,
        !advance && item.includesTime ? item.minute : settings.minute).getTime()
      if (actionAt > through) break
      const times = [{ kind: "action", at: actionAt }]
      if (advance && settings.includeDueDate) times.push({ kind: "due", at: dateKeyToLocalDate(due, true,
        item.includesTime ? item.hour : settings.hour, item.includesTime ? item.minute : settings.minute).getTime() })
      for (const t of times) {
        // Include a 24h catch-up window; the cloud ledger prevents repeat delivery.
        if (t.at < now.getTime() - 86400000 || t.at > through) continue
        jobs.push({ id: JSON.stringify([item.id, due, t.kind]), fireAt: t.at,
          title: item.title.replace(/[\r\n]+/g, " ").slice(0, 200), body: `事项：${item.title}\n到期：${due}${item.includesTime ? ` ${String(item.hour).padStart(2, "0")}:${String(item.minute).padStart(2, "0")}` : ""}\n${advance && t.kind === "action" ? `提前 ${item.remindBeforeDays} 天提醒` : "到期提醒"}\n时间按手机同步时所在时区安排。` })
        if (jobs.length > 50000) throw new Error("两年内邮件计划超过 50000 条，请减少事项或降低频率。")
      }
      if (!item.recurrence || item.recurrence.fromCompletion) break
      const next = nextOccurrence(due, item.recurrence)
      if (next <= due) throw new Error("重复周期未能前进，请检查事项。")
      due = next
    }
  }
  return { enabled: true, through, jobs, rolling }
}
