'use client'

import { useState, useEffect } from 'react'
import { Check, X, AlertCircle } from 'lucide-react'

export interface ImportToastData {
  message: string
  type: 'success' | 'error'
}

let _globalSetToast: ((data: ImportToastData | null) => void) | null = null

/** Call from anywhere to show a brief toast notification. */
export function showImportToast(data: ImportToastData): void {
  _globalSetToast?.(data)
  setTimeout(() => _globalSetToast?.(null), 3000)
}

export function ImportToast() {
  const [toast, setToast] = useState<ImportToastData | null>(null)
  _globalSetToast = setToast as any

  useEffect(() => {
    return () => { _globalSetToast = null }
  }, [])

  if (!toast) return null

  const isSuccess = toast.type === 'success'

  return (
    <div style={{
      position: 'absolute', top: 12, right: 12, zIndex: 20,
      padding: '8px 14px',
      borderRadius: 8,
      border: '1px solid',
      borderColor: isSuccess ? '#10B981' : '#EF4444',
      background: isSuccess ? '#F0FDF4' : '#FEF2F2',
      color: isSuccess ? '#065F46' : '#991B1B',
      fontSize: 12,
      fontWeight: 500,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      boxShadow: '0 2px 12px rgba(0,0,0,0.1)',
      pointerEvents: 'auto',
      animation: 'fadeIn 0.2s ease-out',
    }}>
      {isSuccess ? <Check size={14} /> : <AlertCircle size={14} />}
      <span>{toast.message}</span>
      <button
        onClick={() => setToast(null)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          padding: 0, display: 'flex', color: 'inherit', opacity: 0.6,
        }}
      >
        <X size={12} />
      </button>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  )
}
