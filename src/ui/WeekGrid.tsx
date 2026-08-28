import {
  formatHoursShort,
  formatMinutes,
  formatTimeOfDay,
} from '../lib/format'
import {
  computeFreeIntervals,
  DAY_LABELS,
  DAYS,
  getDayWindow,
  totalMinutes,
  type Interval,
} from '../lib/schedule'
import type { DayOfWeek, FixedEvent, Settings } from '../lib/types'

const PX_PER_MINUTE = 0.7
const HOUR_HEIGHT = 60 * PX_PER_MINUTE

/** グリッドに重ねて描く任意のブロック（Phase 3 の配置済み習慣で使う）。 */
export interface OverlayBlock {
  key: string
  dayOfWeek: DayOfWeek
  startMinutes: number
  endMinutes: number
  label: string
  tone: 'habit' | 'reserve'
}

type Props = {
  settings: Settings
  fixedEvents: FixedEvent[]
  overlays?: OverlayBlock[]
}

export function WeekGrid({ settings, fixedEvents, overlays = [] }: Props) {
  const dayWindow = getDayWindow(settings)
  const windowLength = dayWindow.end - dayWindow.start
  const trackHeight = windowLength * PX_PER_MINUTE

  const freeByDay = DAYS.map((day) =>
    computeFreeIntervals(day, fixedEvents, settings),
  )

  // 時刻目盛り。窓の中に入る毎正時だけ引く。
  const firstHour = Math.ceil(dayWindow.start / 60) * 60
  const hourMarks: number[] = []
  for (let minute = firstHour; minute <= dayWindow.end; minute += 60) {
    hourMarks.push(minute)
  }

  const top = (minutes: number) => (minutes - dayWindow.start) * PX_PER_MINUTE
  const clamp = (interval: Interval): Interval | null => {
    const start = Math.max(interval.start, dayWindow.start)
    const end = Math.min(interval.end, dayWindow.end)
    return end > start ? { start, end } : null
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-card">
      <div className="flex min-w-[520px]">
        {/* 時刻の軸 */}
        <div className="w-11 shrink-0 border-r border-line">
          <div className="h-11 border-b border-line" />
          <div className="relative" style={{ height: trackHeight }}>
            {hourMarks.map((minute) => (
              <span
                key={minute}
                className="absolute right-1 -translate-y-1/2 text-[10px] tabular-nums text-ink-faint"
                style={{ top: top(minute) }}
              >
                {formatTimeOfDay(minute)}
              </span>
            ))}
          </div>
        </div>

        {DAYS.map((day) => {
          const free = freeByDay[day]
          return (
            <div key={day} className="min-w-16 flex-1 border-r border-line last:border-r-0">
              <div className="flex h-11 flex-col items-center justify-center border-b border-line">
                <span className="text-xs font-medium">{DAY_LABELS[day]}</span>
                <span
                  className="whitespace-nowrap text-[10px] text-ink-faint"
                  title={`空き ${formatMinutes(totalMinutes(free))}`}
                >
                  空き {formatHoursShort(totalMinutes(free))}
                </span>
              </div>

              <div
                className="relative bg-surface"
                style={{
                  height: trackHeight,
                  backgroundImage:
                    'repeating-linear-gradient(to bottom, var(--color-line) 0 1px, transparent 1px ' +
                    `${HOUR_HEIGHT}px)`,
                  backgroundPositionY: `${top(firstHour)}px`,
                }}
              >
                {/* 空き枠：淡い強調 */}
                {free.map((interval) => (
                  <div
                    key={`free-${interval.start}`}
                    className="absolute inset-x-0.5 rounded-sm bg-accent-soft"
                    style={{
                      top: top(interval.start),
                      height: (interval.end - interval.start) * PX_PER_MINUTE,
                    }}
                  />
                ))}

                {/* 固定予定：塗りつぶし */}
                {fixedEvents
                  .filter((event) => event.dayOfWeek === day)
                  .map((event) => {
                    const range = clamp({
                      start: event.startMinutes,
                      end: event.endMinutes,
                    })
                    if (range === null) return null
                    return (
                      <div
                        key={event.id}
                        title={`${event.label} ${formatTimeOfDay(event.startMinutes)}–${formatTimeOfDay(event.endMinutes)}`}
                        className="absolute inset-x-0.5 overflow-hidden rounded-sm bg-block px-1 py-0.5 text-[10px] leading-tight text-ink-soft"
                        style={{
                          top: top(range.start),
                          height: (range.end - range.start) * PX_PER_MINUTE,
                        }}
                      >
                        {event.label}
                      </div>
                    )
                  })}

                {/* 重ねブロック（配置済みの習慣・予備枠） */}
                {overlays
                  .filter((block) => block.dayOfWeek === day)
                  .map((block) => {
                    const range = clamp({
                      start: block.startMinutes,
                      end: block.endMinutes,
                    })
                    if (range === null) return null
                    return (
                      <div
                        key={block.key}
                        title={`${block.label} ${formatTimeOfDay(block.startMinutes)}–${formatTimeOfDay(block.endMinutes)}`}
                        className={`absolute inset-x-0.5 overflow-hidden rounded-sm px-1 py-0.5 text-[10px] leading-tight ${
                          block.tone === 'reserve'
                            ? 'border border-dashed border-accent text-ink-soft'
                            : 'bg-accent text-white'
                        }`}
                        style={{
                          top: top(range.start),
                          height: (range.end - range.start) * PX_PER_MINUTE,
                        }}
                      >
                        {block.label}
                      </div>
                    )
                  })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
