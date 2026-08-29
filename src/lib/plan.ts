import { createId } from './storage'
import { achievementRate, shiftWeek } from './stats'
import {
  bandOf,
  computeWeekFreeIntervals,
  DAYS,
  EVENING_START,
  MORNING_END,
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
      return { start: dayWindow.start, end: Math.min(MORNING_END, dayWindow.end) }
    case '昼':
      return {
        start: Math.max(MORNING_END, dayWindow.start),
        end: Math.min(EVENING_START, dayWindow.end),
      }
    case '夜':
      return { start: Math.max(EVENING_START, dayWindow.start), end: dayWindow.end }
    default:
      return dayWindow
  }
}

function intersect(a: Interval, b: Interval): Interval | null {
  const start = Math.max(a.start, b.start)
  const end = Math.min(a.end, b.end)
  return end > start ? { start, end } : null
}

/** interval から blocked の区間を取り除いた残り。短すぎる断片は捨てる。 */
function removeFrom(
  intervals: Interval[],
  target: Interval,
  blocked: Interval,
): Interval[] {
  const result: Interval[] = []
  for (const interval of intervals) {
    if (interval !== target) {
      result.push(interval)
      continue
    }
    const before = { start: interval.start, end: blocked.start }
    const after = { start: blocked.end, end: interval.end }
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
  // 手順3: 1日に置ける合計の上限（設計原則2）。
  // 空き時間の maxFillRatio と、1日あたりの絶対値の、厳しいほうを使う。
  // 空きが多い人には割合だけでは歯止めにならないため。
  // 設定が欠けていても上限が黙って消えないようにする
  const dailyCap = Number.isFinite(settings.maxDailyHabitMinutes)
    ? settings.maxDailyHabitMinutes
    : Number.POSITIVE_INFINITY
  const capacity = freeByDay.map((intervals) =>
    Math.min(totalMinutes(intervals) * settings.maxFillRatio, dailyCap),
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

  /** 配置の途中経過。習慣ごとに持つ。 */
  interface Entry {
    habit: Habit
    plan: SessionPlan
    pref: Interval
    /** 同じ習慣を1日に置ける回数。原則1日1回。 */
    maxPerDay: number
    placedDays: number[]
    placed: number
    /** もう置ける場所が無いと分かったか。 */
    stuck: boolean
  }

  const entries: Entry[] = ordered.map((habit) => {
    const plan = sessionPlan(habit)
    return {
      habit,
      plan,
      pref: preferredWindow(habit.timePref, settings),
      maxPerDay: Math.max(1, Math.ceil(plan.count / DAYS.length)),
      placedDays: [],
      placed: 0,
      stuck: plan.count === 0,
    }
  })

  /** 1回ぶんの置き場所を探す。見つからなければ null。 */
  const findSpot = (entry: Entry): Candidate | null => {
    const { habit, plan, pref } = entry
    const avoiding = habit.avoidSlots ?? []
    let best: Candidate | null = null

    for (const day of DAYS) {
      if (used[day] + plan.minutes > capacity[day]) continue
      if (
        habit.avoidConsecutiveDays &&
        entry.placedDays.some((other) => Math.abs(other - day) <= 1)
      ) {
        continue
      }
      const sameDay = entry.placedDays.filter((other) => other === day).length
      if (sameDay >= entry.maxPerDay) continue

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
        // 承認済みの「避ける枠」は最後の手段にする（他に置けなければ置く）
        const avoidHit = avoiding.some(
          (slot) =>
            slot.dayOfWeek === day && slot.band === bandOf(start, settings),
        )
          ? 1
          : 0
        const candidate: Candidate = {
          day,
          interval,
          used: { start, end: start + plan.minutes },
          score: [
            avoidHit,
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
    return best
  }

  // 習慣ごとにまとめて置くのではなく、1回ぶんずつ順番に置いていく。
  // 優先度の高い習慣が上限を食い尽くして、他が1回も置けないのを防ぐため。
  const maxSessions = entries.reduce(
    (most, entry) => Math.max(most, entry.plan.count),
    0,
  )
  for (let round = 0; round < maxSessions; round += 1) {
    for (const entry of entries) {
      if (entry.stuck || entry.placed >= entry.plan.count) continue
      const best = findSpot(entry)
      if (best === null) {
        // 空きは減る一方なので、一度置けなければこの先も置けない
        entry.stuck = true
        continue
      }
      slots.push({
        id: createId(),
        weekStart,
        habitId: entry.habit.id,
        dayOfWeek: best.day,
        startMinutes: best.used.start,
        endMinutes: best.used.end,
        isReserve: false,
      })
      // 枠の前後にも余白を取る。予定を壁のように連続させないため
      remaining[best.day] = removeFrom(remaining[best.day], best.interval, {
        start: best.used.start - settings.bufferMinutes,
        end: best.used.end + settings.bufferMinutes,
      })
      used[best.day] += entry.plan.minutes
      entry.placedDays.push(best.day)
      entry.placed += 1
    }
  }

  for (const entry of entries) {
    if (entry.placed < entry.plan.count) {
      unplaced.push({
        habitId: entry.habit.id,
        requested: entry.plan.count,
        placed: entry.placed,
        sessionMinutes: entry.plan.minutes,
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
