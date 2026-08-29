import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  autoPlan,
  preferredWindow,
  sessionPlan,
  validateSlotPosition,
} from '../src/lib/plan'
import { computeWeekFreeIntervals, getDayWindow } from '../src/lib/schedule'
import type {
  DayOfWeek,
  FixedEvent,
  Habit,
  LogEntry,
  PlannedSlot,
  Settings,
} from '../src/lib/types'

const WEEK = '2026-08-24' // 月曜

const settings: Settings = {
  wakeMinutes: 7 * 60,
  sleepMinutes: 23 * 60,
  bufferMinutes: 15,
  maxFillRatio: 0.7,
  maxDailyHabitMinutes: 3 * 60,
}

const at = (time: string): number => {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

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
  createdAt: `2026-01-0${(seq % 9) + 1}T00:00:00.000Z`,
  ...over,
})

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

const run = (
  habits: Habit[],
  fixedEvents: FixedEvent[] = [],
  over: Partial<Settings> = {},
  logs: LogEntry[] = [],
) =>
  autoPlan({
    weekStart: WEEK,
    habits,
    fixedEvents,
    settings: { ...settings, ...over },
    logs,
  })

test('sessionPlan: 回数目標はそのまま回数になる', () => {
  assert.deepEqual(
    sessionPlan(habit({ targetType: 'count', targetValue: 3, minBlockMinutes: 45 })),
    { count: 3, minutes: 45 },
  )
})

test('sessionPlan: 分目標は最低ブロックに近い長さに割る', () => {
  assert.deepEqual(
    sessionPlan(habit({ targetType: 'minutes', targetValue: 360, minBlockMinutes: 60 })),
    { count: 6, minutes: 60 },
  )
  // 300分を90分ブロックで → 3回 × 100分（合計はちょうど300分）
  assert.deepEqual(
    sessionPlan(habit({ targetType: 'minutes', targetValue: 300, minBlockMinutes: 90 })),
    { count: 3, minutes: 100 },
  )
  // 目標が最低ブロックより短くても、1回は最低ブロックぶん取る
  assert.deepEqual(
    sessionPlan(habit({ targetType: 'minutes', targetValue: 30, minBlockMinutes: 60 })),
    { count: 1, minutes: 60 },
  )
})

test('目標の回数ぶんの枠が、別々の日に置かれる', () => {
  const h = habit({ targetValue: 3, minBlockMinutes: 60 })
  const { slots, unplaced } = run([h])
  const placed = slots.filter((slot) => !slot.isReserve)
  assert.equal(placed.length, 3)
  assert.deepEqual(unplaced, [])
  assert.equal(new Set(placed.map((slot) => slot.dayOfWeek)).size, 3)
  for (const slot of placed) {
    assert.equal(slot.endMinutes - slot.startMinutes, 60)
    assert.equal(slot.habitId, h.id)
    assert.equal(slot.weekStart, WEEK)
  }
})

test('設計原則1: 睡眠時間の外側には絶対に置かない', () => {
  const dayWindow = getDayWindow(settings)
  const { slots } = run([habit({ targetValue: 7, minBlockMinutes: 90 })])
  for (const slot of slots) {
    assert.ok(slot.startMinutes >= dayWindow.start, '起床より前に置かれた')
    assert.ok(slot.endMinutes <= dayWindow.end, '就寝より後に置かれた')
  }
})

test('固定予定（前後のバッファ込み）には重ならない', () => {
  const events = [ev(0, '9:00', '12:00'), ev(1, '13:00', '18:00')]
  const { slots } = run([habit({ targetValue: 7, minBlockMinutes: 60 })], events)
  for (const slot of slots) {
    for (const event of events.filter((e) => e.dayOfWeek === slot.dayOfWeek)) {
      const blockedStart = event.startMinutes - settings.bufferMinutes
      const blockedEnd = event.endMinutes + settings.bufferMinutes
      assert.ok(
        slot.endMinutes <= blockedStart || slot.startMinutes >= blockedEnd,
        `${event.label} と重なった`,
      )
    }
  }
})

test('希望時間帯が「朝」なら 11:00 までに置かれる', () => {
  const { slots } = run([
    habit({ targetValue: 5, minBlockMinutes: 60, timePref: '朝' }),
  ])
  for (const slot of slots.filter((s) => !s.isReserve)) {
    assert.ok(slot.endMinutes <= at('11:00'), `朝に置かれていない: ${slot.startMinutes}`)
  }
})

