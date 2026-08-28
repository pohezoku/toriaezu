import { createId } from './storage'
import { achievementRate, shiftWeek } from './stats'
import {
  computeWeekFreeIntervals,
  DAYS,
  getDayWindow,
  intervalLength,
  MIN_FREE_MINUTES,
  totalMinutes,
  type Interval,
} from './schedule'
import type {
  DayOfWeek,
  FixedEvent,
  Habit,
  LogEntry,
  PlannedSlot,
  Settings,
  TimePref,
} from './types'

/** 予備枠の長さ（設計図4章の手順4）。 */
export const RESERVE_MINUTES = 60

/** 1回あたりの長さと、週に何回置くか。 */
export interface SessionPlan {
  count: number
  minutes: number
}

/**
 * 週の目標を「◯分の枠 × ◯回」に変換する。
 * 分目標のときは最低ブロックに近い長さで割り切れるよう、5分単位に丸めて配る。
 */
export function sessionPlan(habit: Habit): SessionPlan {
  if (habit.targetType === 'count') {
    return {
      count: Math.max(0, Math.floor(habit.targetValue)),
      minutes: habit.minBlockMinutes,
    }
  }
  if (habit.targetValue <= 0) return { count: 0, minutes: habit.minBlockMinutes }
  const count = Math.max(1, Math.round(habit.targetValue / habit.minBlockMinutes))
  const minutes = Math.max(
    habit.minBlockMinutes,
    Math.ceil(habit.targetValue / count / 5) * 5,
  )
  return { count, minutes }
}

/** 希望時間帯が指す時間の範囲。 */
export function preferredWindow(
  timePref: TimePref,
  settings: Settings,
): Interval {
  const dayWindow = getDayWindow(settings)
  switch (timePref) {
    case '朝':
      return { start: dayWindow.start, end: Math.min(11 * 60, dayWindow.end) }
    case '昼':
      return {
        start: Math.max(11 * 60, dayWindow.start),
        end: Math.min(17 * 60, dayWindow.end),
      }
    case '夜':
      return { start: Math.max(17 * 60, dayWindow.start), end: dayWindow.end }
    default:
      return dayWindow
  }
}

function intersect(a: Interval, b: Interval): Interval | null {
  const start = Math.max(a.start, b.start)
  const end = Math.min(a.end, b.end)
  return end > start ? { start, end } : null
}

/** interval から [start, start+minutes) を取り除いた残り。短すぎる断片は捨てる。 */
function removeFrom(
  intervals: Interval[],
  target: Interval,
  used: Interval,
): Interval[] {
  const result: Interval[] = []
  for (const interval of intervals) {
    if (interval !== target) {
      result.push(interval)
      continue
    }
    const before = { start: interval.start, end: used.start }
    const after = { start: used.end, end: interval.end }
    if (intervalLength(before) >= MIN_FREE_MINUTES) result.push(before)
    if (intervalLength(after) >= MIN_FREE_MINUTES) result.push(after)
  }
  return result.sort((a, b) => a.start - b.start)
}

export interface UnplacedHabit {
  habitId: string
  /** 必要だった枠の数。 */
  requested: number
  /** 実際に置けた数。 */
  placed: number
  sessionMinutes: number
}

export interface PlanResult {
  slots: PlannedSlot[]
  unplaced: UnplacedHabit[]
  /** 予備枠を確保できたか。 */
  reservePlaced: boolean
}

export interface PlanInput {
  weekStart: string
  habits: Habit[]
  fixedEvents: FixedEvent[]
  settings: Settings
  logs: LogEntry[]
}

/** 配置候補。スコアが小さいほど良い。 */
interface Candidate {
  day: DayOfWeek
  interval: Interval
  used: Interval
  score: number[]
}

function betterThan(a: number[], b: number[]): boolean {
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return a[i] < b[i]
  }
  return false
}

/**
 * 自動配置（設計図4章）。
 * 置ききれなかったぶんは絶対に詰め込まず、未配置として返す（設計原則6）。
 */
