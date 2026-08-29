import { useState } from 'react'
import {
  formatMinutes,
  formatTimeOfDay,
  parseTimeInputValue,
  toTimeInputValue,
} from '../lib/format'
import {
  DAY_LABELS,
  getDayWindow,
  intervalLength,
  MIN_FREE_MINUTES,
} from '../lib/schedule'
import { useAppStore, type FixedEventDraft } from '../lib/store-context'
import type { FixedEvent } from '../lib/types'
import { Screen } from '../ui/Screen'
import { FixedEventForm, type EventGroupDraft } from './FixedEventForm'

/** 同じ内容で曜日だけ違う予定を1件としてまとめたもの。 */
interface EventGroup extends EventGroupDraft {
  key: string
  ids: string[]
}

function groupEvents(events: FixedEvent[]): EventGroup[] {
  const groups = new Map<string, EventGroup>()
  for (const event of events) {
    const key = JSON.stringify([
      event.label,
      event.category,
      event.startMinutes,
      event.endMinutes,
    ])
    const existing = groups.get(key)
    if (existing === undefined) {
      groups.set(key, {
        key,
        ids: [event.id],
        label: event.label,
        category: event.category,
        days: [event.dayOfWeek],
        startMinutes: event.startMinutes,
        endMinutes: event.endMinutes,
      })
    } else {
      existing.ids.push(event.id)
      if (!existing.days.includes(event.dayOfWeek)) {
        existing.days.push(event.dayOfWeek)
      }
    }
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      days: [...group.days].sort((a, b) => a - b),
    }))
    .sort(
      (a, b) => a.days[0] - b.days[0] || a.startMinutes - b.startMinutes,
    )
}

type Editing = { mode: 'new' } | { mode: 'edit'; group: EventGroup } | null

export function FixedEvents() {
  const { data, addFixedEvents, replaceFixedEvents, removeFixedEvents } =
    useAppStore()
  const [editing, setEditing] = useState<Editing>(null)
  const groups = groupEvents(data.fixedEvents)

  const handleSubmit = (drafts: FixedEventDraft[]) => {
    if (editing === null) return
    if (editing.mode === 'new') addFixedEvents(drafts)
    else replaceFixedEvents(editing.group.ids, drafts)
    setEditing(null)
  }

  const handleRemove = (group: EventGroup) => {
    if (window.confirm(`「${group.label}」を削除しますか？`)) {
      removeFixedEvents(group.ids)
    }
  }

  return (
    <Screen
      title="固定予定"
      description="動かせない予定と、1日の活動時間を登録します。ここから空き時間を算出します。"
      action={
        editing === null ? (
          <button
            type="button"
            onClick={() => setEditing({ mode: 'new' })}
            className="shrink-0 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            追加
          </button>
        ) : null
      }
    >
      <SettingsCard />

      <div className="mt-6">
        <h3 className="mb-3 text-sm font-medium">予定</h3>

        {editing !== null && (
          <div className="mb-4">
            <FixedEventForm
              initial={editing.mode === 'edit' ? editing.group : undefined}
              submitLabel={editing.mode === 'edit' ? '保存' : '追加'}
              onSubmit={handleSubmit}
              onCancel={() => setEditing(null)}
            />
          </div>
        )}

        {groups.length === 0 && editing === null ? (
          <div className="rounded-xl border border-dashed border-line bg-card px-5 py-10 text-center">
            <p className="text-sm text-ink-soft">まだ固定予定がありません</p>
            <p className="mt-1 text-xs text-ink-faint">
              授業やバイトなど、動かせない予定を登録してください
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map((group) => (
              <div
                key={group.key}
                className="rounded-xl border border-line bg-card p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{group.label}</p>
                    <p className="mt-1 text-sm text-ink-soft">
                      {group.days.map((day) => DAY_LABELS[day]).join('・')}{' '}
                      {formatTimeOfDay(group.startMinutes)}–
                      {formatTimeOfDay(group.endMinutes)}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-accent-soft px-2 py-1 text-xs text-ink-soft">
                    {group.category}
                  </span>
                </div>
                <div className="mt-3 flex gap-1 border-t border-line pt-3 text-sm">
                  <button
                    type="button"
                    onClick={() => setEditing({ mode: 'edit', group })}
                    className="rounded-lg px-3 py-1.5 text-ink-soft hover:bg-surface"
                  >
                    編集
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(group)}
                    className="ml-auto rounded-lg px-3 py-1.5 text-ink-faint hover:bg-surface"
                  >
                    削除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Screen>
  )
}

const FILL_RATIO_OPTIONS = [0.5, 0.6, 0.7, 0.8]
const BUFFER_OPTIONS = [0, 5, 10, 15, 30]

function SettingsCard() {
  const { data, updateSettings } = useAppStore()
  const { settings } = data
  const dayWindow = getDayWindow(settings)
  const awakeMinutes = intervalLength(dayWindow)

  const setTime = (key: 'wakeMinutes' | 'sleepMinutes', value: string) => {
    const minutes = parseTimeInputValue(value)
    if (minutes !== null) updateSettings({ [key]: minutes })
  }

  return (
    <section className="rounded-xl border border-line bg-card p-4">
      <h3 className="text-sm font-medium">1日の使い方</h3>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-ink-soft" htmlFor="wake">
            起床
          </label>
          <input
            id="wake"
            type="time"
            className="mt-1 w-full rounded-lg border border-line bg-card px-3 py-2 text-sm outline-none focus:border-accent"
            value={toTimeInputValue(settings.wakeMinutes)}
            onChange={(event) => setTime('wakeMinutes', event.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-soft" htmlFor="sleep">
            就寝
          </label>
          <input
            id="sleep"
            type="time"
            className="mt-1 w-full rounded-lg border border-line bg-card px-3 py-2 text-sm outline-none focus:border-accent"
            value={toTimeInputValue(settings.sleepMinutes)}
            onChange={(event) => setTime('sleepMinutes', event.target.value)}
          />
        </div>
      </div>
      <p className="mt-1.5 text-xs text-ink-faint">
        {`活動時間は1日 ${formatMinutes(awakeMinutes)}（${formatTimeOfDay(dayWindow.start)}–${formatTimeOfDay(dayWindow.end)}）。この外側には何も置きません。`}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-ink-soft" htmlFor="buffer">
            予定の前後の余白
          </label>
          <select
            id="buffer"
            className="mt-1 w-full rounded-lg border border-line bg-card px-3 py-2 text-sm outline-none focus:border-accent"
            value={settings.bufferMinutes}
            onChange={(event) =>
              updateSettings({ bufferMinutes: Number(event.target.value) })
            }
          >
            {BUFFER_OPTIONS.map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes}分
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-soft" htmlFor="fill">
            空き時間を埋める上限
          </label>
          <select
            id="fill"
            className="mt-1 w-full rounded-lg border border-line bg-card px-3 py-2 text-sm outline-none focus:border-accent"
            value={settings.maxFillRatio}
            onChange={(event) =>
              updateSettings({ maxFillRatio: Number(event.target.value) })
            }
          >
            {FILL_RATIO_OPTIONS.map((ratio) => (
              <option key={ratio} value={ratio}>
                {Math.round(ratio * 100)}%
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="mt-1.5 text-xs text-ink-faint">
        余白は移動・疲労・突発のために残します。{MIN_FREE_MINUTES}
        分未満の空きは使いません。
      </p>
    </section>
  )
}
