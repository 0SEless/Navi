import type { ValidationIssue } from '../validation'

interface ProblemsPanelProps {
  issues: ValidationIssue[]
}

const severityColors: Record<string, string> = {
  error: '#f14c4c',
  warning: '#cca700',
  info: '#3794ff',
}

export function ProblemsPanel({ issues }: ProblemsPanelProps) {
  if (issues.length === 0) {
    return (
      <div style={{ padding: 12, fontSize: 13, fontFamily: 'system-ui, sans-serif', color: '#666', fontStyle: 'italic' }}>
        No problems
      </div>
    )
  }

  return (
    <div style={{ fontSize: 13, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{
        fontWeight: 600,
        padding: '6px 8px',
        color: '#fff',
        textTransform: 'uppercase',
        fontSize: 11,
        letterSpacing: 1,
        borderBottom: '1px solid #333',
      }}>
        Problems ({issues.length})
      </div>
      {issues.map((issue, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 6,
            padding: '4px 8px',
            borderBottom: '1px solid #2a2a2a',
            cursor: 'default',
          }}
        >
          <span style={{
            color: severityColors[issue.severity] || '#ccc',
            fontSize: 10,
            marginTop: 3,
          }}>
            {issue.severity === 'error' ? '●' : issue.severity === 'warning' ? '◆' : '■'}
          </span>
          <div>
            <div style={{ color: '#ccc' }}>{issue.message}</div>
            {issue.entityId && (
              <div style={{ color: '#666', fontSize: 11 }}>
                {issue.entityId} · {issue.validatorId}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
