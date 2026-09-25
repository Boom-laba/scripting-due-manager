import { addCalendarDays, localDateKey, nextOccurrence } from "./date"
import type { ManualDueItem } from "./types"

export interface ParsedAmount { currency: string; value: number }
export interface UpcomingCost extends ParsedAmount { id: string; title: string; dueDate: string }

const CURRENCIES: Array<[RegExp, string]> = [
  [/HK\$|HKD/i, "HKD"], [/US\$|USD/i, "USD"], [/CNY|RMB|CN¥|[¥￥]|元/i, "CNY"],
  [/EUR|€/i, "EUR"], [/GBP|£/i, "GBP"], [/JPY/i, "JPY"], [/KRW|₩/i, "KRW"],
  [/AUD/i, "AUD"], [/CAD/i, "CAD"], [/SGD/i, "SGD"], [/\$/i, "USD"],
]

export function parseAmount(value: string): ParsedAmount | null {
  const match = value.replace(/，/g, ",").match(/(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?/)
  if (!match) return null
  const amount = Number(match[0].replace(/,/g, ""))
  if (!Number.isFinite(amount) || amount < 0) return null
  const currency = CURRENCIES.find(([pattern]) => pattern.test(value))?.[1] ?? "未标币种"
  return { currency, value: amount }
}

export function annualOccurrences(item: ManualDueItem): number {
  const rule = item.recurrence
  if (!rule) return 0
  if (rule.unit === "day") return 365.2425 / rule.interval
  if (rule.unit === "week") return 52.1775 / rule.interval
  if (rule.unit === "month") return 12 / rule.interval
  return 1 / rule.interval
}

export function annualCostTotals(items: ManualDueItem[]): Record<string, number> {
  const totals: Record<string, number> = {}
  for (const item of items) {
    if (!item.enabled) continue
    const amount = parseAmount(item.amount)
    const occurrences = annualOccurrences(item)
    if (!amount || occurrences <= 0) continue
    totals[amount.currency] = (totals[amount.currency] ?? 0) + amount.value * occurrences
  }
  return totals
}

export function upcomingCosts(items: ManualDueItem[], now = new Date(), days = 30): UpcomingCost[] {
  const start = localDateKey(now)
  const end = addCalendarDays(start, Math.max(0, Math.floor(days)))
  const result: UpcomingCost[] = []
  for (const item of items) {
    if (!item.enabled) continue
    const amount = parseAmount(item.amount)
    if (!amount) continue
    let dueDate = item.dueDate
    for (let step = 0; step < 10000 && dueDate <= end; step += 1) {
      if (dueDate >= start) result.push({ ...amount, id: item.id, title: item.title, dueDate })
      if (!item.recurrence || item.recurrence.fromCompletion) break
      const next = nextOccurrence(dueDate, item.recurrence)
      if (next <= dueDate) break
      dueDate = next
    }
  }
  return result.sort((left, right) => left.dueDate.localeCompare(right.dueDate) || left.title.localeCompare(right.title))
}

export function costTotals(costs: ParsedAmount[]): Record<string, number> {
  const totals: Record<string, number> = {}
  for (const cost of costs) totals[cost.currency] = (totals[cost.currency] ?? 0) + cost.value
  return totals
}

export function formatCost(currency: string, value: number): string {
  return `${currency} ${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}
