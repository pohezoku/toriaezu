import { addDays, addWeeks, format, getDay, parseISO, startOfWeek } from 'date-fns'
import type { DayOfWeek, Habit, LogEntry } from './types'

/** 週の始まりは月曜。 */
const WEEK_OPTIONS = { weekStartsOn: 1 } as const

export function toISODate(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

/** その日が属する週の月曜（ISO 日付）。 */
export function getWeekStart(date: Date): string {
  return toISODate(startOfWeek(date, WEEK_OPTIONS))
}

/** 週の月曜から weeks 週ずらした月曜。 */
export function shiftWeek(weekStart: string, weeks: number): string {
  return toISODate(addWeeks(parseISO(weekStart), weeks))
}

/** JS の曜日（0=日）を、このアプリの曜日（0=月）に直す。 */
export function toDayOfWeek(date: Date): DayOfWeek {
  return ((getDay(date) + 6) % 7) as DayOfWeek
}

/** 週の月曜と曜日から、その日の ISO 日付を作る。 */
export function dateOfWeekDay(weekStart: string, day: DayOfWeek): string {
  return toISODate(addDays(parseISO(weekStart), day))
}

/** その週（月〜日）に含まれる記録だけを取り出す。 */
export function logsInWeek(logs: LogEntry[], weekStart: string): LogEntry[] {
  const end = shiftWeek(weekStart, 1)
  return logs.filter((log) => log.date >= weekStart && log.date < end)
}

/** 1回の実施を何分とみなすか。記録が無ければ最低ブロック。 */
function loggedMinutes(log: LogEntry, habit: Habit): number {
  return log.actualMinutes ?? habit.minBlockMinutes
}

/**
 * その週の達成率（1.0 = 目標どおり）。
 * 目標が 0 以下なら 0 を返す。
 */
export function achievementRate(
  habit: Habit,
  logs: LogEntry[],
  weekStart: string,
): number {
  if (habit.targetValue <= 0) return 0
  const done = logsInWeek(logs, weekStart).filter(
    (log) => log.habitId === habit.id && log.status === 'done',
  )
  const achieved =
    habit.targetType === 'count'
      ? done.length
      : done.reduce((sum, log) => sum + loggedMinutes(log, habit), 0)
  return achieved / habit.targetValue
}
