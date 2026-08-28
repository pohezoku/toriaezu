import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createId, loadData, saveData } from './storage'
import { AppStoreContext, type AppStore, type HabitDraft } from './store-context'
import type { AppData } from './types'

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(() => loadData())
  const isFirstRender = useRef(true)

  useEffect(() => {
    // 読み込み直後の1回は書き戻さない（空データで上書きしないため）
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    saveData(data)
  }, [data])

  const update = useCallback((recipe: (current: AppData) => AppData) => {
    setData((current) => recipe(current))
  }, [])

  const addHabit = useCallback(
    (draft: HabitDraft) => {
      update((current) => ({
        ...current,
        habits: [
          ...current.habits,
          { ...draft, id: createId(), createdAt: new Date().toISOString() },
        ],
      }))
    },
    [update],
  )

  const editHabit = useCallback(
    (id: string, draft: HabitDraft) => {
      update((current) => ({
        ...current,
        habits: current.habits.map((habit) =>
          habit.id === id ? { ...habit, ...draft } : habit,
        ),
      }))
    },
    [update],
  )

  const setHabitActive = useCallback(
    (id: string, active: boolean) => {
      update((current) => ({
        ...current,
        habits: current.habits.map((habit) =>
          habit.id === id ? { ...habit, active } : habit,
        ),
      }))
    },
    [update],
  )

  const removeHabit = useCallback(
    (id: string) => {
      update((current) => ({
        ...current,
        habits: current.habits.filter((habit) => habit.id !== id),
        plannedSlots: current.plannedSlots.filter((slot) => slot.habitId !== id),
        logs: current.logs.filter((log) => log.habitId !== id),
      }))
    },
    [update],
  )

  const value = useMemo<AppStore>(
    () => ({ data, update, addHabit, editHabit, setHabitActive, removeHabit }),
    [data, update, addHabit, editHabit, setHabitActive, removeHabit],
  )

  return (
    <AppStoreContext value={value}>{children}</AppStoreContext>
  )
}
