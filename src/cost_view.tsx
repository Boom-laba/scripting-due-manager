import { LabeledContent, List, Section, Text } from "scripting"
import { annualCostTotals, costTotals, formatCost, upcomingCosts } from "./costs"
import { humanDate } from "./date"
import type { ManualDueItem } from "./types"

export function CostOverviewView({ items }: { items: ManualDueItem[] }) {
  const annual = annualCostTotals(items)
  const upcoming = upcomingCosts(items)
  const upcomingTotals = costTotals(upcoming)
  const annualRows = Object.entries(annual).sort(([left], [right]) => left.localeCompare(right))
  const upcomingTotalRows = Object.entries(upcomingTotals).sort(([left], [right]) => left.localeCompare(right))

  return <List navigationTitle="费用概览" navigationBarTitleDisplayMode="inline" listStyle="insetGroup">
    <Section header={<Text>预计年支出</Text>} footer={<Text>按当前周期折算；每天和每周按平均自然年估算。不同币种分别统计，不自动换汇。</Text>}>
      {annualRows.length === 0
        ? <Text foregroundStyle="secondaryLabel">没有可统计的周期金额</Text>
        : annualRows.map(([currency, value]) => <LabeledContent key={currency} title={currency}><Text>{formatCost(currency, value)}</Text></LabeledContent>)}
    </Section>
    <Section header={<Text>未来30天合计</Text>}>
      {upcomingTotalRows.length === 0
        ? <Text foregroundStyle="secondaryLabel">未来30天没有可识别的金额</Text>
        : upcomingTotalRows.map(([currency, value]) => <LabeledContent key={currency} title={currency}><Text>{formatCost(currency, value)}</Text></LabeledContent>)}
    </Section>
    {upcoming.length > 0 ? <Section header={<Text>未来30天明细</Text>} footer={<Text>金额支持 ¥、元、CNY、HK$、HKD、$、USD、€、EUR、£、GBP 等常见写法；无法识别币种时单独列为“未标币种”。</Text>}>
      {upcoming.slice(0, 50).map((cost, index) => (
        <LabeledContent key={`${cost.id}-${cost.dueDate}-${index}`} title={`${cost.title} · ${humanDate(cost.dueDate, false, 0, 0)}`}>
          <Text>{formatCost(cost.currency, cost.value)}</Text>
        </LabeledContent>
      ))}
    </Section> : null}
  </List>
}