test('希望時間帯が「夜」なら 17:00 以降に置かれる', () => {
  const { slots } = run([
    habit({ targetValue: 4, minBlockMinutes: 60, timePref: '夜' }),
  ])
  for (const slot of slots.filter((s) => !s.isReserve)) {
    assert.ok(slot.startMinutes >= at('17:00'), `夜に置かれていない: ${slot.startMinutes}`)
  }
})

test('preferredWindow: 起床が遅いと「朝」の枠は消える', () => {
  const late = { ...settings, wakeMinutes: at('12:00') }
  const morning = preferredWindow('朝', late)
  assert.ok(morning.end <= morning.start, '空の区間になるはず')
})

test('avoidConsecutiveDays: 同じ習慣が連日に置かれない', () => {
  const { slots } = run([
    habit({ targetValue: 3, minBlockMinutes: 60, avoidConsecutiveDays: true }),
  ])
  const days = slots
    .filter((slot) => !slot.isReserve)
    .map((slot) => slot.dayOfWeek)
    .sort((a, b) => a - b)
  assert.equal(days.length, 3)
  for (let i = 1; i < days.length; i += 1) {
    assert.ok(days[i] - days[i - 1] >= 2, `連日に置かれた: ${days.join(',')}`)
  }
})

/** 曜日ごとの、習慣に使っている合計時間。 */
const minutesPerDay = (slots: PlannedSlot[]) => {
  const perDay = new Map<number, number>()
  for (const slot of slots.filter((s) => !s.isReserve)) {
    perDay.set(
      slot.dayOfWeek,
      (perDay.get(slot.dayOfWeek) ?? 0) + slot.endMinutes - slot.startMinutes,
    )
  }
  return perDay
}

test('設計原則2: 1日の配置合計が空き時間 × maxFillRatio を超えない', () => {
  const freeByDay = computeWeekFreeIntervals([], settings)
  // 空きが少ない日を作り、割合のほうが厳しくなる状況にする
  const events = ([0, 1, 2, 3, 4, 5, 6] as DayOfWeek[]).map((day) =>
    ev(day, '9:00', '22:00', 'ふさぐ'),
  )
  const { slots } = run([habit({ targetValue: 7, minBlockMinutes: 30, priority: 1 })], events)
  for (const [day, minutes] of minutesPerDay(slots)) {
    const free = freeByDay[day].reduce((sum, i) => sum + (i.end - i.start), 0)
    assert.ok(
      minutes <= free * settings.maxFillRatio,
      `${day}曜: ${minutes}分 が割合の上限を超えた`,
    )
  }
})

test('設計原則2: 空きが多い日でも、1日に習慣へ使う上限を超えない', () => {
  // 空きは1日16時間。割合だけなら11時間以上置けてしまう状況
  const { slots } = run([
    habit({ targetValue: 40, minBlockMinutes: 60, priority: 1 }),
    habit({ targetValue: 40, minBlockMinutes: 30, priority: 2 }),
  ])
  for (const [day, minutes] of minutesPerDay(slots)) {
    assert.ok(
      minutes <= settings.maxDailyHabitMinutes,
      `${day}曜: ${minutes}分 > 上限${settings.maxDailyHabitMinutes}分`,
    )
  }
})

test('枠と枠のあいだに余白が空く（壁のように連続させない）', () => {
  const { slots } = run([
    habit({ targetValue: 7, minBlockMinutes: 60, priority: 1 }),
    habit({ targetValue: 7, minBlockMinutes: 30, priority: 2 }),
    habit({ targetValue: 7, minBlockMinutes: 45, priority: 3 }),
  ])
  for (const day of [0, 1, 2, 3, 4, 5, 6]) {
    const onDay = slots
      .filter((slot) => slot.dayOfWeek === day)
      .sort((a, b) => a.startMinutes - b.startMinutes)
    for (let i = 1; i < onDay.length; i += 1) {
      assert.ok(
        onDay[i].startMinutes - onDay[i - 1].endMinutes >= settings.bufferMinutes,
        `${day}曜で枠が連続した: ${onDay[i - 1].endMinutes} → ${onDay[i].startMinutes}`,
      )
    }
  }
})

