import { useCallback, useEffect, useRef, useState } from 'react'

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export type InstallRequestResult = 'accepted' | 'dismissed' | 'ios-help' | 'browser-help'

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)

  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  return isOnline
}

export function useDailyDate() {
  const [today, setToday] = useState(() => new Date())

  useEffect(() => {
    const refresh = () => setToday((current) => {
      const next = new Date()
      return current.toDateString() === next.toDateString() ? current : next
    })
    const interval = window.setInterval(refresh, 60_000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])

  return today
}

export function useRotatingProgress(active: boolean, count: number, intervalMs = 1500) {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (!active || count < 2) {
      setIndex(0)
      return undefined
    }
    const interval = window.setInterval(() => {
      setIndex((current) => (current + 1) % count)
    }, intervalMs)
    return () => window.clearInterval(interval)
  }, [active, count, intervalMs])

  return index
}

export function useIdleFeaturePrefetch(enabled: boolean, preload: () => void) {
  useEffect(() => {
    if (!enabled || !navigator.onLine) return undefined
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
    if (connection?.saveData) return undefined

    const idleApi = window as unknown as {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
      cancelIdleCallback?: (id: number) => void
    }
    if (idleApi.requestIdleCallback) {
      const idleId = idleApi.requestIdleCallback(preload, { timeout: 800 })
      return () => idleApi.cancelIdleCallback?.(idleId)
    }

    const timer = setTimeout(preload, 800)
    return () => clearTimeout(timer)
  }, [enabled, preload])
}

export function usePwaInstall() {
  const promptRef = useRef<InstallPromptEvent | null>(null)
  const [canInstall, setCanInstall] = useState(false)
  const [isInstalled, setIsInstalled] = useState(() => {
    const standaloneNavigator = navigator as Navigator & { standalone?: boolean }
    return window.matchMedia('(display-mode: standalone)').matches || standaloneNavigator.standalone === true
  })

  useEffect(() => {
    const handleBeforeInstall = (event: Event) => {
      event.preventDefault()
      promptRef.current = event as InstallPromptEvent
      setCanInstall(true)
    }
    const handleInstalled = () => {
      promptRef.current = null
      setCanInstall(false)
      setIsInstalled(true)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstall)
    window.addEventListener('appinstalled', handleInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  const requestInstall = useCallback(async (): Promise<InstallRequestResult> => {
    if (promptRef.current) {
      await promptRef.current.prompt()
      const choice = await promptRef.current.userChoice
      if (choice.outcome === 'accepted') setCanInstall(false)
      return choice.outcome
    }
    return /iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'ios-help' : 'browser-help'
  }, [])

  return { canInstall, isInstalled, requestInstall }
}
