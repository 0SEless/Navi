import type { ReactNode } from 'react'

export const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#1a1a2e',
  color: '#ccc',
  border: '1px solid #444',
  borderRadius: 3,
  padding: '3px 6px',
  fontSize: 12,
  boxSizing: 'border-box',
}

export const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ color: '#888', fontSize: 11, marginBottom: 2 }}>{label}</div>
      {children}
    </div>
  )
}
