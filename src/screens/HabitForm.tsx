import { useState } from 'react'
import { formatMinutes } from '../lib/format'
import type { HabitDraft } from '../lib/store-context'
import {
  CATEGORIES,
  TIME_PREFS,
  type Category,
  type Priority,
  type TargetType,
  type TimePref,
} from '../lib/types'

/**
 * 入力中の状態。数値は文字列のまま持つ。
 * 途中で空にできるようにし、入力した値をそのまま保つため。
 */
interface FormState {
  name: string
  category: Category
  targetType: TargetType
  targetValue: string
  minBlockMinutes: string
  timePref: TimePref
  priority: Priority
  avoidConsecutiveDays: boolean
  active: boolean
}

const DEFAULT_FORM: FormState = {
  name: '',
  category: '学習',
  targetType: 'count',
  targetValue: '3',
  minBlockMinutes: '30',
  timePref: '指定なし',
  priority: 2,
  avoidConsecutiveDays: false,
  active: true,
}

function toForm(draft: HabitDraft): FormState {
  return {
    ...draft,
    targetValue: String(draft.targetValue),
    minBlockMinutes: String(draft.minBlockMinutes),
  }
}

/** 整数として読めれば数値、読めなければ null。 */
function parseInteger(value: string): number | null {
  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const parsed = Number(trimmed)
  return Number.isSafeInteger(parsed) ? parsed : null
}

type Props = {
  initial?: HabitDraft
  submitLabel: string
  onSubmit: (draft: HabitDraft) => void
  onCancel: () => void
}

// w-full は付けない。幅は使う場所ごとに指定する（指定が競合して欄が潰れるのを防ぐ）
const fieldClass =
  'rounded-lg border border-line bg-card px-3 py-2 text-sm outline-none focus:border-accent'
const labelClass = 'block text-xs font-medium text-ink-soft'

export function HabitForm({ initial, submitLabel, onSubmit, onCancel }: Props) {
  const [form, setForm] = useState<FormState>(
    initial === undefined ? DEFAULT_FORM : toForm(initial),
  )
  const [error, setError] = useState<string | null>(null)

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const targetValue = parseInteger(form.targetValue)

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const name = form.name.trim()
    if (name === '') {
      setError('名前を入力してください')
      return
    }
    if (targetValue === null || targetValue < 1) {
      setError(
        form.targetType === 'count'
          ? '週の目標を1以上の回数で入力してください'
          : '週の目標を1以上の分数で入力してください',
      )
      return
    }
    const minBlockMinutes = parseInteger(form.minBlockMinutes)
    if (minBlockMinutes === null || minBlockMinutes < 5) {
      setError('最低ブロックを5分以上で入力してください')
      return
    }
    setError(null)
    onSubmit({
      name,
      category: form.category,
      targetType: form.targetType,
      targetValue,
      minBlockMinutes,
      timePref: form.timePref,
      priority: form.priority,
      avoidConsecutiveDays: form.avoidConsecutiveDays,
      active: form.active,
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      // 検証は handleSubmit で行い、メッセージも自前で出す
      noValidate
      className="rounded-xl border border-line bg-card p-5 shadow-sm"
    >
      <div className="space-y-4">
        <div>
          <label className={labelClass} htmlFor="habit-name">
            名前
          </label>
          <input
            id="habit-name"
            className={`${fieldClass} mt-1 w-full`}
            value={form.name}
            placeholder="例：ジム / ケース対策"
            onChange={(event) => set('name', event.target.value)}
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass} htmlFor="habit-category">
              カテゴリ
            </label>
            <select
              id="habit-category"
              className={`${fieldClass} mt-1 w-full`}
              value={form.category}
              onChange={(event) =>
                set('category', event.target.value as Category)
              }
            >
              {CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="habit-timepref">
              希望時間帯
            </label>
            <select
              id="habit-timepref"
              className={`${fieldClass} mt-1 w-full`}
              value={form.timePref}
              onChange={(event) =>
                set('timePref', event.target.value as TimePref)
              }
            >
              {TIME_PREFS.map((pref) => (
                <option key={pref} value={pref}>
                  {pref}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <span className={labelClass}>週の目標</span>
          <div className="mt-1 flex items-center gap-2">
            <select
              aria-label="目標の種類"
              className={`${fieldClass} w-24 shrink-0`}
              value={form.targetType}
              onChange={(event) =>
                set('targetType', event.target.value as TargetType)
              }
            >
              <option value="count">回数</option>
              <option value="minutes">時間</option>
            </select>
            <input
              aria-label="目標の値"
              type="text"
              inputMode="numeric"
              className={`${fieldClass} w-0 min-w-16 flex-1 text-right tabular-nums`}
              value={form.targetValue}
              onChange={(event) => set('targetValue', event.target.value)}
            />
            <span className="shrink-0 text-sm text-ink-soft">
              {form.targetType === 'count' ? '回 / 週' : '分 / 週'}
            </span>
          </div>
          {form.targetType === 'minutes' && targetValue !== null && targetValue >= 1 && (
            <p className="mt-1 text-xs text-ink-faint">
              {`= 週${formatMinutes(targetValue)}`}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass} htmlFor="habit-minblock">
              最低ブロック
            </label>
            <div className="mt-1 flex items-center gap-2">
              <input
                id="habit-minblock"
                type="text"
                inputMode="numeric"
                className={`${fieldClass} w-0 min-w-14 flex-1 text-right tabular-nums`}
                value={form.minBlockMinutes}
                onChange={(event) =>
                  set('minBlockMinutes', event.target.value)
                }
              />
              <span className="shrink-0 text-sm text-ink-soft">分</span>
            </div>
          </div>
          <div>
            <label className={labelClass} htmlFor="habit-priority">
              優先度
            </label>
            <select
              id="habit-priority"
              className={`${fieldClass} mt-1 w-full`}
              value={form.priority}
              onChange={(event) =>
                set('priority', Number(event.target.value) as Priority)
              }
            >
              <option value={1}>1 最優先</option>
              <option value={2}>2 標準</option>
              <option value={3}>3 余裕があれば</option>
            </select>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-accent"
            checked={form.avoidConsecutiveDays}
            onChange={(event) =>
              set('avoidConsecutiveDays', event.target.checked)
            }
          />
          連日を避ける（筋トレなど）
        </label>

        {error !== null && (
          <p className="text-sm text-ink-soft" role="alert">
            {error}
          </p>
        )}
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-4 py-2 text-sm text-ink-soft hover:bg-surface"
        >
          キャンセル
        </button>
        <button
          type="submit"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  )
}
