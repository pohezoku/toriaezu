import { formatMinutes } from '../lib/format'
import { computeWeekFreeIntervals, totalMinutes } from '../lib/schedule'
import { useAppStore } from '../lib/store-context'
import { Screen } from '../ui/Screen'
import { WeekGrid } from '../ui/WeekGrid'

export function WeekPlan() {
  const { data } = useAppStore()
  const { settings, fixedEvents } = data

  const freeByDay = computeWeekFreeIntervals(fixedEvents, settings)
  const weekFreeMinutes = freeByDay.reduce(
    (sum, intervals) => sum + totalMinutes(intervals),
    0,
  )
  const usableMinutes = Math.floor(weekFreeMinutes * settings.maxFillRatio)

  return (
    <Screen
      title="週の計画"
      description="固定予定を除いた空き時間です。ここに習慣を配置していきます。"
    >
      <div className="mb-4 rounded-xl border border-line bg-card p-4">
        <p className="text-sm">
          今週の空きは <strong>{formatMinutes(weekFreeMinutes)}</strong>
        </p>
        <p className="mt-1 text-xs text-ink-faint">
          {`このうち習慣に使うのは上限 ${Math.round(settings.maxFillRatio * 100)}% = ${formatMinutes(usableMinutes)} まで。残りは移動・疲労・突発のために空けておきます。`}
        </p>
      </div>

      <WeekGrid settings={settings} fixedEvents={fixedEvents} />

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-ink-faint">
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-3 rounded-sm bg-block" />
          固定予定
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-3 rounded-sm bg-accent-soft" />
          空き
        </span>
      </div>

      {fixedEvents.length === 0 && (
        <p className="mt-4 text-xs text-ink-soft">
          固定予定がまだありません。「固定予定」画面で授業やバイトを登録すると、
          空き時間がより正確になります。
        </p>
      )}
    </Screen>
  )
}
