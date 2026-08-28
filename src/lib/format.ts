import type { Habit, Priority } from './types'

/** 分を「1時間30分」のような表示にする。 */
export function formatMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes}分`
  if (minutes === 0) return `${hours}時間`
  return `${hours}時間${minutes}分`
}

/** 0:00 からの分を「7:30」表記にする。 */
export function formatTimeOfDay(minutesFromMidnight: number): string {
  const hours = Math.floor(minutesFromMidnight / 60)
  const minutes = minutesFromMidnight % 60
  return `${hours}:${String(minutes).padStart(2, '0')}`
}

/** 週の目標を「週3回」「週6時間」のように表す。 */
export function formatTarget(habit: Habit): string {
  if (habit.targetType === 'count') return `週${habit.targetValue}回`
  return `週${formatMinutes(habit.targetValue)}`
}

export const PRIORITY_LABELS: Record<Priority, string> = {
  1: '最優先',
  2: '標準',
  3: '余裕があれば',
}