test('同じ習慣を1日に何度も置かない', () => {
  const h = habit({ targetValue: 5, minBlockMinutes: 30 })
  const { slots } = run([h])
  const perDay = new Map<number, number>()
  for (const slot of slots.filter((s) => s.habitId === h.id)) {
    perDay.set(slot.dayOfWeek, (perDay.get(slot.dayOfWeek) ?? 0) + 1)
  }
  for (const [day, count] of perDay) {
    assert.equal(count, 1, `${day}曜に${count}回置かれた`)
  }
})

test('週7回を超える目標なら、1日2回までは許す', () => {
  const h = habit({ targetValue: 10, minBlockMinutes: 30 })
  const { slots } = run([h])
  const perDay = new Map<number, number>()
  for (const slot of slots.filter((s) => s.habitId === h.id)) {
    perDay.set(slot.dayOfWeek, (perDay.get(slot.dayOfWeek) ?? 0) + 1)
  }
  assert.equal(slots.filter((s) => s.habitId === h.id).length, 10)
  for (const [day, count] of perDay) {
    assert.ok(count <= 2, `${day}曜に${count}回置かれた`)
  }
})

test('設計原則6: 入りきらない分は詰め込まず、未配置として返す', () => {
  // 週50回 × 120分 = 6000分。空きの70%（4704分）を大きく超える
  const { slots, unplaced } = run([
    habit({ targetValue: 50, minBlockMinutes: 120, priority: 1 }),
  ])
  assert.equal(unplaced.length, 1)
  assert.equal(unplaced[0].requested, 50)
  assert.ok(unplaced[0].placed < 50, '全部置けてしまっている')
  assert.equal(unplaced[0].placed, slots.filter((s) => !s.isReserve).length)
  assert.equal(unplaced[0].sessionMinutes, 120)
})

test('目標が1日の上限に収まるなら未配置は出ない', () => {
  const { unplaced } = run([habit({ targetValue: 5, minBlockMinutes: 60 })])
  assert.deepEqual(unplaced, [])
})

test('枠どうしが重ならない', () => {
  const { slots } = run([
    habit({ targetValue: 5, minBlockMinutes: 60 }),
    habit({ targetValue: 4, minBlockMinutes: 90 }),
    habit({ targetValue: 3, minBlockMinutes: 30, timePref: '朝' }),
  ])
  for (const day of [0, 1, 2, 3, 4, 5, 6]) {
    const onDay = slots
      .filter((slot) => slot.dayOfWeek === day)
      .sort((a, b) => a.startMinutes - b.startMinutes)
    for (let i = 1; i < onDay.length; i += 1) {
      assert.ok(
        onDay[i].startMinutes >= onDay[i - 1].endMinutes,
        `${day}曜で枠が重なった`,
      )
    }
  }
})

test('予備枠が1つ確保され、習慣は割り当てられていない', () => {
  const { slots, reservePlaced } = run([habit({ targetValue: 3 })])
  const reserves = slots.filter((slot) => slot.isReserve)
  assert.equal(reservePlaced, true)
  assert.equal(reserves.length, 1)
  assert.equal(reserves[0].habitId, '')
  assert.ok(reserves[0].endMinutes - reserves[0].startMinutes >= 30)
})

test('優先度の高い習慣が先に枠を取る', () => {
  // 1日ぶんしか空きがない状況を作る（火〜日を終日埋める）
  const events = ([1, 2, 3, 4, 5, 6] as DayOfWeek[]).map((day) =>
    ev(day, '7:00', '23:00', 'ふさぐ'),
  )
  const low = habit({ name: '低', priority: 3, targetValue: 5, minBlockMinutes: 120 })
  const high = habit({ name: '高', priority: 1, targetValue: 5, minBlockMinutes: 120 })
  const { slots } = run([low, high], events)
  const placed = slots.filter((slot) => !slot.isReserve)
  assert.ok(placed.length > 0)
  assert.ok(
    placed.filter((slot) => slot.habitId === high.id).length >
      placed.filter((slot) => slot.habitId === low.id).length,
    '優先度の高い方が多く置かれるはず',
  )
})

