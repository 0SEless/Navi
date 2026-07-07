'use client'

import { type ReactNode, useEffect } from 'react'
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

  useEffect(() => {
    const matchedTab = Object.entries(pathToTab).find(([path]) =>
      pathname.startsWith(path)
    )
    if (matchedTab) {
      setTab(matchedTab[1])
    }
  }, [pathname, setTab])

  useEffect(() => {
    const expectedPath = tabToPath[activeTab]
    if (expectedPath && pathname !== expectedPath && !pathname.startsWith(expectedPath)) {
      router.push(expectedPath)
    }
  }, [activeTab, pathname, router])

  return (
    <>
      <SplashOnboarding />
      <div className="min-h-screen bg-[var(--navi-content)] lg:pl-56 pb-16 lg:pb-0">
        <main className="h-full">
          {children}
        </main>
      </div>
      <AdaptiveNav />
    </>
  )
}
