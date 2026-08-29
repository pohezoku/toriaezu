type Props = {
  title: string
  description: string
  phase: string
}

/** 各フェーズで中身を実装するまでの仮表示。 */
export function Placeholder({ title, description, phase }: Props) {
  return (
    <div className="mx-auto max-w-2xl px-5 py-10">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">{description}</p>
      <div className="mt-8 rounded-xl border border-dashed border-line bg-card px-5 py-8 text-center">
        <p className="text-sm text-ink-faint">{phase} で実装します</p>
      </div>
    </div>
  )
}
