import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createId, loadData, saveData } from './storage'
import {
  AppStoreContext,
  type AppStore,
  type FixedEventDraft,
  type HabitDraft,
} from './store-context'
import type {
  AppData,
  DayOfWeek,
  LogEntry,
  PlannedSlot,
  Settings,
} from './types'

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

  const addFixedEvents = useCallback(
    (drafts: FixedEventDraft[]) => {
      update((current) => ({
        ...current,
        fixedEvents: [
          ...current.fixedEvents,
          ...drafts.map((draft) => ({ ...draft, id: createId() })),
        ],
      }))
    },
    [update],
  )

  const replaceFixedEvents = useCallback(
    (removeIds: string[], drafts: FixedEventDraft[]) => {
      const removing = new Set(removeIds)
      update((current) => ({
        ...current,
        fixedEvents: [
          ...current.fixedEvents.filter((event) => !removing.has(event.id)),
          ...drafts.map((draft) => ({ ...draft, id: createId() })),
        ],
      }))
    },
    [update],
  )

  const removeFixedEvents = useCallback(
    (ids: string[]) => {
      const removing = new Set(ids)
      update((current) => ({
        ...current,
        fixedEvents: current.fixedEvents.filter(
          (event) => !removing.has(event.id),
        ),
      }))
    },
    [update],
  )

  const updateSettings = useCallback(
    (patch: Partial<Settings>) => {
      update((current) => ({
        ...current,
        settings: { ...current.settings, ...patch },
      }))
    },
    [update],
  )

  const setWeekPlan = useCallback(
    (weekStart: string, slots: PlannedSlot[]) => {
      update((current) => ({
        ...current,
        plannedSlots: [
          ...current.plannedSlots.filter((slot) => slot.weekStart !== weekStart),
          ...slots,
        ],
      }))
    },
    [update],
  )

  const movePlannedSlot = useCallback(
    (id: string, position: { dayOfWeek: DayOfWeek; startMinutes: number }) => {
      update((current) => ({
        ...current,
        plannedSlots: current.plannedSlots.map((slot) =>
          slot.id === id
            ? {
                ...slot,
                dayOfWeek: position.dayOfWeek,
                startMinutes: position.startMinutes,
                endMinutes:
                  position.startMinutes + (slot.endMinutes - slot.startMinutes),
              }
            : slot,
        ),
      }))
    },
    [update],
  )

  const removePlannedSlot = useCallback(
    (id: string) => {
      update((current) => ({
        ...current,
        plannedSlots: current.plannedSlots.filter((slot) => slot.id !== id),
      }))
    },
    [update],
  )

  const recordLog = useCallback(
    (entry: Omit<LogEntry, 'id'>) => {
      update((current) => {
        const isSameRecord = (log: LogEntry) =>
          entry.slotId !== undefined
            ? log.slotId === entry.slotId
            : log.slotId === undefined &&
              log.habitId === entry.habitId &&
              log.date === entry.date
        return {
          ...current,
          logs: [
            ...current.logs.filter((log) => !isSameRecord(log)),
            { ...entry, id: createId() },
          ],
        }
      })
    },
    [update],
  )

  const removeLog = useCallback(
    (id: string) => {
      update((current) => ({
        ...current,
        logs: current.logs.filter((log) => log.id !== id),
      }))
    },
    [update],
  )

  const value = useMemo<AppStore>(
    () => ({
      data,
      update,
      addHabit,
      editHabit,
      setHabitActive,
      removeHabit,
      addFixedEvents,
      replaceFixedEvents,
      removeFixedEvents,
      updateSettings,
      setWeekPlan,
      movePlannedSlot,
      removePlannedSlot,
      recordLog,
      removeLog,
    }),
    [
      data,
      update,
      addHabit,
      editHabit,
      setHabitActive,
      removeHabit,
      addFixedEvents,
      replaceFixedEvents,
      removeFixedEvents,
      updateSettings,
      setWeekPlan,
      movePlannedSlot,
      removePlannedSlot,
      recordLog,
      removeLog,
    ],
  )

  return (
    <AppStoreContext value={value}>{children}</AppStoreContext>
  )
}
