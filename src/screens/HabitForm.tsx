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

const DEFAULT_DRAFT: HabitDraft = {
  name: '',
  category: '学習',
  targetType: 'count',
  targetValue: 3,
  minBlockMinutes: 30,
  timePref: '指定なし',
  priority: 2,
  avoidConsecutiveDays: false,
  active: true,
}

type Props = {
  initial?: HabitDraft
  submitLabel: string
  onSubmit: (draft: HabitDraft) => void
  onCancel: () => void
}

const fieldClass =
  'w-full rounded-lg border border-line bg-card px-3 py-2 text-sm outline-none focus:border-accent'
const labelClass = 'block text-xs font-medium text-ink-soft'

export function HabitForm({ initial, submitLabel, onSubmit, onCancel }: Props) {
  const [draft, setDraft] = useState<HabitDraft>(initial ?? DEFAULT_DRAFT)
  const [error, setError] = useState<string | null>(null)

  const set = <K extends keyof HabitDraft>(key: K, value: HabitDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const name = draft.name.trim()
    if (name === '') {
      setError('名前を入力してください')
      return
    }
    if (!Number.isInteger(draft.targetValue) || draft.targetValue < 1) {
      setError(
        draft.targetType === 'count'
          ? '週の目標は1以上の整数で入力してください'
          : '週の目標は1分以上の整数で入力してください',
      )
      return
    }
    if (!Number.isInteger(draft.minBlockMinutes) || draft.minBlockMinutes < 5) {
      setError('最低ブロックは5分以上の整数で入力してください')
      return
    }
    setError(null)
    onSubmit({ ...draft, name })
  }

  return (
    <form
      onSubmit={handleSubmit}
      // 検証は下の handleSubmit で行い、メッセージも自前で出す。
      // ブラウザ標準の step 検証に送信を止められないようにする。
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
            className={`${fieldClass} mt-1`}
            value={draft.name}
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
              className={`${fieldClass} mt-1`}
              value={draft.category}
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
              className={`${fieldClass} mt-1`}
              value={draft.timePref}
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
          <div className="mt-1 flex gap-2">
            <select
              aria-label="目標の種類"
              className={`${fieldClass} w-32`}
              value={draft.targetType}
              onChange={(event) =>
                set('targetType', event.target.value as TargetType)
              }
            >
              <option value="count">回数</option>
              <option value="minutes">時間</option>
            </select>
            <div className="flex flex-1 items-center gap-2">
              <input
                aria-label="目標の値"
                type="number"
                inputMode="numeric"
                min={1}
                step={draft.targetType === 'minutes' ? 15 : 1}
                className={fieldClass}
                value={draft.targetValue}
                onChange={(event) =>
                  set('targetValue', Number(event.target.value))
                }
              />
              <span className="shrink-0 text-sm text-ink-soft">
                {draft.targetType === 'count' ? '回 / 週' : '分 / 週'}
              </span>
            </div>
          </div>
          {draft.targetType === 'minutes' && draft.targetValue >= 1 && (
            <p className="mt-1 text-xs text-ink-faint">
              = 週{formatMinutes(Math.round(draft.targetValue))}
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
                type="number"
                inputMode="numeric"
                min={5}
                step={5}
                className={fieldClass}
                value={draft.minBlockMinutes}
                onChange={(event) =>
                  set('minBlockMinutes', Number(event.target.value))
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
              className={`${fieldClass} mt-1`}
              value={draft.priority}
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
            checked={draft.avoidConsecutiveDays}
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
