'use client'

export interface LocationSuggestionProps {
  label: string
  accuracyM: number
  onConfirm: () => void
  onReject: () => void
}

export function LocationSuggestion({ label, accuracyM, onConfirm, onReject }: LocationSuggestionProps) {
  return (
    <section className="pointer-events-auto rounded-xl border border-[var(--navi-border)] bg-[var(--navi-card)] p-3 shadow-lg" aria-label="Confirm starting point">
      <p className="text-sm text-[var(--navi-text)]">You seem to be near {label} (±{Math.round(accuracyM)} m). Is that right?</p>
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={onConfirm} className="min-h-11 flex-1 rounded-lg bg-[var(--navi-primary)] px-3 text-sm font-semibold text-white">Yes</button>
        <button type="button" onClick={onReject} className="min-h-11 flex-1 rounded-lg border border-[var(--navi-border)] px-3 text-sm font-semibold text-[var(--navi-text)]">No</button>
      </div>
    </section>
  )
}
