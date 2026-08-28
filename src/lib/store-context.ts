import { createContext, useContext } from 'react'
import type { AppData, FixedEvent, Habit, Settings } from './types'

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
}

export const AppStoreContext = createContext<AppStore | null>(null)

export function useAppStore(): AppStore {
  const store = useContext(AppStoreContext)
  if (store === null) {
    throw new Error('useAppStore は AppStoreProvider の内側で呼んでください')
  }
  return store
}
