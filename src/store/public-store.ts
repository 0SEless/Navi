'use client'

import { create } from 'zustand'
import type { Building, NavNode } from '@/types/nav-types'

export type TabId = 'home' | 'explore' | 'navigate' | 'maps' | 'profile'

export type SheetState = 'collapsed' | 'half' | 'full' | 'hidden'
export type MapMode = 'explore' | 'navigate'

export interface PublicState {
  activeTab: TabId
  sheetState: SheetState
  mapMode: MapMode
  fromNode: string | null
  toNode: string | null
  selectedBuilding: Building | null
  selectedNode: NavNode | null

  recentDestinations: string[]    // node IDs, max 8
  recentSearches: string[]        // query strings, max 8
  onboardingComplete: boolean

  setTab: (tab: TabId) => void
  setSheet: (state: SheetState) => void
  setMapMode: (mode: MapMode) => void
  setFrom: (nodeId: string | null) => void
  setTo: (nodeId: string | null) => void
  selectBuilding: (b: Building | null) => void
  selectNode: (n: NavNode | null) => void
  addRecentDestination: (nodeId: string) => void
  addRecentSearch: (query: string) => void
  completeOnboarding: () => void
  resetOnboarding: () => void
}

const RECENT_DEST_KEY = 'navi-recent-destinations'
const RECENT_SEARCH_KEY = 'navi-recent-searches'
const ONBOARDING_KEY = 'navi-onboarded'
const MAX_RECENT = 8

function loadArray(key: string): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveArray(key: string, arr: string[]) {
  if (typeof window === 'undefined') return
  localStorage.setItem(key, JSON.stringify(arr))
}

export const usePublicStore = create<PublicState>((set, get) => ({
  activeTab: 'home',
  sheetState: 'hidden',
  mapMode: 'explore',
  fromNode: null,
  toNode: null,
  selectedBuilding: null,
  selectedNode: null,
  recentDestinations: loadArray(RECENT_DEST_KEY),
  recentSearches: loadArray(RECENT_SEARCH_KEY),
  onboardingComplete: typeof window !== 'undefined'
    ? localStorage.getItem(ONBOARDING_KEY) === 'true'
    : false,

  setTab: (tab) => set({ activeTab: tab }),

  setSheet: (state) => set({ sheetState: state }),

  setMapMode: (mode) => set({ mapMode: mode }),

  setFrom: (nodeId) => set({ fromNode: nodeId }),
  setTo: (nodeId) => set({ toNode: nodeId }),

  selectBuilding: (b) => set({ selectedBuilding: b }),
  selectNode: (n) => set({ selectedNode: n }),

  addRecentDestination: (nodeId) => {
    const current = get().recentDestinations
    const updated = [nodeId, ...current.filter((id) => id !== nodeId)].slice(0, MAX_RECENT)
    saveArray(RECENT_DEST_KEY, updated)
    set({ recentDestinations: updated })
  },

  addRecentSearch: (query) => {
    const current = get().recentSearches
    const updated = [query, ...current.filter((q) => q !== query)].slice(0, MAX_RECENT)
    saveArray(RECENT_SEARCH_KEY, updated)
    set({ recentSearches: updated })
  },

  completeOnboarding: () => {
    localStorage.setItem(ONBOARDING_KEY, 'true')
    set({ onboardingComplete: true })
  },

  resetOnboarding: () => {
    localStorage.removeItem(ONBOARDING_KEY)
    set({ onboardingComplete: false })
  },
}))
