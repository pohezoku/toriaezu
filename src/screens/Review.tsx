import { format, parseISO } from 'date-fns'
import { ja } from 'date-fns/locale'
import { useState } from 'react'
import { formatTarget } from '../lib/format'
import { achievementRate, getWeekStart, shiftWeek } from '../lib/stats'
import { useAppStore } from '../lib/store-context'
import {
  computeSuggestions,
  weekHasData,
  type Suggestion,
} from '../lib/suggest'
import type { Habit } from '../lib/types'
import { Screen } from '../ui/Screen'

/** 推移を見る週数。 */
const TREND_WEEKS = 4

export function Review() {
  const { data, approveSuggestion, dismissSuggestion } = useAppStore()
  const { habits, plannedSlots, logs, settings, dismissedSuggestions } = data

  const thisWeek = getWeekStart(new Date())
  const [weekStart, setWeekStart] = useState(thisWeek)

  const activeHabits = habits.filter((habit) => habit.active)
  const suggestions = computeSuggestions({
    habits,
    plannedSlots,
    logs,
    settings,
    weekStart,
    dismissed: dismissedSuggestions,
  })

  // 古い順に4週ぶん（右端が選んでいる週）
  const trendWeeks = Array.from({ length: TREND_WEEKS }, (_, index) =>
    shiftWeek(weekStart, -(TREND_WEEKS - 1 - index)),
  )

  const hasData = weekHasData(weekStart, plannedSlots, logs)

  return (
    <Screen
      title="振り返り"
      description="達成できたことと、できなかったことを見て、翌週の計画に反映します。"
    >
      <WeekSwitcher
        weekStart={weekStart}
        isCurrent={weekStart === thisWeek}
        onChange={setWeekStart}
      />

      {activeHabits.length === 0 ? (
        <EmptyCard text="習慣がまだありません" />
      ) : !hasData ? (
        <EmptyCard text="この週にはまだ計画も記録もありません" />
      ) : (
        <section className="mt-4">
          <h3 className="mb-2 text-sm font-medium">この週の達成率</h3>
          <div className="space-y-3">
            {activeHabits.map((habit) => (
              <RateRow
                key={habit.id}
                habit={habit}
                rate={achievementRate(habit, logs, weekStart)}
              />
            ))}
          </div>
        </section>
      )}

      {activeHabits.length > 0 && (
        <section className="mt-6">
          <h3 className="mb-2 text-sm font-medium">{`過去${TREND_WEEKS}週の推移`}</h3>
          <div className="rounded-xl border border-line bg-card p-4">
            <div className="space-y-4">
              {activeHabits.map((habit) => (
                <TrendRow
                  key={habit.id}
                  habit={habit}
                  weeks={trendWeeks}
                  rateOf={(week) => achievementRate(habit, logs, week)}
                  hasDataOf={(week) => weekHasData(week, plannedSlots, logs)}
                />
              ))}
            </div>
            <div className="mt-3 flex justify-between text-[10px] text-ink-faint">
              <span>{formatWeekShort(trendWeeks[0])}</span>
              <span>{formatWeekShort(trendWeeks[TREND_WEEKS - 1])}</span>
            </div>
          </div>
        </section>
      )}

      <section className="mt-6">
        <h3 className="mb-2 text-sm font-medium">翌週への提案</h3>
        {suggestions.length === 0 ? (
          <EmptyCard text="提案はありません。このまま続けてください" />
        ) : (
          <div className="space-y-3">
            {suggestions.map((suggestion) => (
              <SuggestionCard
                key={suggestion.key}
                suggestion={suggestion}
                onApprove={() => {
                  approveSuggestion(suggestion)
                  // 目標を1段階変えたら、新しい記録が貯まるまで同じ規則は出さない
                  if (suggestion.kind !== 'avoidSlot') {
                    dismissSuggestion(suggestion.key, weekStart)
                  }
                }}
                onDismiss={() => dismissSuggestion(suggestion.key, weekStart)}
              />
            ))}
          </div>
        )}
      </section>
    </Screen>
  )
}

function formatWeekShort(weekStart: string): string {
  return format(parseISO(weekStart), 'M/d', { locale: ja })
}

