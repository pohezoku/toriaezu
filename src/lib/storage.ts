import type { AppData, Settings } from './types'

/**
 * 保存層。localStorage への読み書きは必ずこのファイルを経由する。
 * 後でサーバー同期に差し替えるときは、ここだけ書き換えれば済むようにしておく。
 */

const STORAGE_KEY = 'habit-planner/data'
/** 読み込みに失敗したデータの退避先。壊れたデータを黙って捨てないため。 */
const BACKUP_KEY = 'habit-planner/data.broken'
const SCHEMA_VERSION = 1

export const DEFAULT_SETTINGS: Settings = {
  wakeMinutes: 7 * 60,
  sleepMinutes: 23 * 60 + 30,
  bufferMinutes: 15,
  maxFillRatio: 0.7,
  maxDailyHabitMinutes: 3 * 60,
}

export function createEmptyData(): AppData {
  return {
    schemaVersion: SCHEMA_VERSION,
    habits: [],
    fixedEvents: [],
    settings: { ...DEFAULT_SETTINGS },
    plannedSlots: [],
    logs: [],
    dismissedSuggestions: [],
  }
}

export function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * 保存済みデータを読む。壊れていた場合は退避したうえで空データを返す。
 * 欠けているキーは既定値で補うので、スキーマを足しても古いデータが読める。
 */
export function loadData(): AppData {
  const empty = createEmptyData()
  let raw: string | null = null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch {
    // プライベートブラウジング等で localStorage が使えない場合はメモリ上だけで動かす
    return empty
  }
  if (raw === null) return empty

  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) throw new Error('保存データの形式が不正です')
    return {
      schemaVersion: SCHEMA_VERSION,
      habits: Array.isArray(parsed.habits) ? parsed.habits : empty.habits,
      fixedEvents: Array.isArray(parsed.fixedEvents)
        ? parsed.fixedEvents
        : empty.fixedEvents,
      settings: isRecord(parsed.settings)
        ? { ...empty.settings, ...parsed.settings }
        : empty.settings,
      plannedSlots: Array.isArray(parsed.plannedSlots)
        ? parsed.plannedSlots
        : empty.plannedSlots,
      logs: Array.isArray(parsed.logs) ? parsed.logs : empty.logs,
      dismissedSuggestions: Array.isArray(parsed.dismissedSuggestions)
        ? parsed.dismissedSuggestions
        : empty.dismissedSuggestions,
    } as AppData
  } catch (error) {
    console.error('保存データを読めなかったため退避します', error)
    try {
      localStorage.setItem(BACKUP_KEY, raw)
    } catch {
      // 退避できなくても続行する
    }
    return empty
  }
}

export function saveData(data: AppData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch (error) {
    console.error('保存に失敗しました', error)
  }
}

/** データを全消去する（デバッグ・やり直し用）。 */
export function clearData(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // 消せなくても続行する
  }
}
