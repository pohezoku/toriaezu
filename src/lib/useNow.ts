import { useEffect, useState } from 'react'

/** 一定間隔で更新される現在時刻。日付またぎと「いまの時間帯」の強調に使う。 */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}
