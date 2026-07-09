// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { ProblemsPanel } from './ProblemsPanel'
import type { ValidationIssue } from '../validation'

afterEach(cleanup)

describe('ProblemsPanel', () => {
  it('shows no problems message when empty', () => {
    render(<ProblemsPanel issues={[]} />)
    expect(screen.getByText('No problems')).toBeDefined()
  })

  it('renders issues with severity and message', () => {
    const issues: ValidationIssue[] = [
      { severity: 'error', message: 'Footprint not closed', validatorId: 'polygon-closure', entityId: 'bld-1' },
      { severity: 'warning', message: 'Room has no name', validatorId: 'naming', entityId: 'rm-1' },
    ]
    render(<ProblemsPanel issues={issues} />)
    expect(screen.getByText('Footprint not closed')).toBeDefined()
    expect(screen.getByText('Room has no name')).toBeDefined()
  })
})
