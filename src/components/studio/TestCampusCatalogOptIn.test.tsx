import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { TestCampusCatalogOptIn } from './TestCampusCatalogOptIn'
import { TEST_CAMPUS_ID, TEST_CAMPUS_PROJECT_REF } from '@/lib/studio/test-campus-catalog'

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
})

describe('TestCampusCatalogOptIn', () => {
  it('shows the explicit opt-in only for the exact test campus in the dev project', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', `https://${TEST_CAMPUS_PROJECT_REF}.supabase.co`)

    render(<TestCampusCatalogOptIn campusId={TEST_CAMPUS_ID} />)
    expect(screen.getByRole('button', { name: 'Enable this disposable campus in this browser' })).toBeTruthy()
  })

  it('does not show an opt-in for another campus, project, or production mode', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', `https://${TEST_CAMPUS_PROJECT_REF}.supabase.co`)
    const wrongCampus = render(<TestCampusCatalogOptIn campusId="another-campus" />)
    expect(screen.queryByRole('button')).toBeNull()
    wrongCampus.unmount()

    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://wrong-project.supabase.co')
    const wrongProject = render(<TestCampusCatalogOptIn campusId={TEST_CAMPUS_ID} />)
    expect(screen.queryByRole('button')).toBeNull()
    wrongProject.unmount()

    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', `https://${TEST_CAMPUS_PROJECT_REF}.supabase.co`)
    vi.stubEnv('NODE_ENV', 'production')
    render(<TestCampusCatalogOptIn campusId={TEST_CAMPUS_ID} />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
