import { addDays, addWeeks, format, getDay, parseISO, startOfWeek } from 'date-fns'
import type { DayOfWeek, Habit, LogEntry, PlannedSlot } from './types'

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

/** その週の計画に対する進み具合。主指標は週単位の達成率（設計原則3）。 */
export interface WeekProgress {
  planned: number
  done: number
  skipped: number
  /** 実施 / 計画。計画が無ければ 0。 */
  rate: number
}

export function weekProgress(
  slots: PlannedSlot[],
  logs: LogEntry[],
  weekStart: string,
): WeekProgress {
  const planned = slots.filter(
    (slot) => slot.weekStart === weekStart && !slot.isReserve,
  ).length
  const weekLogs = logsInWeek(logs, weekStart)
  const done = weekLogs.filter((log) => log.status === 'done').length
  const skipped = weekLogs.filter((log) => log.status === 'skipped').length
  return { planned, done, skipped, rate: planned === 0 ? 0 : done / planned }
}

/** その週、まだ実施できていない回数（計画 − 実施）。 */
export function remainingSessions(
  habit: Habit,
  slots: PlannedSlot[],
  logs: LogEntry[],
  weekStart: string,
): number {
  const planned = slots.filter(
    (slot) =>
      slot.weekStart === weekStart && !slot.isReserve && slot.habitId === habit.id,
  ).length
  const done = logsInWeek(logs, weekStart).filter(
    (log) => log.habitId === habit.id && log.status === 'done',
  ).length
  return Math.max(0, planned - done)
}

/**
 * 予備枠に提案する習慣を選ぶ。
 * 未消化が多いものを優先し、同数なら優先度の高いものを選ぶ。
 * 予備枠の長さに収まらない習慣は提案しない。
 */
export function suggestForReserve(
  habits: Habit[],
  slots: PlannedSlot[],
  logs: LogEntry[],
  weekStart: string,
  reserveMinutes: number,
): Habit | null {
  const candidates = habits
    .filter((habit) => habit.active && habit.minBlockMinutes <= reserveMinutes)
    .map((habit) => ({
      habit,
      remaining: remainingSessions(habit, slots, logs, weekStart),
    }))
    .filter((entry) => entry.remaining > 0)
    .sort(
      (a, b) =>
        b.remaining - a.remaining ||
        a.habit.priority - b.habit.priority ||
        a.habit.createdAt.localeCompare(b.habit.createdAt),
    )
  return candidates[0]?.habit ?? null
}
