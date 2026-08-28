import { formatMinutes } from './format'
import { sessionPlan } from './plan'
import { bandOf, DAY_LABELS } from './schedule'
import { achievementRate, logsInWeek, shiftWeek } from './stats'
import type {
  AvoidSlot,
  DayOfWeek,
  DismissedSuggestion,
  Habit,
  LogEntry,
  PlannedSlot,
  Settings,
} from './types'

/** 目標を下げる提案を出す達成率の境目。 */
export const LOW_RATE = 0.7
/** 何週連続で下回ったら下げる提案を出すか。 */
export const LOW_WEEKS = 2
/** 何週連続で達成したら上げる提案を出すか。 */
export const HIGH_WEEKS = 4
/** 同じ枠で何回スキップされたら枠を変える提案を出すか。 */
export const SKIP_THRESHOLD = 3
/** スキップを数えるさかのぼり週数。 */
export const SKIP_LOOKBACK_WEEKS = 4

export type SuggestionKind = 'lowerTarget' | 'raiseTarget' | 'avoidSlot'

export interface Suggestion {
  /**
   * 提案の「規則」を表す鍵。値ではなく規則で見分ける。
   * 目標を1段階変えた直後に、同じ規則がまた発火して連鎖するのを防ぐため、
   * 承認・見送りのどちらもこの鍵で記録する。
   */
  key: string
  kind: SuggestionKind
  habitId: string
  /** ユーザーに見せる問いかけ。 */
  message: string
  /** 目標を変える提案のときの新しい目標値。 */
  nextTargetValue?: number
  /** 枠を変える提案のときに避ける枠。 */
  avoid?: AvoidSlot
}

export interface SuggestInput {
  habits: Habit[]
  plannedSlots: PlannedSlot[]
  logs: LogEntry[]
  settings: Settings
  /** どの週の終わりとして見るか（その週を含めて過去にさかのぼる）。 */
  weekStart: string
  dismissed?: DismissedSuggestion[]
}

/** その週に計画または記録があるか。データの無い週を「達成率0%の週」と数えないため。 */
export function weekHasData(
  weekStart: string,
  plannedSlots: PlannedSlot[],
  logs: LogEntry[],
): boolean {
  return (
    plannedSlots.some((slot) => slot.weekStart === weekStart) ||
    logsInWeek(logs, weekStart).length > 0
  )
}

/**
 * データのある週だけを新しい順に取り、その達成率を返す。
 * さかのぼる範囲は count 週ぶんが埋まるまで、最大 count * 3 週。
 */
export function recentRates(
  habit: Habit,
  input: Pick<SuggestInput, 'plannedSlots' | 'logs' | 'weekStart'>,
  count: number,
): number[] {
  const rates: number[] = []
  let week = input.weekStart
  for (let step = 0; step < count * 3 && rates.length < count; step += 1) {
    if (weekHasData(week, input.plannedSlots, input.logs)) {
      rates.push(achievementRate(habit, input.logs, week))
    }
    week = shiftWeek(week, -1)
  }
  return rates
}

/** 目標を1段階（＝1回ぶん）変えた値。回数なら±1回、分なら±1セッション。 */
export function stepTarget(habit: Habit, direction: -1 | 1): number | null {
  if (habit.targetType === 'count') {
    const next = habit.targetValue + direction
    return next >= 1 ? next : null
  }
  const step = sessionPlan(habit).minutes
  const next = habit.targetValue + direction * step
  return next >= step ? next : null
}

function targetText(habit: Habit, value: number): string {
  return habit.targetType === 'count'
    ? `週${value}回`
    : `週${formatMinutes(value)}`
}

