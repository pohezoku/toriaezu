import type { ReactNode } from 'react'

type Props = {
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
}

/** 各画面の共通レイアウト。 */
export function Screen({ title, description, action, children }: Props) {
  return (
    <div className="mx-auto max-w-2xl px-5 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">{title}</h2>
          {description !== undefined && (
            <p className="mt-1 text-sm leading-relaxed text-ink-soft">
              {description}
            </p>
          )}
        </div>
        {action}
      </div>
      <div className="mt-6">{children}</div>
    </div>
  )
}