test('同じ優先度なら、先週の達成率が低い習慣が先に置かれる', () => {
  const events = ([1, 2, 3, 4, 5, 6] as DayOfWeek[]).map((day) =>
    ev(day, '7:00', '23:00', 'ふさぐ'),
  )
  const struggling = habit({ name: '苦手', targetValue: 4, minBlockMinutes: 150 })
  const doingWell = habit({ name: '順調', targetValue: 4, minBlockMinutes: 150 })
  // 先週（2026-08-17 の週）は doingWell だけ実施している
  const logs: LogEntry[] = [
    { id: 'l1', date: '2026-08-18', habitId: doingWell.id, status: 'done' },
    { id: 'l2', date: '2026-08-19', habitId: doingWell.id, status: 'done' },
    { id: 'l3', date: '2026-08-20', habitId: doingWell.id, status: 'done' },
  ]
  const { slots } = run([doingWell, struggling], events, {}, logs)
  const placed = slots.filter((slot) => !slot.isReserve)
  assert.ok(placed.length > 0)
  assert.equal(placed[0].habitId, struggling.id)
})

test('停止中の習慣は配置しない', () => {
  const paused = habit({ active: false, targetValue: 3 })
  const { slots } = run([paused])
  assert.equal(slots.filter((slot) => !slot.isReserve).length, 0)
})

test('validateSlotPosition: 窓の外・固定予定・他の枠との重なりを弾く', () => {
  const slot = {
    id: 's1',
    weekStart: WEEK,
    habitId: 'h',
    dayOfWeek: 0 as DayOfWeek,
    startMinutes: at('19:00'),
    endMinutes: at('20:00'),
    isReserve: false,
  }
  const other = { ...slot, id: 's2', startMinutes: at('15:00'), endMinutes: at('16:00') }
  const context = {
    fixedEvents: [ev(0, '9:00', '10:30')],
    settings,
    slots: [slot, other],
  }
  assert.equal(
    validateSlotPosition(slot, { dayOfWeek: 0, startMinutes: at('13:00') }, context),
    null,
  )
  assert.match(
    validateSlotPosition(slot, { dayOfWeek: 0, startMinutes: at('6:00') }, context) ?? '',
    /起床から就寝/,
  )
  assert.match(
    validateSlotPosition(slot, { dayOfWeek: 0, startMinutes: at('22:30') }, context) ?? '',
    /起床から就寝/,
  )
  assert.match(
    validateSlotPosition(slot, { dayOfWeek: 0, startMinutes: at('10:00') }, context) ?? '',
    /固定予定/,
  )
  // バッファ（15分）の中に入る位置も弾く
  assert.match(
    validateSlotPosition(slot, { dayOfWeek: 0, startMinutes: at('10:40') }, context) ?? '',
    /固定予定/,
  )
  assert.match(
    validateSlotPosition(slot, { dayOfWeek: 0, startMinutes: at('15:30') }, context) ?? '',
    /ほかの枠/,
  )
  // 曜日が違えば置ける
  assert.equal(
    validateSlotPosition(slot, { dayOfWeek: 1, startMinutes: at('15:30') }, context),
    null,
  )
})

test('優先度の高い習慣が上限を食い尽くして、他が1回も置けなくなることはない', () => {
  // 上限は1日3時間。優先度1の目標だけで週の上限を使い切る量にする
  const heavy = habit({ name: '就活対策', targetValue: 15, minBlockMinutes: 60, priority: 1 })
  const light = habit({ name: 'ダンス', targetValue: 4, minBlockMinutes: 90, priority: 3 })
  const middle = habit({ name: '交渉学', targetValue: 8, minBlockMinutes: 30, priority: 2 })
  const { slots, unplaced } = run([heavy, light, middle])

  for (const h of [heavy, light, middle]) {
    const placed = slots.filter((slot) => slot.habitId === h.id).length
    assert.ok(placed > 0, `${h.name} が1回も置かれていない`)
  }
  // 入りきらないぶんは正直に未配置として出る
  assert.ok(unplaced.length > 0)
})

test('優先度の高い習慣のほうが多く置かれる', () => {
  const high = habit({ name: '高', targetValue: 10, minBlockMinutes: 60, priority: 1 })
  const low = habit({ name: '低', targetValue: 10, minBlockMinutes: 60, priority: 3 })
  const { slots } = run([low, high])
  const count = (id: string) => slots.filter((slot) => slot.habitId === id).length
  assert.ok(
    count(high.id) >= count(low.id),
    `高:${count(high.id)} 低:${count(low.id)}`,
  )
})
