import type { Habit, Priority } from './types'

/** 分を「1時間30分」のような表示にする。 */
export function formatMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes}分`
  if (minutes === 0) return `${hours}時間`
  return `${hours}時間${minutes}分`
}

/** 分を「16.5h」のような短い表記にする。狭い場所用。 */
export function formatHoursShort(totalMinutes: number): string {
  const hours = totalMinutes / 60
  const rounded = Math.round(hours * 10) / 10
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}h`
}

/**
 * 0:00 からの分を「7:30」表記にする。
 * 24時間を超える値は翌日の時刻とみなし「翌1:00」と表す。
 */
export function formatTimeOfDay(minutesFromMidnight: number): string {
  const nextDay = minutesFromMidnight >= 24 * 60
  const wrapped = minutesFromMidnight % (24 * 60)
  const hours = Math.floor(wrapped / 60)
  const minutes = wrapped % 60
  return `${nextDay ? '翌' : ''}${hours}:${String(minutes).padStart(2, '0')}`
}

/** <input type="time"> 用の "07:30" 表記にする。 */
export function toTimeInputValue(minutesFromMidnight: number): string {
  const wrapped = minutesFromMidnight % (24 * 60)
  const hours = Math.floor(wrapped / 60)
  const minutes = wrapped % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

/** "07:30" を 0:00 からの分に直す。読めなければ null。 */
export function parseTimeInputValue(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value)
  if (match === null) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
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