function EmptyCard({ text }: { text: string }) {
  return (
    <div className="mt-4 rounded-xl border border-dashed border-line bg-card px-5 py-8 text-center">
      <p className="text-sm text-ink-soft">{text}</p>
    </div>
  )
}

function WeekSwitcher({
  weekStart,
  isCurrent,
  onChange,
}: {
  weekStart: string
  isCurrent: boolean
  onChange: (weekStart: string) => void
}) {
  const start = parseISO(weekStart)
  const end = parseISO(shiftWeek(weekStart, 1))
  end.setDate(end.getDate() - 1)
  return (
    <div className="flex items-center justify-between rounded-xl border border-line bg-card px-2 py-2">
      <button
        type="button"
        aria-label="前の週"
        onClick={() => onChange(shiftWeek(weekStart, -1))}
        className="rounded-lg px-3 py-1.5 text-sm text-ink-soft hover:bg-surface"
      >
        ←
      </button>
      <span className="text-sm tabular-nums">
        {`${format(start, 'M/d', { locale: ja })} – ${format(end, 'M/d', { locale: ja })}`}
        {isCurrent && <span className="ml-2 text-xs text-ink-faint">今週</span>}
      </span>
      <button
        type="button"
        aria-label="次の週"
        onClick={() => onChange(shiftWeek(weekStart, 1))}
        disabled={isCurrent}
        className="rounded-lg px-3 py-1.5 text-sm text-ink-soft hover:bg-surface disabled:opacity-30"
      >
        →
      </button>
    </div>
  )
}

function RateRow({ habit, rate }: { habit: Habit; rate: number }) {
  const percent = Math.round(rate * 100)
  return (
    <div className="rounded-xl border border-line bg-card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate font-medium">{habit.name}</span>
        <span className="shrink-0 text-sm tabular-nums text-ink-soft">
          {`${percent}%`}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface">
        <div
          className="h-full rounded-full bg-accent"
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>
      <p className="mt-1.5 text-xs text-ink-faint">{`目標 ${formatTarget(habit)}`}</p>
    </div>
  )
}

/** 過去4週の推移。棒の高さが達成率。データの無い週は空欄にする。 */
function TrendRow({
  habit,
  weeks,
  rateOf,
  hasDataOf,
}: {
  habit: Habit
  weeks: string[]
  rateOf: (weekStart: string) => number
  hasDataOf: (weekStart: string) => boolean
}) {
  return (
    <div>
      <p className="mb-1.5 truncate text-xs text-ink-soft">{habit.name}</p>
      <div className="flex h-14 items-end gap-1.5">
        {weeks.map((week) => {
          const has = hasDataOf(week)
          const percent = has ? Math.min(100, Math.round(rateOf(week) * 100)) : 0
          return (
            <div
              key={week}
              className="flex flex-1 flex-col items-center justify-end gap-1"
              title={
                has
                  ? `${formatWeekShort(week)}の週：${percent}%`
                  : `${formatWeekShort(week)}の週：記録なし`
              }
            >
              <span className="text-[10px] tabular-nums text-ink-faint">
                {has ? `${percent}%` : '—'}
              </span>
              <div className="flex h-8 w-full items-end rounded-sm bg-surface">
                {percent > 0 && (
                  <div
                    className="w-full rounded-sm bg-accent"
                    style={{ height: `${Math.max(3, (percent / 100) * 32)}px` }}
                  />
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** 提案は必ず承認制（設計原則5）。 */
function SuggestionCard({
  suggestion,
  onApprove,
  onDismiss,
}: {
  suggestion: Suggestion
  onApprove: () => void
  onDismiss: () => void
}) {
  const approveLabel =
    suggestion.kind === 'lowerTarget'
      ? '下げる'
      : suggestion.kind === 'raiseTarget'
        ? '増やす'
        : '避けて配置する'
  return (
    <div className="rounded-xl border border-line bg-card p-4">
      <p className="text-sm leading-relaxed">{suggestion.message}</p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onApprove}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          {approveLabel}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-lg px-4 py-2 text-sm text-ink-soft hover:bg-surface"
        >
          今のままにする
        </button>
      </div>
      {suggestion.kind === 'avoidSlot' && (
        <p className="mt-2 text-xs text-ink-faint">
          次に「週の計画」で自動配置すると反映されます。
        </p>
      )}
    </div>
  )
}
