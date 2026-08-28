import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import { useMemo } from 'react'
import { formatMinutes, formatTimeOfDay } from '../lib/format'
import {
  dateOfWeekDay,
  getWeekStart,
  suggestForReserve,
  toDayOfWeek,
  weekProgress,
} from '../lib/stats'
import { useAppStore } from '../lib/store-context'
import type { Habit, LogEntry, PlannedSlot } from '../lib/types'
import { useNow } from '../lib/useNow'
import { Screen } from '../ui/Screen'

export function Today() {
  const { data, recordLog, removeLog } = useAppStore()
  const { habits, plannedSlots, logs } = data

  const now = useNow()
  const weekStart = getWeekStart(now)
  const today = toDayOfWeek(now)
  const todayISO = dateOfWeekDay(weekStart, today)
  const nowMinutes = now.getHours() * 60 + now.getMinutes()

  const habitById = useMemo(
    () => new Map(habits.map((habit) => [habit.id, habit])),
    [habits],
  )

  const todaySlots = plannedSlots
    .filter((slot) => slot.weekStart === weekStart && slot.dayOfWeek === today)
    .sort((a, b) => a.startMinutes - b.startMinutes)

  const logBySlot = useMemo(() => {
    const map = new Map<string, LogEntry>()
    for (const log of logs) {
      if (log.slotId !== undefined) map.set(log.slotId, log)
    }
    return map
  }, [logs])

  const progress = weekProgress(plannedSlots, logs, weekStart)

  const record = (
    slot: PlannedSlot,
    habitId: string,
    status: 'done' | 'skipped',
  ) => {
    recordLog({
      date: todayISO,
      habitId,
      status,
      actualMinutes:
        status === 'done' ? slot.endMinutes - slot.startMinutes : undefined,
      slotId: slot.id,
    })
  }

  return (
    <Screen title="今日" description={format(now, 'M月d日(E)', { locale: ja })}>
      <WeekBar progress={progress} />

      {todaySlots.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-line bg-card px-5 py-10 text-center">
          <p className="text-sm text-ink-soft">今日の予定はありません</p>
          <p className="mt-1 text-xs text-ink-faint">
            {plannedSlots.some((slot) => slot.weekStart === weekStart)
              ? 'ゆっくり過ごしてください'
              : '「週の計画」で自動配置すると、ここに並びます'}
          </p>
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {todaySlots.map((slot) => {
            const log = logBySlot.get(slot.id) ?? null
            const isNow =
              nowMinutes >= slot.startMinutes && nowMinutes < slot.endMinutes
            return (
              <li key={slot.id}>
                {slot.isReserve ? (
                  <ReserveCard
                    slot={slot}
                    log={log}
                    isNow={isNow}
                    habitById={habitById}
                    suggestion={suggestForReserve(
                      habits,
                      plannedSlots,
                      logs,
                      weekStart,
                      slot.endMinutes - slot.startMinutes,
                    )}
                    onRecord={(habitId) => record(slot, habitId, 'done')}
                    onUndo={() => log !== null && removeLog(log.id)}
                  />
                ) : (
                  <SlotCard
                    slot={slot}
                    habit={habitById.get(slot.habitId) ?? null}
                    log={log}
                    isNow={isNow}
                    onRecord={(status) => record(slot, slot.habitId, status)}
                    onUndo={() => log !== null && removeLog(log.id)}
                  />
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Screen>
  )
}

/** 今週の進捗。連続記録ではなく週単位の達成率を主指標にする（設計原則3）。 */
function WeekBar({
  progress,
}: {
  progress: { planned: number; done: number; rate: number }
}) {
  if (progress.planned === 0) return null
  const percent = Math.min(100, Math.round(progress.rate * 100))
  return (
    <div className="rounded-xl border border-line bg-card px-4 py-3">
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-ink-soft">今週の達成率</span>
        <span className="text-sm tabular-nums text-ink-soft">
          {`${percent}%（${progress.done} / ${progress.planned}）`}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface">
        <div
          className="h-full rounded-full bg-accent transition-[width]"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}

const cardClass = (isNow: boolean, recorded: boolean) =>
  [
    'rounded-xl border bg-card p-4 transition-colors',
    isNow && !recorded ? 'border-accent ring-1 ring-accent' : 'border-line',
    recorded ? 'opacity-70' : '',
  ]
    .filter(Boolean)
    .join(' ')

function TimeRange({ slot }: { slot: PlannedSlot }) {
  return (
    <span className="tabular-nums">
      {`${formatTimeOfDay(slot.startMinutes)}–${formatTimeOfDay(slot.endMinutes)}`}
    </span>
  )
}

type SlotCardProps = {
  slot: PlannedSlot
  habit: Habit | null
  log: LogEntry | null
  isNow: boolean
  onRecord: (status: 'done' | 'skipped') => void
  onUndo: () => void
}

function SlotCard({ slot, habit, log, isNow, onRecord, onUndo }: SlotCardProps) {
  const length = slot.endMinutes - slot.startMinutes
  return (
    <div className={cardClass(isNow, log !== null)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-ink-soft">
            <TimeRange slot={slot} />
            <span className="ml-2 text-ink-faint">{formatMinutes(length)}</span>
            {isNow && log === null && (
              <span className="ml-2 font-medium text-accent">いま</span>
            )}
          </p>
          <p className="mt-1 truncate font-medium">
            {habit?.name ?? '（削除された習慣）'}
          </p>
        </div>
        {habit !== null && (
          <span className="shrink-0 rounded-full bg-accent-soft px-2 py-1 text-xs text-ink-soft">
            {habit.category}
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
        {log === null ? (
          <>
            <button
              type="button"
              onClick={() => onRecord('done')}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              実施
            </button>
            <button
              type="button"
              onClick={() => onRecord('skipped')}
              className="rounded-lg px-4 py-2 text-sm text-ink-soft hover:bg-surface"
            >
              スキップ
            </button>
          </>
        ) : (
          <>
            <span className="text-sm text-ink-soft">
              {log.status === 'done' ? '実施しました' : '未実施'}
            </span>
            <button
              type="button"
              onClick={onUndo}
              className="ml-auto rounded-lg px-3 py-1.5 text-sm text-ink-faint hover:bg-surface"
            >
              取り消す
            </button>
          </>
        )}
      </div>
    </div>
  )
}

type ReserveCardProps = {
  slot: PlannedSlot
  log: LogEntry | null
  isNow: boolean
  habitById: Map<string, Habit>
  suggestion: Habit | null
  onRecord: (habitId: string) => void
  onUndo: () => void
}

/** 予備枠。未消化の習慣をここでやり直せるよう提案する。 */
function ReserveCard({
  slot,
  log,
  isNow,
  habitById,
  suggestion,
  onRecord,
  onUndo,
}: ReserveCardProps) {
  const recordedHabit = log !== null ? habitById.get(log.habitId) : undefined
  return (
    <div
      className={`rounded-xl border border-dashed bg-card p-4 ${
        isNow && log === null ? 'border-accent' : 'border-line'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-ink-soft">
            <TimeRange slot={slot} />
            {isNow && log === null && (
              <span className="ml-2 font-medium text-accent">いま</span>
            )}
          </p>
          <p className="mt-1 font-medium">予備枠</p>
        </div>
      </div>

      <div className="mt-3 border-t border-line pt-3">
        {log !== null ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-ink-soft">
              {`${recordedHabit?.name ?? '習慣'}を実施しました`}
            </span>
            <button
              type="button"
              onClick={onUndo}
              className="ml-auto rounded-lg px-3 py-1.5 text-sm text-ink-faint hover:bg-surface"
            >
              取り消す
            </button>
          </div>
        ) : suggestion !== null ? (
          <>
            <p className="text-sm text-ink-soft">
              {`${suggestion.name}が今週まだ残っています。ここでやりますか？`}
            </p>
            <button
              type="button"
              onClick={() => onRecord(suggestion.id)}
              className="mt-3 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              {`${suggestion.name}を実施`}
            </button>
          </>
        ) : (
          <p className="text-sm text-ink-faint">
            やり直し用の空き枠です。今週の予定は消化できています。
          </p>
        )}
      </div>
    </div>
  )
}
