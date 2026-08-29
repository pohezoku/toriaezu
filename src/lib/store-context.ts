import { createContext, useContext } from 'react'
import type { Suggestion } from './suggest'
import type {
  AppData,
  DayOfWeek,
  FixedEvent,
  Habit,
  LogEntry,
  PlannedSlot,
  Settings,
} from './types'

/** id と作成日時を除いた、フォームから編集できる部分。 */
export type HabitDraft = Omit<Habit, 'id' | 'createdAt'>

export type FixedEventDraft = Omit<FixedEvent, 'id'>

export interface AppStore {
  data: AppData
  /** 任意の更新。フェーズが進んだら専用メソッドを足していく。 */
  update: (recipe: (current: AppData) => AppData) => void
  addHabit: (draft: HabitDraft) => void
  editHabit: (id: string, draft: HabitDraft) => void
  setHabitActive: (id: string, active: boolean) => void
  /** 習慣を削除する。紐づく計画枠と記録も一緒に消える。 */
  removeHabit: (id: string) => void
  addFixedEvents: (drafts: FixedEventDraft[]) => void
  /** 同じ予定の曜日違いをまとめて置き換える。 */
  replaceFixedEvents: (removeIds: string[], drafts: FixedEventDraft[]) => void
  removeFixedEvents: (ids: string[]) => void
  updateSettings: (patch: Partial<Settings>) => void
  /** その週の計画をまるごと置き換える。 */
  setWeekPlan: (weekStart: string, slots: PlannedSlot[]) => void
  movePlannedSlot: (
    id: string,
    position: { dayOfWeek: DayOfWeek; startMinutes: number },
  ) => void
  removePlannedSlot: (id: string) => void
  /**
   * 実施・スキップを記録する。
   * 同じ枠の記録が既にあれば置き換える（枠に紐づかない記録は同じ日・同じ習慣で置き換える）。
   */
  recordLog: (entry: Omit<LogEntry, 'id'>) => void
  removeLog: (id: string) => void
  /** 提案を承認して習慣に反映する。承認するまで目標は変わらない（設計原則5）。 */
  approveSuggestion: (suggestion: Suggestion) => void
  /** 提案を見送る。その週のあいだは出さない。 */
  dismissSuggestion: (key: string, weekStart: string) => void
}

export const AppStoreContext = createContext<AppStore | null>(null)

export function useAppStore(): AppStore {
  const store = useContext(AppStoreContext)
  if (store === null) {
    throw new Error('useAppStore は AppStoreProvider の内側で呼んでください')
  }
  return store
}
