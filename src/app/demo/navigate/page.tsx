'use client'

import { useState, useEffect } from 'react'
import { ArtifactLoader, RuntimeEngine } from '@navi/runtime'
import type { Route } from '@navi/runtime'

export default function NavigatePage() {
  const [engine, setEngine] = useState<RuntimeEngine | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [fromId, setFromId] = useState<string | null>(null)
  const [toId, setToId] = useState<string | null>(null)
  const [route, setRoute] = useState<Route | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const loader = new ArtifactLoader({ baseUrl: '/api/demo/artifacts?file=' })
        const rt = await RuntimeEngine.create(loader)
        setEngine(rt)
      } catch (err) {
        setError((err as Error).message)
      }
    }
    load()
  }, [])

  const handleSearch = () => {
    if (!engine || !searchQuery.trim()) return
    const r = engine.search.query(searchQuery.trim(), { maxResults: 10 })
    setResults(r)
  }

  const handleRoute = () => {
    if (!engine || !fromId || !toId) return
    const r = engine.routing.findRoute(fromId, toId)
    setRoute(r)
  }

  if (error) {
    return <div className="p-8 text-red-500">Error: {error}</div>
  }

  if (!engine) {
    return <div className="p-8">Loading runtime engine...</div>
  }

  const graph = engine.data.getGraph()
  const buildings = engine.data.getBuildings()

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">NAVI Runtime — Verification Page</h1>

      <div className="mb-6 p-4 bg-gray-50 rounded">
        <h2 className="font-semibold mb-2">Loaded Dataset</h2>
        <p>Campus: {graph.metadata.nodeCount} nodes, {graph.metadata.edgeCount} edges</p>
        <p>Buildings: {buildings.buildings.length}</p>
      </div>

      <div className="mb-6">
        <h2 className="font-semibold mb-2">Search</h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search for a room (e.g., 101)"
            className="border rounded px-3 py-2 flex-1"
          />
          <button onClick={handleSearch} className="bg-blue-500 text-white px-4 py-2 rounded">
            Search
          </button>
        </div>

        {results.length > 0 && (
          <ul className="mt-2 border rounded divide-y">
            {results.map((r, i) => (
              <li key={i} className="px-3 py-2 flex justify-between items-center">
                <span>{r.entry.label} ({r.entry.type}) — score {r.score.toFixed(1)}</span>
                <button
                  onClick={() => setFromId(r.entry.nodeId)}
                  className="text-xs bg-gray-200 px-2 py-1 rounded mr-1"
                >
                  From
                </button>
                <button
                  onClick={() => setToId(r.entry.nodeId)}
                  className="text-xs bg-gray-200 px-2 py-1 rounded"
                >
                  To
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mb-6">
        <h2 className="font-semibold mb-2">Route</h2>
        <div className="flex gap-2 items-center">
          <span className="text-sm">From: {fromId ? graph.nodes.find(n => n.id === fromId)?.label || fromId : '(none)'}</span>
          <span>→</span>
          <span className="text-sm">To: {toId ? graph.nodes.find(n => n.id === toId)?.label || toId : '(none)'}</span>
          <button onClick={handleRoute} disabled={!fromId || !toId} className="bg-green-500 text-white px-4 py-2 rounded disabled:opacity-50">
            Go
          </button>
        </div>

        {route && (
          <div className="mt-2 border rounded p-4">
            <p className="font-semibold">
              {route.fromLabel} → {route.toLabel}
            </p>
            <p className="text-sm text-gray-600">
              {Math.round(route.totalDistance)}m · ~{Math.round(route.totalDuration / 60)} min · {route.path.length} steps
            </p>
            <ol className="mt-2 space-y-1">
              {route.instructions.map((inst, i) => (
                <li key={i} className="text-sm">
                  <span className="font-mono text-xs text-gray-400">{inst.type.padEnd(10)}</span>
                  {inst.text}
                  {inst.distance > 0 && <span className="text-gray-400 ml-1">({Math.round(inst.distance)}m)</span>}
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>

      <div className="mt-8 p-4 bg-gray-50 rounded text-xs text-gray-500">
        <p><strong>Note:</strong> This is a verification page, not the final navigation UI. Its purpose is to prove the runtime can consume published artifacts.</p>
      </div>
    </div>
  )
}
