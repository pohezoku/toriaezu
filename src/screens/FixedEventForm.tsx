import { useState } from 'react'
import { parseTimeInputValue, toTimeInputValue } from '../lib/format'
import { DAY_LABELS, DAYS } from '../lib/schedule'
import type { FixedEventDraft } from '../lib/store-context'
import { EVENT_CATEGORIES, type DayOfWeek } from '../lib/types'

/** 同じ内容で曜日だけ違う予定を、ひとまとまりとして扱うための形。 */
export interface EventGroupDraft {
  label: string
  category: string
  days: DayOfWeek[]
  startMinutes: number
  endMinutes: number
}

const DEFAULT_DRAFT: EventGroupDraft = {
  label: '',
  category: '授業',
  days: [],
  startMinutes: 9 * 60,
  endMinutes: 10 * 60 + 30,
}

type Props = {
  initial?: EventGroupDraft
  submitLabel: string
  onSubmit: (drafts: FixedEventDraft[]) => void
  onCancel: () => void
}

const fieldClass =
  'w-full rounded-lg border border-line bg-card px-3 py-2 text-sm outline-none focus:border-accent'
const labelClass = 'block text-xs font-medium text-ink-soft'

export function FixedEventForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: Props) {
  const [draft, setDraft] = useState<EventGroupDraft>(initial ?? DEFAULT_DRAFT)
  const [error, setError] = useState<string | null>(null)

  const toggleDay = (day: DayOfWeek) => {
    setDraft((current) => ({
      ...current,
      days: current.days.includes(day)
        ? current.days.filter((d) => d !== day)
        : [...current.days, day].sort((a, b) => a - b),
    }))
  }

  const setTime = (key: 'startMinutes' | 'endMinutes', value: string) => {
    const minutes = parseTimeInputValue(value)
    if (minutes === null) return
    setDraft((current) => ({ ...current, [key]: minutes }))
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const label = draft.label.trim()
    if (label === '') {
      setError('予定の名前を入力してください')
      return
    }
    if (draft.days.length === 0) {
      setError('曜日を1つ以上選んでください')
      return
    }
    if (draft.endMinutes <= draft.startMinutes) {
      setError('終了時刻は開始時刻より後にしてください')
      return
    }
    setError(null)
    onSubmit(
      draft.days.map((day) => ({
        dayOfWeek: day,
        startMinutes: draft.startMinutes,
        endMinutes: draft.endMinutes,
        label,
        category: draft.category,
      })),
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="rounded-xl border border-line bg-card p-5 shadow-sm"
    >
      <div className="space-y-4">
        <div>
          <label className={labelClass} htmlFor="event-label">
            予定の名前
          </label>
          <input
            id="event-label"
            className={`${fieldClass} mt-1`}
            value={draft.label}
            placeholder="例：情報科学 / カフェのバイト"
            onChange={(event) =>
              setDraft((current) => ({ ...current, label: event.target.value }))
            }
            autoFocus
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="event-category">
            種類
          </label>
          <select
            id="event-category"
            className={`${fieldClass} mt-1`}
            value={draft.category}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                category: event.target.value,
              }))
            }
          >
            {EVENT_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>

        <div>
          <span className={labelClass}>曜日（複数選べます）</span>
          <div className="mt-1.5 flex gap-1.5">
            {DAYS.map((day) => {
              const selected = draft.days.includes(day)
              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={selected}
                  aria-label={`${DAY_LABELS[day]}曜日`}
                  onClick={() => toggleDay(day)}
                  className={`size-9 rounded-lg border text-sm transition-colors ${
                    selected
                      ? 'border-accent bg-accent text-white'
                      : 'border-line text-ink-soft hover:bg-surface'
                  }`}
                >
                  {DAY_LABELS[day]}
                </button>
              )
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass} htmlFor="event-start">
              開始
            </label>
            <input
              id="event-start"
              type="time"
              className={`${fieldClass} mt-1`}
              value={toTimeInputValue(draft.startMinutes)}
              onChange={(event) => setTime('startMinutes', event.target.value)}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="event-end">
              終了
            </label>
            <input
              id="event-end"
              type="time"
              className={`${fieldClass} mt-1`}
              value={toTimeInputValue(draft.endMinutes)}
              onChange={(event) => setTime('endMinutes', event.target.value)}
            />
          </div>
        </div>

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
