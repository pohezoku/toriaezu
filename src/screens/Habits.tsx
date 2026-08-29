import { useState } from 'react'
import { PRIORITY_LABELS, formatTarget } from '../lib/format'
import { useAppStore, type HabitDraft } from '../lib/store-context'
import type { Habit } from '../lib/types'
import { Screen } from '../ui/Screen'
import { HabitForm } from './HabitForm'

type Editing = { mode: 'new' } | { mode: 'edit'; habit: Habit } | null

export function Habits() {
  const { data, addHabit, editHabit, setHabitActive, removeHabit } =
    useAppStore()
  const [editing, setEditing] = useState<Editing>(null)

  const activeHabits = data.habits.filter((habit) => habit.active)
  const pausedHabits = data.habits.filter((habit) => !habit.active)

  const handleSubmit = (draft: HabitDraft) => {
    if (editing === null) return
    if (editing.mode === 'new') addHabit(draft)
    else editHabit(editing.habit.id, draft)
    setEditing(null)
  }

  const handleRemove = (habit: Habit) => {
    const ok = window.confirm(
      `「${habit.name}」を削除します。記録も一緒に消えます。\n記録を残したいときは「停止」を使ってください。`,
    )
    if (ok) removeHabit(habit.id)
  }

  return (
    <Screen
      title="習慣の管理"
      description="週の目標と、1回あたりの長さ・希望時間帯を決めます。ここでの設定が自動配置の材料になります。"
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
      {editing !== null && (
        <div className="mb-6">
          <HabitForm
            initial={editing.mode === 'edit' ? editing.habit : undefined}
            submitLabel={editing.mode === 'edit' ? '保存' : '追加'}
            onSubmit={handleSubmit}
            onCancel={() => setEditing(null)}
          />
        </div>
      )}

      {data.habits.length === 0 && editing === null ? (
        <div className="rounded-xl border border-dashed border-line bg-card px-5 py-10 text-center">
          <p className="text-sm text-ink-soft">まだ習慣がありません</p>
          <p className="mt-1 text-xs text-ink-faint">
            続けたいことを1つ追加してみてください
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {activeHabits.map((habit) => (
            <HabitCard
              key={habit.id}
              habit={habit}
              onEdit={() => setEditing({ mode: 'edit', habit })}
              onToggleActive={() => setHabitActive(habit.id, false)}
              onRemove={() => handleRemove(habit)}
            />
          ))}

          {pausedHabits.length > 0 && (
            <div className="pt-4">
              <p className="mb-2 text-xs font-medium text-ink-faint">停止中</p>
              <div className="space-y-3">
                {pausedHabits.map((habit) => (
                  <HabitCard
                    key={habit.id}
                    habit={habit}
                    onEdit={() => setEditing({ mode: 'edit', habit })}
                    onToggleActive={() => setHabitActive(habit.id, true)}
                    onRemove={() => handleRemove(habit)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Screen>
  )
}

type CardProps = {
  habit: Habit
  onEdit: () => void
  onToggleActive: () => void
  onRemove: () => void
}

function HabitCard({ habit, onEdit, onToggleActive, onRemove }: CardProps) {
  return (
    <div
      className={`rounded-xl border border-line bg-card p-4 ${
        habit.active ? '' : 'opacity-60'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{habit.name}</p>
          <p className="mt-1 text-sm text-ink-soft">
            {formatTarget(habit)}・1回 {habit.minBlockMinutes}分
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-accent-soft px-2 py-1 text-xs text-ink-soft">
          {habit.category}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5 text-xs text-ink-faint">
        <Tag>{PRIORITY_LABELS[habit.priority]}</Tag>
        <Tag>{habit.timePref === '指定なし' ? '時間帯おまかせ' : habit.timePref}</Tag>
        {habit.avoidConsecutiveDays && <Tag>連日を避ける</Tag>}
      </div>

      <div className="mt-3 flex gap-1 border-t border-line pt-3 text-sm">
        <button
          type="button"
          onClick={onEdit}
          className="rounded-lg px-3 py-1.5 text-ink-soft hover:bg-surface"
        >
          編集
        </button>
        <button
          type="button"
          onClick={onToggleActive}
          className="rounded-lg px-3 py-1.5 text-ink-soft hover:bg-surface"
        >
          {habit.active ? '停止' : '再開'}
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="ml-auto rounded-lg px-3 py-1.5 text-ink-faint hover:bg-surface"
        >
          削除
        </button>
      </div>
    </div>
  )
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md border border-line px-1.5 py-0.5">
      {children}
    </span>
  )
}
