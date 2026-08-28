import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  computeFreeIntervals,
  getDayWindow,
  mergeIntervals,
  subtractIntervals,
  totalMinutes,
} from '../src/lib/schedule.ts'
import type { DayOfWeek, FixedEvent, Settings } from '../src/lib/types.ts'

const settings: Settings = {
  wakeMinutes: 7 * 60,
  sleepMinutes: 23 * 60,
  bufferMinutes: 15,
  maxFillRatio: 0.7,
}

const at = (time: string): number => {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

const ev = (
  dayOfWeek: DayOfWeek,
  start: string,
  end: string,
  label = 'x',
): FixedEvent => ({
  id: `${label}-${dayOfWeek}-${start}`,
  dayOfWeek,
  startMinutes: at(start),
  endMinutes: at(end),
  label,
  category: '授業',
})

test('getDayWindow: 就寝が起床より後ならそのまま', () => {
  assert.deepEqual(getDayWindow(settings), { start: at('7:00'), end: at('23:00') })
})

test('getDayWindow: 就寝が起床より前なら翌日の深夜とみなす', () => {
  assert.deepEqual(getDayWindow({ ...settings, sleepMinutes: at('1:00') }), {
    start: at('7:00'),
    end: at('1:00') + 24 * 60,
  })
})

test('mergeIntervals: 重なりと隣接をまとめる', () => {
  assert.deepEqual(
    mergeIntervals([
      { start: 10, end: 20 },
      { start: 15, end: 25 },
      { start: 40, end: 50 },
    ]),
    [
      { start: 10, end: 25 },
      { start: 40, end: 50 },
    ],
  )
  assert.deepEqual(
    mergeIntervals([
      { start: 10, end: 20 },
      { start: 20, end: 30 },
    ]),
    [{ start: 10, end: 30 }],
  )
})

test('subtractIntervals: 窓からブロックを引く', () => {
  assert.deepEqual(subtractIntervals({ start: 0, end: 100 }, []), [
    { start: 0, end: 100 },
  ])
  assert.deepEqual(
    subtractIntervals({ start: 0, end: 100 }, [{ start: 30, end: 50 }]),
    [
      { start: 0, end: 30 },
      { start: 50, end: 100 },
    ],
  )
  // 窓の外にはみ出すブロックは窓の内側にクランプされる
  assert.deepEqual(
    subtractIntervals({ start: 10, end: 100 }, [{ start: 0, end: 40 }]),
    [{ start: 40, end: 100 }],
  )
  assert.deepEqual(
    subtractIntervals({ start: 10, end: 100 }, [{ start: 80, end: 200 }]),
    [{ start: 10, end: 80 }],
  )
  assert.deepEqual(
    subtractIntervals({ start: 10, end: 100 }, [{ start: 0, end: 200 }]),
    [],
  )
})

test('computeFreeIntervals: 予定の前後にバッファを取る', () => {
  // 9:00-10:30 の授業 + バッファ15分 → 8:45-10:45 が塞がる
  assert.deepEqual(computeFreeIntervals(0, [ev(0, '9:00', '10:30')], settings), [
    { start: at('7:00'), end: at('8:45') },
    { start: at('10:45'), end: at('23:00') },
  ])
})

test('computeFreeIntervals: 30分未満の空きは捨てる', () => {
  assert.deepEqual(
    computeFreeIntervals(0, [ev(0, '7:20', '9:00')], {
      ...settings,
      bufferMinutes: 0,
    }),
    [{ start: at('9:00'), end: at('23:00') }],
  )
})

test('computeFreeIntervals: 予定が重なっていても1つの空きになる', () => {
  assert.deepEqual(
    computeFreeIntervals(
      0,
      [ev(0, '9:00', '11:00'), ev(0, '10:00', '12:00')],
      { ...settings, bufferMinutes: 0 },
    ),
    [
      { start: at('7:00'), end: at('9:00') },
      { start: at('12:00'), end: at('23:00') },
    ],
  )
})

test('computeFreeIntervals: 他の曜日の予定は影響しない', () => {
  assert.deepEqual(computeFreeIntervals(1, [ev(0, '9:00', '10:30')], settings), [
    { start: at('7:00'), end: at('23:00') },
  ])
})

test('設計原則1: 睡眠時間には絶対に配置しない', () => {
  const free = computeFreeIntervals(0, [], settings)
  assert.equal(free[0].start, settings.wakeMinutes)
  assert.equal(free[0].end, settings.sleepMinutes)
  assert.equal(totalMinutes(free), 16 * 60)
})
