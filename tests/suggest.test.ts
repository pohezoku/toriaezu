import assert from 'node:assert/strict'
import { test } from 'vitest'
import { autoPlan } from '../src/lib/plan'
import { bandOf } from '../src/lib/schedule'
import {
  applySuggestion,
  computeSuggestions,
  countSkips,
  recentRates,
  stepTarget,
} from '../src/lib/suggest'
import type {
  DayOfWeek,
  Habit,
  LogEntry,
  PlannedSlot,
  Settings,
} from '../src/lib/types'

const W = {
  now: '2026-08-24',
  w1: '2026-08-17',
  w2: '2026-08-10',
  w3: '2026-08-03',
}

const settings: Settings = {
  wakeMinutes: 7 * 60,
  sleepMinutes: 23 * 60,
  bufferMinutes: 15,
  maxFillRatio: 0.7,
  maxDailyHabitMinutes: 3 * 60,
}

let seq = 0
const habit = (over: Partial<Habit> = {}): Habit => ({
  id: `h${(seq += 1)}`,
  name: 'ジム',
  category: '運動',
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

const slot = (
  weekStart: string,
  habitId: string,
  day: DayOfWeek,
  start = 600,
  over: Partial<PlannedSlot> = {},
): PlannedSlot => ({
  id: `s${(seq += 1)}`,
  weekStart,
  habitId,
  dayOfWeek: day,
  startMinutes: start,
  endMinutes: start + 60,
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

/** その週に「計画はあるが実施は done 回」という状態を作る。 */
const week = (weekStart: string, h: Habit, planned: number, done: number) => {
  const slots: PlannedSlot[] = []
  const logs: LogEntry[] = []
  for (let i = 0; i < planned; i += 1) {
    slots.push(slot(weekStart, h.id, i as DayOfWeek))
  }
  for (let i = 0; i < done; i += 1) {
    const date = new Date(`${weekStart}T00:00:00Z`)
    date.setUTCDate(date.getUTCDate() + i)
    logs.push(log(h.id, date.toISOString().slice(0, 10)))
  }
  return { slots, logs }
}

test('bandOf: 朝/昼/夜の区切り', () => {
  assert.equal(bandOf(8 * 60, settings), '朝')
  assert.equal(bandOf(10 * 60 + 59, settings), '朝')
  assert.equal(bandOf(11 * 60, settings), '昼')
  assert.equal(bandOf(16 * 60 + 59, settings), '昼')
  assert.equal(bandOf(17 * 60, settings), '夜')
  assert.equal(bandOf(22 * 60, settings), '夜')
})

test('stepTarget: 回数は±1回、分は±1セッション', () => {
  assert.equal(stepTarget(habit({ targetType: 'count', targetValue: 3 }), -1), 2)
  assert.equal(stepTarget(habit({ targetType: 'count', targetValue: 3 }), 1), 4)
  // 週6時間・120分ブロック → 3回。1段階下げると週4時間（設計図の例）
  const caseStudy = habit({
    targetType: 'minutes',
    targetValue: 360,
    minBlockMinutes: 120,
  })
  assert.equal(stepTarget(caseStudy, -1), 240)
  assert.equal(stepTarget(caseStudy, 1), 480)
})

test('stepTarget: これ以上下げられないときは null', () => {
  assert.equal(stepTarget(habit({ targetType: 'count', targetValue: 1 }), -1), null)
  assert.equal(
    stepTarget(
      habit({ targetType: 'minutes', targetValue: 60, minBlockMinutes: 60 }),
      -1,
    ),
    null,
  )
})

test('recentRates: データの無い週は数えない', () => {
  const h = habit()
  // 今週と2週前だけデータがある
  const a = week(W.now, h, 4, 1)
  const b = week(W.w2, h, 4, 4)
  const input = {
    plannedSlots: [...a.slots, ...b.slots],
    logs: [...a.logs, ...b.logs],
    weekStart: W.now,
  }
  const rates = recentRates(h, input, 2)
  // 目標3回に対して 1回 と 4回
  assert.deepEqual(rates, [1 / 3, 4 / 3])
})

test('目標を下げる提案：2週連続で70%未満', () => {
  const h = habit({ name: 'ケース対策', targetType: 'minutes', targetValue: 360, minBlockMinutes: 120 })
  // 目標360分。1回120分なので、1回だけ実施＝120/360=33%
  const a = week(W.now, h, 3, 1)
  const b = week(W.w1, h, 3, 1)
  const suggestions = computeSuggestions({
    habits: [h],
    plannedSlots: [...a.slots, ...b.slots],
    logs: [...a.logs, ...b.logs].map((l) => ({ ...l, actualMinutes: 120 })),
    settings,
    weekStart: W.now,
  })
  assert.equal(suggestions.length, 1)
  assert.equal(suggestions[0].kind, 'lowerTarget')
  assert.equal(suggestions[0].nextTargetValue, 240)
  assert.equal(
    suggestions[0].message,
    'ケース対策は2週続けて目標に届いていません。週4時間に下げますか？',
  )
})

test('目標を下げる提案：1週だけなら出さない', () => {
  const h = habit()
  const a = week(W.now, h, 3, 0)
  const suggestions = computeSuggestions({
    habits: [h],
    plannedSlots: a.slots,
    logs: a.logs,
    settings,
    weekStart: W.now,
  })
  assert.deepEqual(suggestions, [])
})

test('目標を上げる提案：4週連続で達成', () => {
  const h = habit({ name: 'ジム', targetValue: 3 })
  const weeks = [W.now, W.w1, W.w2, W.w3].map((w) => week(w, h, 3, 3))
  const suggestions = computeSuggestions({
    habits: [h],
    plannedSlots: weeks.flatMap((x) => x.slots),
    logs: weeks.flatMap((x) => x.logs),
    settings,
    weekStart: W.now,
  })
  assert.equal(suggestions.length, 1)
  assert.equal(suggestions[0].kind, 'raiseTarget')
  assert.equal(suggestions[0].nextTargetValue, 4)
  assert.equal(
    suggestions[0].message,
    'ジムは4週続けて目標を達成しています。週4回に増やしますか？',
  )
})

test('目標を上げる提案：3週ぶんしかデータが無ければ出さない', () => {
  const h = habit({ targetValue: 3 })
  const weeks = [W.now, W.w1, W.w2].map((w) => week(w, h, 3, 3))
  const suggestions = computeSuggestions({
    habits: [h],
    plannedSlots: weeks.flatMap((x) => x.slots),
    logs: weeks.flatMap((x) => x.logs),
    settings,
    weekStart: W.now,
  })
  assert.deepEqual(suggestions, [])
})

test('据え置き：条件に当てはまらなければ提案なし', () => {
  const h = habit({ targetValue: 3 })
  const weeks = [W.now, W.w1].map((w) => week(w, h, 3, 2)) // 67%… ではなく 2/3
  const suggestions = computeSuggestions({
    habits: [h],
    plannedSlots: weeks.flatMap((x) => x.slots),
    logs: weeks.flatMap((x) => x.logs),
    settings,
    weekStart: W.now,
  })
  // 2/3 = 66.7% < 70% なので下げる提案が出る。境目の確認として明示する
  assert.equal(suggestions[0]?.kind, 'lowerTarget')

  const okWeeks = [W.now, W.w1].map((w) => week(w, h, 3, 3))
  assert.deepEqual(
    computeSuggestions({
      habits: [h],
      plannedSlots: okWeeks.flatMap((x) => x.slots),
      logs: okWeeks.flatMap((x) => x.logs),
      settings,
      weekStart: W.now,
    }),
    [],
  )
})

test('countSkips: 同じ曜日・時間帯のスキップを数える', () => {
  const h = habit()
  // 金曜(4)の夜(19:00)の枠を3週ぶん、すべてスキップ
  const slots = [W.now, W.w1, W.w2].map((w) => slot(w, h.id, 4, 19 * 60))
  const logs = slots.map((s, i) =>
    log(h.id, ['2026-08-28', '2026-08-21', '2026-08-14'][i], 'skipped', {
      slotId: s.id,
    }),
  )
  const counts = countSkips(h, { plannedSlots: slots, logs, settings, weekStart: W.now })
  assert.deepEqual([...counts.values()], [
    { slot: { dayOfWeek: 4, band: '夜' }, count: 3 },
  ])
})

test('枠を変える提案：同じ曜日・時間帯で3回スキップ', () => {
  const h = habit({ name: 'ジム' })
  const slots = [W.now, W.w1, W.w2].map((w) => slot(w, h.id, 4, 19 * 60))
  const logs = slots.map((s, i) =>
    log(h.id, ['2026-08-28', '2026-08-21', '2026-08-14'][i], 'skipped', {
      slotId: s.id,
    }),
  )
  const suggestions = computeSuggestions({
    habits: [h],
    plannedSlots: slots,
    logs,
    settings,
    weekStart: W.now,
  })
  const avoid = suggestions.find((s) => s.kind === 'avoidSlot')
  assert.ok(avoid !== undefined)
  assert.deepEqual(avoid.avoid, { dayOfWeek: 4, band: '夜' })
  assert.equal(
    avoid.message,
    '金曜の夜は3回スキップされています。来週は避けて配置しますか？',
  )
})

test('枠を変える提案：2回では出さない', () => {
  const h = habit()
  const slots = [W.now, W.w1].map((w) => slot(w, h.id, 4, 19 * 60))
  const logs = slots.map((s, i) =>
    log(h.id, ['2026-08-28', '2026-08-21'][i], 'skipped', { slotId: s.id }),
  )
  const suggestions = computeSuggestions({
    habits: [h],
    plannedSlots: slots,
    logs,
    settings,
    weekStart: W.now,
  })
  assert.equal(suggestions.find((s) => s.kind === 'avoidSlot'), undefined)
})

test('枠を変える提案：すでに避けている枠は再提案しない', () => {
  const h = habit({ avoidSlots: [{ dayOfWeek: 4, band: '夜' }] })
  const slots = [W.now, W.w1, W.w2].map((w) => slot(w, h.id, 4, 19 * 60))
  const logs = slots.map((s, i) =>
    log(h.id, ['2026-08-28', '2026-08-21', '2026-08-14'][i], 'skipped', {
      slotId: s.id,
    }),
  )
  const suggestions = computeSuggestions({
    habits: [h],
    plannedSlots: slots,
    logs,
    settings,
    weekStart: W.now,
  })
  assert.equal(suggestions.find((s) => s.kind === 'avoidSlot'), undefined)
})

test('停止中の習慣には提案しない', () => {
  const h = habit({ active: false })
  const weeks = [W.now, W.w1].map((w) => week(w, h, 3, 0))
  assert.deepEqual(
    computeSuggestions({
      habits: [h],
      plannedSlots: weeks.flatMap((x) => x.slots),
      logs: weeks.flatMap((x) => x.logs),
      settings,
      weekStart: W.now,
    }),
    [],
  )
})

test('「今のままにする」で選んだ提案はその週は出ない', () => {
  const h = habit({ targetValue: 3 })
  const weeks = [W.now, W.w1].map((w) => week(w, h, 3, 0))
  const input = {
    habits: [h],
    plannedSlots: weeks.flatMap((x) => x.slots),
    logs: weeks.flatMap((x) => x.logs),
    settings,
    weekStart: W.now,
  }
  const [suggestion] = computeSuggestions(input)
  assert.ok(suggestion !== undefined)
  assert.deepEqual(
    computeSuggestions({
      ...input,
      dismissed: [{ key: suggestion.key, weekStart: W.now }],
    }),
    [],
  )
  // 別の週の見送りは効かない
  assert.equal(
    computeSuggestions({
      ...input,
      dismissed: [{ key: suggestion.key, weekStart: W.w1 }],
    }).length,
    1,
  )
})

test('applySuggestion: 目標が書き換わる。元の習慣は変えない', () => {
  const h = habit({ targetValue: 3 })
  const next = applySuggestion(h, {
    key: 'k',
    kind: 'lowerTarget',
    habitId: h.id,
    message: '',
    nextTargetValue: 2,
  })
  assert.equal(next.targetValue, 2)
  assert.equal(h.targetValue, 3)
})

test('applySuggestion: 避ける枠が追加される', () => {
  const h = habit()
  const next = applySuggestion(h, {
    key: 'k',
    kind: 'avoidSlot',
    habitId: h.id,
    message: '',
    avoid: { dayOfWeek: 4, band: '夜' },
  })
  assert.deepEqual(next.avoidSlots, [{ dayOfWeek: 4, band: '夜' }])
  assert.equal(h.avoidSlots, undefined)
})

test('環が閉じる：承認した「避ける枠」に、翌週は配置されない', () => {
  const h = habit({
    name: 'ジム',
    targetValue: 3,
    timePref: '夜',
    avoidSlots: [{ dayOfWeek: 4, band: '夜' }],
  })
  const { slots } = autoPlan({
    weekStart: W.now,
    habits: [h],
    fixedEvents: [],
    settings,
    logs: [],
  })
  const placed = slots.filter((s) => !s.isReserve)
  assert.equal(placed.length, 3)
  assert.equal(
    placed.some(
      (s) => s.dayOfWeek === 4 && bandOf(s.startMinutes, settings) === '夜',
    ),
    false,
    '避けるはずの金曜の夜に置かれている',
  )
})

test('承認した直後に、同じ規則がまた発火して連鎖しない', () => {
  const h = habit({ name: 'ケース対策', targetType: 'minutes', targetValue: 360, minBlockMinutes: 120 })
  const a = week(W.now, h, 3, 1)
  const b = week(W.w1, h, 3, 1)
  const input = {
    habits: [h],
    plannedSlots: [...a.slots, ...b.slots],
    logs: [...a.logs, ...b.logs].map((l) => ({ ...l, actualMinutes: 120 })),
    settings,
    weekStart: W.now,
  }
  const [suggestion] = computeSuggestions(input)
  assert.equal(suggestion.nextTargetValue, 240)

  // 承認 → 目標240分。記録は120分のままなので 50% で、規則そのものはまだ成り立つ
  const lowered = applySuggestion(h, suggestion)
  assert.equal(lowered.targetValue, 240)
  assert.equal(
    computeSuggestions({ ...input, habits: [lowered] }).length,
    1,
    '記録が変わらなければ規則は成り立ったまま',
  )
  // 承認時にその週ぶんを記録しておけば、追い打ちの提案は出ない
  assert.deepEqual(
    computeSuggestions({
      ...input,
      habits: [lowered],
      dismissed: [{ key: suggestion.key, weekStart: W.now }],
    }),
    [],
  )
})

test('目標の提案と枠の提案は別の鍵で、片方を見送っても他方は残る', () => {
  const h = habit({ name: 'スキンケア', targetValue: 3 })
  const skipSlots = [W.now, W.w1, W.w2].map((w) => slot(w, h.id, 4, 19 * 60))
  const skipLogs = skipSlots.map((s, i) =>
    log(h.id, ['2026-08-28', '2026-08-21', '2026-08-14'][i], 'skipped', {
      slotId: s.id,
    }),
  )
  const a = week(W.now, h, 3, 0)
  const b = week(W.w1, h, 3, 0)
  const input = {
    habits: [h],
    plannedSlots: [...skipSlots, ...a.slots, ...b.slots],
    logs: [...skipLogs, ...a.logs, ...b.logs],
    settings,
    weekStart: W.now,
  }
  const suggestions = computeSuggestions(input)
  assert.deepEqual(suggestions.map((s) => s.kind).sort(), ['avoidSlot', 'lowerTarget'])

  const target = suggestions.find((s) => s.kind === 'lowerTarget')
  const remaining = computeSuggestions({
    ...input,
    dismissed: [{ key: target.key, weekStart: W.now }],
  })
  assert.deepEqual(remaining.map((s) => s.kind), ['avoidSlot'])
})
