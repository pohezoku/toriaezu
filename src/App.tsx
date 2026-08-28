import { useState } from 'react'
import { FixedEvents } from './screens/FixedEvents'
import { Habits } from './screens/Habits'
import { Review } from './screens/Review'
import { Today } from './screens/Today'
import { WeekPlan } from './screens/WeekPlan'

const TABS = [
  { id: 'today', label: '今日', render: () => <Today /> },
  { id: 'week', label: '週の計画', render: () => <WeekPlan /> },
  { id: 'habits', label: '習慣', render: () => <Habits /> },
  { id: 'fixed', label: '固定予定', render: () => <FixedEvents /> },
  { id: 'review', label: '振り返り', render: () => <Review /> },
] as const

type TabId = (typeof TABS)[number]['id']

export default function App() {
  // 起動時の初期画面は「今日」（設計図 2-①）
  const [tab, setTab] = useState<TabId>('today')
  const active = TABS.find((t) => t.id === tab) ?? TABS[0]

  return (
    <div className="flex min-h-full flex-col">
      {/* ホーム画面から開いたとき、ステータスバーやホームバーに隠れないよう余白を取る */}
      <header className="border-b border-line bg-card pt-[env(safe-area-inset-top)]">
        <div className="mx-auto max-w-2xl px-5 py-3">
          <p className="text-sm font-semibold tracking-wide">習慣プランナー</p>
        </div>
      </header>

      <main className="flex-1 pb-[calc(5rem+env(safe-area-inset-bottom))]">
        {active.render()}
      </main>

      <nav className="fixed inset-x-0 bottom-0 border-t border-line bg-card pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-2xl">
          {TABS.map((t) => {
            const selected = t.id === tab
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                aria-current={selected ? 'page' : undefined}
                className={`flex-1 px-1 py-3 text-xs transition-colors ${
                  selected
                    ? 'font-semibold text-accent'
                    : 'text-ink-faint hover:text-ink-soft'
                }`}
              >
                {t.label}
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
