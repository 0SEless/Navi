'use client'

export default function HomePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] p-4 text-center">
      <div className="text-4xl mb-4">🏠</div>
      <h1 className="text-xl font-semibold text-[var(--navi-text)]">Home</h1>
      <p className="text-sm text-[var(--navi-text-secondary)] mt-1">Dashboard coming soon</p>
    </div>
  )
}
