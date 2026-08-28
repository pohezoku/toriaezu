export const CATEGORIES = ['運動', '学習', '美容', '練習', 'その他'] as const
export type Category = (typeof CATEGORIES)[number]

export const TIME_PREFS = ['指定なし', '朝', '昼', '夜'] as const
export type TimePref = (typeof TIME_PREFS)[number]

export type TargetType = 'count' | 'minutes'

/** 1 が最優先。 */
export type Priority = 1 | 2 | 3

/** 0=月 … 6=日。週の始まりを月曜として扱う。 */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6

export interface Habit {
  id: string
  name: string
  category: Category
  /** 週◯回（count）か、週◯分（minutes）か。 */
  targetType: TargetType
  targetValue: number
  /** 1回あたりの最低所要時間（分）。 */
  minBlockMinutes: number
  timePref: TimePref
  priority: Priority
  /** 筋トレ等、連日を避けたい場合に true。 */
  avoidConsecutiveDays: boolean
  active: boolean
  createdAt: string
}

/** 固定予定の種類。FixedEvent.category は自由文字列だが、入力はこの中から選ぶ。 */
export const EVENT_CATEGORIES = [
  '授業',
  'バイト',
  '部活',
  'インターン',
  'その他',
] as const

export interface FixedEvent {
  id: string
  dayOfWeek: DayOfWeek
  /** 0:00 からの分。 */
  startMinutes: number
  endMinutes: number
  label: string
  category: string
}

export interface Settings {
  wakeMinutes: number
  sleepMinutes: number
  /** 予定の前後に確保する余白（分）。 */
  bufferMinutes: number
  /** 空き時間を埋める上限。設計原則2により既定 0.7。 */
  maxFillRatio: number
}

export interface PlannedSlot {
  id: string
  /** その週の月曜（ISO 日付 yyyy-MM-dd）。 */
  weekStart: string
  habitId: string
  dayOfWeek: DayOfWeek
  startMinutes: number
  endMinutes: number
  /** 予備枠かどうか。予備枠には習慣を割り当てない。 */
  isReserve: boolean
}

export type LogStatus = 'done' | 'skipped'

export interface LogEntry {
  id: string
  /** ISO 日付 yyyy-MM-dd。 */
  date: string
  habitId: string
  status: LogStatus
  actualMinutes?: number
  /** 計画枠に紐づくか。枠外の自発的な実施もあり得るので任意。 */
  slotId?: string
}

/** localStorage に保存される全データ。 */
export interface AppData {
  schemaVersion: number
  habits: Habit[]
  fixedEvents: FixedEvent[]
  settings: Settings
  plannedSlots: PlannedSlot[]
  logs: LogEntry[]
}
