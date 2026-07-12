import { useSyncExternalStore, useCallback, useState } from 'react'
import type { ValidationService } from '../../services/validation-service'
import type { ValidationIssue } from '../../validation/registry'

interface ProblemsPanelProps {
  validationService: ValidationService
}

type FilterMode = 'all' | 'building' | 'floor'

const SEVERITY_ORDER = ['error', 'warning', 'info'] as const
const SEVERITY_LABELS: Record<string, string> = { error: 'Errors', warning: 'Warnings', info: 'Info' }
const DEFAULT_EXPANDED: Record<string, boolean> = { error: true, warning: true, info: false }

export function ProblemsPanel({ validationService }: ProblemsPanelProps) {
  const snapshot = useSyncExternalStore(
    useCallback((cb: () => void) => {
      const id = setInterval(cb, 200)
      return () => clearInterval(id)
    }, []),
    () => validationService.getSnapshot(),
  )

  const [filter, setFilter] = useState<FilterMode>('all')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ ...DEFAULT_EXPANDED })

  const toggleExpanded = (severity: string) => {
    setExpanded(prev => ({ ...prev, [severity]: !prev[severity] }))
  }

  const handleIssueClick = (issue: ValidationIssue) => {
    validationService.focusIssue(issue)
  }

  const { issues, summary, pending, runningRevision } = snapshot

  if (issues.length === 0 && !pending) {
    return (
      <div className="problems-panel">
        <div className="problems-header">
          <span className="problems-title">Problems</span>
        </div>
        <div className="problems-empty">✓ No problems detected</div>
      </div>
    )
  }

  const groupedIssues = groupBySeverity(issues)

  return (
    <div className="problems-panel">
      <div className="problems-header">
        <span className="problems-title">Problems</span>
        <span className="problems-counts">
          {summary.errors > 0 && <span className="count-errors">{summary.errors}E</span>}
          {summary.warnings > 0 && <span className="count-warnings">{summary.warnings}W</span>}
          {summary.infos > 0 && <span className="count-infos">{summary.infos}I</span>}
        </span>
        <select
          className="problems-filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value as FilterMode)}
        >
          <option value="all">All</option>
          <option value="building">Current Building</option>
          <option value="floor">Current Floor</option>
        </select>
      </div>

      {pending && (
        <div className="problems-pending">
          {runningRevision !== null
            ? `Validating revision ${runningRevision}...`
            : 'Validating...'}
        </div>
      )}

      <div className="problems-list">
        {SEVERITY_ORDER.map(severity => {
          const items = groupedIssues[severity] ?? []
          if (items.length === 0) return null
          const isExpanded = expanded[severity]

          return (
            <div key={severity} className="problems-group">
              <div
                className="problems-group-header"
                onClick={() => toggleExpanded(severity)}
              >
                <span className="problems-group-toggle">{isExpanded ? '▼' : '▶'}</span>
                <span className="problems-group-label">
                  {SEVERITY_LABELS[severity]} ({items.length})
                </span>
              </div>
              {isExpanded && items.map(issue => (
                <div
                  key={issue.id}
                  className={`problems-issue severity-${issue.severity}`}
                  onClick={() => handleIssueClick(issue)}
                  title={issue.entityId ? `Click to focus: ${issue.entityId}` : ''}
                >
                  <span className="issue-icon">{issue.severity === 'error' ? '❌' : issue.severity === 'warning' ? '⚠' : 'ℹ'}</span>
                  <span className="issue-message">{issue.message}</span>
                  <span className="issue-validator">{issue.validatorId}</span>
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function groupBySeverity(issues: ValidationIssue[]): Record<string, ValidationIssue[]> {
  const groups: Record<string, ValidationIssue[]> = {}
  for (const issue of issues) {
    if (!groups[issue.severity]) groups[issue.severity] = []
    groups[issue.severity].push(issue)
  }
  return groups
}
