import { useMemo, useState } from 'react'
import {
  formatMinutes,
  formatTimeOfDay,
  parseTimeInputValue,
  toTimeInputValue,
} from '../lib/format'
import { autoPlan, sessionPlan, validateSlotPosition } from '../lib/plan'
import {
  computeWeekFreeIntervals,
  DAY_LABELS,
  DAYS,
  totalMinutes,
} from '../lib/schedule'
import { getWeekStart } from '../lib/stats'
import { useAppStore } from '../lib/store-context'
import type { DayOfWeek, Habit, PlannedSlot } from '../lib/types'
import { Screen } from '../ui/Screen'
import { WeekGrid, type OverlayBlock } from '../ui/WeekGrid'

export function WeekPlan() {
  const {
    data,
    setWeekPlan,
    movePlannedSlot,
    removePlannedSlot,
  } = useAppStore()
  const { settings, fixedEvents, habits, plannedSlots, logs } = data

  const weekStart = getWeekStart(new Date())
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const slots = useMemo(
    () => plannedSlots.filter((slot) => slot.weekStart === weekStart),
    [plannedSlots, weekStart],
  )
  const habitById = useMemo(
    () => new Map(habits.map((habit) => [habit.id, habit])),
    [habits],
  )

  const freeByDay = computeWeekFreeIntervals(fixedEvents, settings)
  const weekFreeMinutes = freeByDay.reduce(
    (sum, intervals) => sum + totalMinutes(intervals),
    0,
  )
  const usableMinutes = Math.floor(weekFreeMinutes * settings.maxFillRatio)
  const plannedMinutes = slots
    .filter((slot) => !slot.isReserve)
    .reduce((sum, slot) => sum + slot.endMinutes - slot.startMinutes, 0)

  const activeHabits = habits.filter((habit) => habit.active)

  // 未配置は計画から毎回導出する。画面を移っても消えないようにするため（設計原則6）
  const unplaced = activeHabits.flatMap((habit) => {
    const requested = sessionPlan(habit).count
    const placed = slots.filter((slot) => slot.habitId === habit.id).length
    if (placed >= requested) return []
    return [{ habit, requested, placed, sessionMinutes: sessionPlan(habit).minutes }]
  })
  const hasPlan = slots.length > 0
  const reserveMissing = hasPlan && !slots.some((slot) => slot.isReserve)

  const handleAutoPlan = () => {
    if (
      slots.length > 0 &&
      !window.confirm('いまの配置を破棄して、置き直します。よろしいですか？')
    ) {
      return
    }
    const result = autoPlan({
      weekStart,
      habits,
      fixedEvents,
      settings,
      logs,
    })
    setWeekPlan(weekStart, result.slots)
    setSelectedId(null)
  }

  const overlays: OverlayBlock[] = slots.map((slot) => ({
    key: slot.id,
    dayOfWeek: slot.dayOfWeek,
    startMinutes: slot.startMinutes,
    endMinutes: slot.endMinutes,
    label: slot.isReserve
      ? '予備'
      : (habitById.get(slot.habitId)?.name ?? '（削除された習慣）'),
    tone: slot.isReserve ? 'reserve' : 'habit',
  }))

  const selected = slots.find((slot) => slot.id === selectedId) ?? null

  return (
    <Screen
      title="週の計画"
      description="固定予定を除いた空き時間に、習慣を配置します。"
      action={
        <button
          type="button"
          onClick={handleAutoPlan}
          disabled={activeHabits.length === 0}
          className="shrink-0 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
        >
          {slots.length > 0 ? '置き直す' : '自動配置'}
        </button>
      }
    >
      <div className="mb-4 rounded-xl border border-line bg-card p-4">
        <p className="text-sm">
          {`今週の空きは ${formatMinutes(weekFreeMinutes)}`}
        </p>
        <p className="mt-1 text-xs text-ink-faint">
          {`習慣に使うのは上限 ${Math.round(settings.maxFillRatio * 100)}% = ${formatMinutes(usableMinutes)} まで。残りは移動・疲労・突発のために空けておきます。`}
        </p>
        {plannedMinutes > 0 && (
          <p className="mt-2 text-sm">
            {`配置済み ${formatMinutes(plannedMinutes)}`}
          </p>
        )}
      </div>

      {activeHabits.length === 0 && (
        <p className="mb-4 text-xs text-ink-soft">
          配置できる習慣がありません。「習慣」画面で追加してください。
        </p>
      )}

      {hasPlan && <UnplacedNotice unplaced={unplaced} />}

      {reserveMissing && (
        <p className="mb-4 rounded-xl border border-line bg-card p-4 text-xs text-ink-soft">
          予備枠を取れませんでした。空きに余裕がありません。
        </p>
      )}

      <WeekGrid
        settings={settings}
        fixedEvents={fixedEvents}
        overlays={overlays}
        selectedKey={selectedId}
        onSelect={(key) => setSelectedId((current) => (current === key ? null : key))}
      />

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-ink-faint">
        <Swatch className="bg-block" label="固定予定" />
        <Swatch className="bg-accent-soft" label="空き" />
        <Swatch className="bg-accent" label="習慣" />
        <Swatch className="border border-dashed border-accent bg-card" label="予備枠" />
      </div>

      {selected !== null && (
        <SlotEditor
          key={selected.id}
          slot={selected}
          label={
            selected.isReserve
              ? '予備枠'
              : (habitById.get(selected.habitId)?.name ?? '（削除された習慣）')
          }
          onMove={(position) => movePlannedSlot(selected.id, position)}
          validate={(position) =>
            validateSlotPosition(selected, position, {
              fixedEvents,
              settings,
              slots,
            })
          }
          onRemove={() => {
            removePlannedSlot(selected.id)
            setSelectedId(null)
          }}
          onClose={() => setSelectedId(null)}
        />
      )}

      {slots.length > 0 && selected === null && (
        <p className="mt-3 text-xs text-ink-faint">
          枠をタップすると、移動・削除ができます。
        </p>
      )}
    </Screen>
  )
}

function Swatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block size-3 rounded-sm ${className}`} />
      {label}
    </span>
  )
}

/** 未配置は正直に出す（設計原則6）。 */
function UnplacedNotice({
  unplaced,
}: {
  unplaced: {
    habit: Habit
    requested: number
    placed: number
    sessionMinutes: number
  }[]
}) {
  if (unplaced.length === 0) return null
  return (
    <div className="mb-4 rounded-xl border border-line bg-card p-4">
      <p className="text-sm font-medium">未配置があります</p>
      <p className="mt-1 text-xs text-ink-soft">
        空き時間に入りきらなかったぶんです。無理に詰め込んでいません。
        目標を下げるか、固定予定を見直してください。
      </p>
      <ul className="mt-3 space-y-1.5 text-sm">
        {unplaced.map((item) => (
          <li key={item.habit.id} className="flex justify-between gap-3">
            <span className="min-w-0 truncate">{item.habit.name}</span>
            <span className="shrink-0 tabular-nums text-ink-soft">
              {`${item.placed} / ${item.requested}回（1回 ${item.sessionMinutes}分）`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

type SlotEditorProps = {
  slot: PlannedSlot
  label: string
  onMove: (position: { dayOfWeek: DayOfWeek; startMinutes: number }) => void
  validate: (position: { dayOfWeek: DayOfWeek; startMinutes: number }) => string | null
  onRemove: () => void
  onClose: () => void
}

function SlotEditor({
  slot,
  label,
  onMove,
  validate,
  onRemove,
  onClose,
}: SlotEditorProps) {
  const [day, setDay] = useState<DayOfWeek>(slot.dayOfWeek)
  const [start, setStart] = useState(slot.startMinutes)
  const [error, setError] = useState<string | null>(null)

  const length = slot.endMinutes - slot.startMinutes
  const changed = day !== slot.dayOfWeek || start !== slot.startMinutes

  const handleMove = () => {
    const reason = validate({ dayOfWeek: day, startMinutes: start })
    if (reason !== null) {
      setError(reason)
      return
    }
    setError(null)
    onMove({ dayOfWeek: day, startMinutes: start })
  }

  return (
    <div className="mt-4 rounded-xl border border-line bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">{label}</p>
          <p className="mt-0.5 text-xs text-ink-soft">
            {`${DAY_LABELS[slot.dayOfWeek]} ${formatTimeOfDay(slot.startMinutes)}–${formatTimeOfDay(slot.endMinutes)}（${formatMinutes(length)}）`}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-2 py-1 text-sm text-ink-faint hover:bg-surface"
        >
          閉じる
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-ink-soft" htmlFor="slot-day">
            曜日
          </label>
          <select
            id="slot-day"
            className="mt-1 w-full rounded-lg border border-line bg-card px-3 py-2 text-sm outline-none focus:border-accent"
            value={day}
            onChange={(event) => setDay(Number(event.target.value) as DayOfWeek)}
          >
            {DAYS.map((value) => (
              <option key={value} value={value}>
                {DAY_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-soft" htmlFor="slot-start">
            開始
          </label>
          <input
            id="slot-start"
            type="time"
            className="mt-1 w-full rounded-lg border border-line bg-card px-3 py-2 text-sm outline-none focus:border-accent"
            value={toTimeInputValue(start)}
            onChange={(event) => {
              const minutes = parseTimeInputValue(event.target.value)
              if (minutes !== null) setStart(minutes)
            }}
          />
        </div>
      </div>

      {error !== null && (
        <p className="mt-2 text-sm text-ink-soft" role="alert">
          {error}
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={handleMove}
          disabled={!changed}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
        >
          この位置に動かす
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="ml-auto rounded-lg px-3 py-2 text-sm text-ink-faint hover:bg-surface"
        >
          枠を削除
        </button>
      </div>
    </div>
  )
}
