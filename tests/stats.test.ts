import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  achievementRate,
  dateOfWeekDay,
  getWeekStart,
  logsInWeek,
  remainingSessions,
  shiftWeek,
  suggestForReserve,
  toDayOfWeek,
  weekProgress,
} from '../src/lib/stats'
import type { Habit, LogEntry, PlannedSlot } from '../src/lib/types'

const WEEK = '2026-08-24' // 月曜

let seq = 0
const habit = (over: Partial<Habit> = {}): Habit => ({
  id: `h${(seq += 1)}`,
  name: `習慣${seq}`,
  category: '学習',
  targetType: 'count',
  targetValue: 3,
  minBlockMinutes: 60,
  timePref: '指定なし',
  priority: 2,
  avoidConsecutiveDays: false,
  active: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...over,
})

const slot = (habitId: string, day: number, over: Partial<PlannedSlot> = {}): PlannedSlot => ({
  id: `s${(seq += 1)}`,
  weekStart: WEEK,
  habitId,
  dayOfWeek: day as 0,
  startMinutes: 600,
  endMinutes: 660,
  isReserve: false,
  ...over,
})

const log = (
  habitId: string,
  date: string,
  status: 'done' | 'skipped' = 'done',
  over: Partial<LogEntry> = {},
): LogEntry => ({
  id: `l${(seq += 1)}`,
  date,
  habitId,
  status,
  ...over,
})

test('getWeekStart: 週の始まりは月曜', () => {
  assert.equal(getWeekStart(new Date('2026-08-24T09:00:00')), WEEK) // 月
  assert.equal(getWeekStart(new Date('2026-08-30T23:59:00')), WEEK) // 日
  assert.equal(getWeekStart(new Date('2026-08-31T00:01:00')), '2026-08-31') // 次の月
})

test('toDayOfWeek: 0=月 になる', () => {
  assert.equal(toDayOfWeek(new Date('2026-08-24T12:00:00')), 0)
  assert.equal(toDayOfWeek(new Date('2026-08-30T12:00:00')), 6)
})

test('dateOfWeekDay / shiftWeek', () => {
  assert.equal(dateOfWeekDay(WEEK, 0), '2026-08-24')
  assert.equal(dateOfWeekDay(WEEK, 6), '2026-08-30')
  assert.equal(shiftWeek(WEEK, -1), '2026-08-17')
  assert.equal(shiftWeek(WEEK, 1), '2026-08-31')
})

test('logsInWeek: 週の外の記録は混ざらない', () => {
  const logs = [
    log('a', '2026-08-23'), // 前の週の日曜
    log('a', '2026-08-24'),
    log('a', '2026-08-30'),
    log('a', '2026-08-31'), // 次の週の月曜
  ]
  assert.deepEqual(
    logsInWeek(logs, WEEK).map((l) => l.date),
    ['2026-08-24', '2026-08-30'],
  )
})

test('achievementRate: 回数目標', () => {
  const h = habit({ targetType: 'count', targetValue: 4 })
  const logs = [
    log(h.id, '2026-08-24'),
    log(h.id, '2026-08-25'),
    log(h.id, '2026-08-26', 'skipped'),
  ]
  assert.equal(achievementRate(h, logs, WEEK), 0.5)
})

test('achievementRate: 分目標は実施時間で測る。記録が無ければ最低ブロック分', () => {
  const h = habit({ targetType: 'minutes', targetValue: 300, minBlockMinutes: 60 })
  const logs = [
    log(h.id, '2026-08-24', 'done', { actualMinutes: 90 }),
    log(h.id, '2026-08-25'), // actualMinutes なし → 60分とみなす
  ]
  assert.equal(achievementRate(h, logs, WEEK), 150 / 300)
})

test('achievementRate: 目標が0なら0を返す（0除算しない）', () => {
  assert.equal(achievementRate(habit({ targetValue: 0 }), [], WEEK), 0)
})

test('weekProgress: 予備枠は計画に数えない', () => {
  const h = habit()
  const slots = [
    slot(h.id, 0),
    slot(h.id, 2),
    slot('', 5, { isReserve: true }),
  ]
  const logs = [log(h.id, '2026-08-24'), log(h.id, '2026-08-26', 'skipped')]
  assert.deepEqual(weekProgress(slots, logs, WEEK), {
    planned: 2,
    done: 1,
    skipped: 1,
    rate: 0.5,
  })
})

test('weekProgress: 計画が無ければ達成率0（0除算しない）', () => {
  assert.equal(weekProgress([], [], WEEK).rate, 0)
})

test('remainingSessions: 計画 − 実施。スキップは残りとして数える', () => {
  const h = habit()
  const slots = [slot(h.id, 0), slot(h.id, 2), slot(h.id, 4)]
  const logs = [log(h.id, '2026-08-24'), log(h.id, '2026-08-26', 'skipped')]
  assert.equal(remainingSessions(h, slots, logs, WEEK), 2)
})

test('remainingSessions: 予定より多くやってもマイナスにならない', () => {
  const h = habit()
  const logs = [log(h.id, '2026-08-24'), log(h.id, '2026-08-25')]
  assert.equal(remainingSessions(h, [slot(h.id, 0)], logs, WEEK), 0)
})

test('suggestForReserve: 未消化が多いものを提案する', () => {
  const few = habit({ name: '少し残り' })
  const many = habit({ name: 'たくさん残り' })
  const slots = [
    slot(few.id, 0),
    slot(few.id, 1),
    slot(many.id, 2),
    slot(many.id, 3),
    slot(many.id, 4),
  ]
  const logs = [log(few.id, '2026-08-24')]
  const suggested = suggestForReserve([few, many], slots, logs, WEEK, 60)
  assert.equal(suggested?.id, many.id)
})

test('suggestForReserve: 予備枠に収まらない習慣は提案しない', () => {
  const long = habit({ minBlockMinutes: 120 })
  const slots = [slot(long.id, 0)]
  assert.equal(suggestForReserve([long], slots, [], WEEK, 60), null)
})

test('suggestForReserve: 停止中の習慣は提案しない', () => {
  const paused = habit({ active: false })
  assert.equal(suggestForReserve([paused], [slot(paused.id, 0)], [], WEEK, 60), null)
})

test('suggestForReserve: 全部消化できていれば提案しない', () => {
  const h = habit()
  const logs = [log(h.id, '2026-08-24')]
  assert.equal(suggestForReserve([h], [slot(h.id, 0)], logs, WEEK, 60), null)
})
