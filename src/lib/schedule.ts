import type { DayOfWeek, FixedEvent, Settings } from './types'

/** 分単位の区間。end は含まない。 */
export interface Interval {
  start: number
  end: number
}

/** これ未満の空きは使わない（設計図4章の手順1）。 */
export const MIN_FREE_MINUTES = 30

export const DAYS: DayOfWeek[] = [0, 1, 2, 3, 4, 5, 6]
export const DAY_LABELS = ['月', '火', '水', '木', '金', '土', '日'] as const

export function intervalLength(interval: Interval): number {
  return interval.end - interval.start
}

export function totalMinutes(intervals: Interval[]): number {
  return intervals.reduce((sum, interval) => sum + intervalLength(interval), 0)
}

/**
 * 1日の活動可能な時間帯 [起床, 就寝]。
 * 就寝が起床より前の時刻なら「翌日の深夜」と解釈し、24時間ぶんを足す。
 * 設計原則1により、この外側はいかなる計算にも使わない。
 */
export function getDayWindow(settings: Settings): Interval {
  const start = settings.wakeMinutes
  const end =
    settings.sleepMinutes > settings.wakeMinutes
      ? settings.sleepMinutes
      : settings.sleepMinutes + 24 * 60
  return { start, end }
}

/** 重なり合う区間をひとつにまとめる。入力は破壊しない。 */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => a.start - b.start)
  const merged: Interval[] = []
  for (const interval of sorted) {
    const last = merged[merged.length - 1]
    if (last !== undefined && interval.start <= last.end) {
      last.end = Math.max(last.end, interval.end)
    } else {
      merged.push({ ...interval })
    }
  }
  return merged
}

/** base から blocks を差し引いた残りを返す。 */
export function subtractIntervals(
  base: Interval,
  blocks: Interval[],
): Interval[] {
  const result: Interval[] = []
  let cursor = base.start
  for (const block of mergeIntervals(blocks)) {
    if (block.end <= cursor) continue
    if (block.start >= base.end) break
    if (block.start > cursor) {
      result.push({ start: cursor, end: Math.min(block.start, base.end) })
    }
    cursor = Math.max(cursor, block.end)
    if (cursor >= base.end) break
  }
  if (cursor < base.end) result.push({ start: cursor, end: base.end })
  return result
}

/** その曜日の固定予定を、前後にバッファを付けた「塞がっている区間」に変える。 */
export function getBlockedIntervals(
  dayOfWeek: DayOfWeek,
  fixedEvents: FixedEvent[],
  settings: Settings,
): Interval[] {
  return fixedEvents
    .filter((event) => event.dayOfWeek === dayOfWeek)
    .map((event) => ({
      start: event.startMinutes - settings.bufferMinutes,
      end: event.endMinutes + settings.bufferMinutes,
    }))
}

/**
 * その曜日の空き枠を求める。
 * [起床, 就寝] から固定予定（前後バッファ込み）を除き、30分未満は捨てる。
 */
export function computeFreeIntervals(
  dayOfWeek: DayOfWeek,
  fixedEvents: FixedEvent[],
  settings: Settings,
): Interval[] {
  const window = getDayWindow(settings)
  const blocked = getBlockedIntervals(dayOfWeek, fixedEvents, settings)
  return subtractIntervals(window, blocked).filter(
    (interval) => intervalLength(interval) >= MIN_FREE_MINUTES,
  )
}

/** 月〜日ぶんの空き枠。添字が曜日に対応する。 */
export function computeWeekFreeIntervals(
  fixedEvents: FixedEvent[],
  settings: Settings,
): Interval[][] {
  return DAYS.map((day) => computeFreeIntervals(day, fixedEvents, settings))
}
