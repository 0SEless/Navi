'use client'

import { useEffect, useState } from 'react'
import { TEST_CAMPUS_ID, TEST_CAMPUS_OPT_IN_KEY } from '@/lib/studio/test-campus-catalog'

export function TestCampusCatalogOptIn({ campusId }: { campusId: string }) {
  const [enabled, setEnabled] = useState(false)
  const isDevelopmentTest = process.env.NODE_ENV === 'development' && campusId === TEST_CAMPUS_ID

  let expectedProject = false
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')
    expectedProject = url.protocol === 'https:' && url.hostname === 'scvgulusmutnzasmgysx.supabase.co'
  } catch {
    expectedProject = false
  }
  const canOfferOptIn = isDevelopmentTest && expectedProject

  useEffect(() => {
    if (!canOfferOptIn) return
    try {
      setEnabled(window.localStorage.getItem(TEST_CAMPUS_OPT_IN_KEY) === TEST_CAMPUS_ID)
    } catch {
      setEnabled(false)
    }
  }, [canOfferOptIn])

  if (!canOfferOptIn || enabled) return null

  return (
    <button
      type="button"
      onClick={() => {
        try {
          window.localStorage.setItem(TEST_CAMPUS_OPT_IN_KEY, TEST_CAMPUS_ID)
          window.location.reload()
        } catch {
          setEnabled(false)
        }
      }}
      style={{
        marginTop: 12,
        border: '1px solid var(--navi-border)',
        borderRadius: 8,
        padding: '8px 12px',
        background: 'var(--navi-card)',
        color: 'var(--navi-text)',
        cursor: 'pointer',
      }}
    >
      Enable this disposable campus in this browser
    </button>
  )
}