export function autoPlan(input: PlanInput): PlanResult {
  const { weekStart, fixedEvents, settings, logs } = input
  const habits = input.habits.filter((habit) => habit.active)

  const freeByDay = computeWeekFreeIntervals(fixedEvents, settings)
  const remaining = freeByDay.map((intervals) =>
    intervals.map((interval) => ({ ...interval })),
  )
  // 手順3: 1日に置ける合計は、その日の空き時間 × maxFillRatio まで（設計原則2）
  const capacity = freeByDay.map(
    (intervals) => totalMinutes(intervals) * settings.maxFillRatio,
  )
  const used = DAYS.map(() => 0)

  // 手順2: 優先度の昇順。同順位なら先週の達成率が低いものを先に
  const lastWeek = shiftWeek(weekStart, -1)
  const rate = new Map(
    habits.map((habit) => [habit.id, achievementRate(habit, logs, lastWeek)]),
  )
  const ordered = [...habits].sort(
    (a, b) =>
      a.priority - b.priority ||
      (rate.get(a.id) ?? 0) - (rate.get(b.id) ?? 0) ||
      a.createdAt.localeCompare(b.createdAt),
  )

  const slots: PlannedSlot[] = []
  const unplaced: UnplacedHabit[] = []

  for (const habit of ordered) {
    const plan = sessionPlan(habit)
    const pref = preferredWindow(habit.timePref, settings)
    const placedDays: number[] = []
    let placed = 0

    for (let session = 0; session < plan.count; session += 1) {
      let best: Candidate | null = null

      for (const day of DAYS) {
        if (used[day] + plan.minutes > capacity[day]) continue
        if (
          habit.avoidConsecutiveDays &&
          placedDays.some((other) => Math.abs(other - day) <= 1)
        ) {
          continue
        }
        const sameDay = placedDays.filter((other) => other === day).length

        for (const interval of remaining[day]) {
          const inPref = intersect(interval, pref)
          let start: number
          let prefMiss: number
          if (inPref !== null && intervalLength(inPref) >= plan.minutes) {
            start = inPref.start
            prefMiss = 0
          } else if (intervalLength(interval) >= plan.minutes) {
            start = interval.start
            prefMiss = 1
          } else {
            continue
          }
          const candidate: Candidate = {
            day,
            interval,
            used: { start, end: start + plan.minutes },
            score: [
              prefMiss,
              sameDay,
              capacity[day] > 0 ? used[day] / capacity[day] : 1,
              day,
              start,
            ],
          }
          if (best === null || betterThan(candidate.score, best.score)) {
            best = candidate
          }
        }
      }

      if (best === null) break

      slots.push({
        id: createId(),
        weekStart,
        habitId: habit.id,
        dayOfWeek: best.day,
        startMinutes: best.used.start,
        endMinutes: best.used.end,
        isReserve: false,
      })
      remaining[best.day] = removeFrom(remaining[best.day], best.interval, best.used)
      used[best.day] += plan.minutes
      placedDays.push(best.day)
      placed += 1
    }

    if (placed < plan.count) {
      unplaced.push({
        habitId: habit.id,
        requested: plan.count,
        placed,
        sessionMinutes: plan.minutes,
      })
    }
  }

  // 手順4: 予備枠。崩れた分をやり直すための枠なので、週の後半に取る
  const reserve = findReserve(remaining)
  if (reserve !== null) {
    slots.push({
      id: createId(),
      weekStart,
      habitId: '',
      dayOfWeek: reserve.day,
      startMinutes: reserve.used.start,
      endMinutes: reserve.used.end,
      isReserve: true,
    })
  }

  return { slots, unplaced, reservePlaced: reserve !== null }
}

/** 残った空きから予備枠を1つ選ぶ。週の後半を優先し、その日で最も長い空きに置く。 */
function findReserve(
  remaining: Interval[][],
): { day: DayOfWeek; used: Interval } | null {
  for (let day = 6; day >= 0; day -= 1) {
    const longest = [...remaining[day]].sort(
      (a, b) => intervalLength(b) - intervalLength(a),
    )[0]
    if (longest === undefined) continue
    const length = Math.min(RESERVE_MINUTES, intervalLength(longest))
    if (length < MIN_FREE_MINUTES) continue
    return {
      day: day as DayOfWeek,
      used: { start: longest.start, end: longest.start + length },
    }
  }
  return null
}

/**
 * 手動で動かした枠が置ける位置かを確かめる。
 * 置けないときは理由を返す。
 */
export function validateSlotPosition(
  slot: PlannedSlot,
  target: { dayOfWeek: DayOfWeek; startMinutes: number },
  context: {
    fixedEvents: FixedEvent[]
    settings: Settings
    slots: PlannedSlot[]
  },
): string | null {
  const length = slot.endMinutes - slot.startMinutes
  const moved: Interval = {
    start: target.startMinutes,
    end: target.startMinutes + length,
  }
  const dayWindow = getDayWindow(context.settings)
  if (moved.start < dayWindow.start || moved.end > dayWindow.end) {
    return '起床から就寝までの時間の中に収めてください'
  }
  const hitsEvent = context.fixedEvents.some(
    (event) =>
      event.dayOfWeek === target.dayOfWeek &&
      intersect(moved, {
        start: event.startMinutes - context.settings.bufferMinutes,
        end: event.endMinutes + context.settings.bufferMinutes,
      }) !== null,
  )
  if (hitsEvent) return '固定予定と重なっています'

  const hitsSlot = context.slots.some(
    (other) =>
      other.id !== slot.id &&
      other.weekStart === slot.weekStart &&
      other.dayOfWeek === target.dayOfWeek &&
      intersect(moved, { start: other.startMinutes, end: other.endMinutes }) !==
        null,
  )
  if (hitsSlot) return 'ほかの枠と重なっています'

  return null
}
