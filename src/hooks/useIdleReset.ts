'use client'

import { useEffect, useRef } from 'react'

export const GATE_IDLE_MS = 60_000

export function useIdleReset(ms: number, onIdle: () => void): void {
  const callbackRef = useRef(onIdle)
  callbackRef.current = onIdle
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const reset = () => {
      clearTimeout(timer)
      timer = setTimeout(() => callbackRef.current(), ms)
    }
    const events: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'touchstart']
    for (const event of events) window.addEventListener(event, reset, { passive: true })
    reset()
    return () => {
      clearTimeout(timer)
      for (const event of events) window.removeEventListener(event, reset)
    }
  }, [ms])
}
