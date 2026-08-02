'use client'

import { type ReactNode, useEffect, useRef } from 'react'
import { AdaptiveNav } from './AdaptiveNav'
import { SplashOnboarding } from './SplashOnboarding'
import { usePublicStore, type TabId } from '@/store/public-store'
import { usePathname, useRouter } from 'next/navigation'

const pathToTab: Record<string, TabId> = {
  '/map/home': 'home',
  '/map/explore': 'explore',
  '/map/navigate': 'navigate',
  '/map/maps': 'maps',
  '/map/profile': 'profile',
}

const tabToPath: Record<TabId, string> = {
  home: '/map/home',
  explore: '/map/explore',
  navigate: '/map/navigate',
  maps: '/map/maps',
  profile: '/map/profile',
}

interface AdaptiveShellProps {
  children: ReactNode
}

export function AdaptiveShell({ children }: AdaptiveShellProps) {
  const pathname = usePathname()
  const router = useRouter()
  const activeTab = usePublicStore((s) => s.activeTab)
  const setTab = usePublicStore((s) => s.setTab)
  const lastTabRef = useRef<TabId | null>(null)

  useEffect(() => {
    const matchedTab = Object.entries(pathToTab).find(([path]) =>
      pathname.startsWith(path)
    )
    if (matchedTab) {
      setTab(matchedTab[1])
    }
  }, [pathname, setTab])

  // Redirect on nav clicks (tab changes), but never bounce nested pages
  // like /map/search which intentionally have no tab entry.
  useEffect(() => {
    const expectedPath = tabToPath[activeTab]
    if (!expectedPath) return
    const tabChanged = lastTabRef.current !== null && lastTabRef.current !== activeTab
    lastTabRef.current = activeTab
    if (!tabChanged) return
    if (pathname !== expectedPath && !pathname.startsWith(expectedPath)) {
      router.push(expectedPath)
    }
  }, [activeTab, pathname, router])

  return (
    <>
      <SplashOnboarding />
      <div className="flex h-dvh flex-col bg-[var(--navi-content)] lg:pl-56 pb-16 lg:pb-0">
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {children}
        </main>
      </div>
      <AdaptiveNav />
    </>
  )
}