/** 同じ (曜日, 時間帯) でスキップされた回数を数える。 */
export function countSkips(
  habit: Habit,
  input: Pick<SuggestInput, 'plannedSlots' | 'logs' | 'settings' | 'weekStart'>,
): Map<string, { slot: AvoidSlot; count: number }> {
  const slotById = new Map(input.plannedSlots.map((slot) => [slot.id, slot]))
  const counts = new Map<string, { slot: AvoidSlot; count: number }>()
  const oldest = shiftWeek(input.weekStart, -(SKIP_LOOKBACK_WEEKS - 1))
  const newest = shiftWeek(input.weekStart, 1)

  for (const log of input.logs) {
    if (log.habitId !== habit.id || log.status !== 'skipped') continue
    if (log.date < oldest || log.date >= newest) continue
    const slot = log.slotId === undefined ? undefined : slotById.get(log.slotId)
    if (slot === undefined) continue
    const avoid: AvoidSlot = {
      dayOfWeek: slot.dayOfWeek,
      band: bandOf(slot.startMinutes, input.settings),
    }
    const key = `${avoid.dayOfWeek}:${avoid.band}`
    const current = counts.get(key)
    if (current === undefined) counts.set(key, { slot: avoid, count: 1 })
    else current.count += 1
  }
  return counts
}

function isAlreadyAvoided(habit: Habit, avoid: AvoidSlot): boolean {
  return (habit.avoidSlots ?? []).some(
    (slot) => slot.dayOfWeek === avoid.dayOfWeek && slot.band === avoid.band,
  )
}

/**
 * 翌週への修正提案（設計図5章）。
 * 提案するだけで、目標は書き換えない。反映はユーザーの承認を経る（設計原則5）。
 */
export function computeSuggestions(input: SuggestInput): Suggestion[] {
  const dismissed = new Set(
    (input.dismissed ?? [])
      .filter((entry) => entry.weekStart === input.weekStart)
      .map((entry) => entry.key),
  )
  const suggestions: Suggestion[] = []

  for (const habit of input.habits) {
    if (!habit.active) continue

    // 目標を下げる：2週連続で達成率が LOW_RATE 未満
    const lowRates = recentRates(habit, input, LOW_WEEKS)
    if (
      lowRates.length === LOW_WEEKS &&
      lowRates.every((rate) => rate < LOW_RATE)
    ) {
      const next = stepTarget(habit, -1)
      if (next !== null) {
        suggestions.push({
          key: `target:${habit.id}`,
          kind: 'lowerTarget',
          habitId: habit.id,
          nextTargetValue: next,
          message: `${habit.name}は${LOW_WEEKS}週続けて目標に届いていません。${targetText(habit, next)}に下げますか？`,
        })
      }
    } else {
      // 目標を上げる：4週連続で達成率100%
      const highRates = recentRates(habit, input, HIGH_WEEKS)
      if (
        highRates.length === HIGH_WEEKS &&
        highRates.every((rate) => rate >= 1)
      ) {
        const next = stepTarget(habit, 1)
        if (next !== null) {
          suggestions.push({
            key: `target:${habit.id}`,
            kind: 'raiseTarget',
            habitId: habit.id,
            nextTargetValue: next,
            message: `${habit.name}は${HIGH_WEEKS}週続けて目標を達成しています。${targetText(habit, next)}に増やしますか？`,
          })
        }
      }
    }

    // 枠を変える：同じ曜日・時間帯でスキップが続いている
    for (const { slot, count } of countSkips(habit, input).values()) {
      if (count < SKIP_THRESHOLD || isAlreadyAvoided(habit, slot)) continue
      suggestions.push({
        key: `avoid:${habit.id}:${slot.dayOfWeek}:${slot.band}`,
        kind: 'avoidSlot',
        habitId: habit.id,
        avoid: slot,
        message: `${DAY_LABELS[slot.dayOfWeek as DayOfWeek]}曜の${slot.band}は${count}回スキップされています。来週は避けて配置しますか？`,
      })
    }
  }

  return suggestions.filter((suggestion) => !dismissed.has(suggestion.key))
}

/** 提案を習慣に反映した結果を返す。元の習慣は変更しない。 */
export function applySuggestion(habit: Habit, suggestion: Suggestion): Habit {
  if (suggestion.kind === 'avoidSlot' && suggestion.avoid !== undefined) {
    if (isAlreadyAvoided(habit, suggestion.avoid)) return habit
    return {
      ...habit,
      avoidSlots: [...(habit.avoidSlots ?? []), suggestion.avoid],
    }
  }
  if (suggestion.nextTargetValue !== undefined) {
    return { ...habit, targetValue: suggestion.nextTargetValue }
  }
  return habit
}
