'use client'

import { Building2, Camera, MapPin, Plus, Search } from 'lucide-react'
import type { PanoramaView } from '../selectors'
import { groupTourScenes } from '../tour-selectors'
import styles from './VirtualTourWorkspace.module.css'

export function SceneExplorer({ scenes, total, selectedId, query, onQueryChange, onSelect }: { scenes: PanoramaView[]; total: number; selectedId: string | null; query: string; onQueryChange: (value: string) => void; onSelect: (id: string) => void }) {
  const groups = groupTourScenes(scenes)
  return <div className={styles.explorer}>
    <div className={styles.panelHeading}><h2>Scenes</h2><button disabled title="Scene creation needs a standalone canonical command context"><Plus size={15} />Add Scene</button></div>
    <label className={styles.search}><Search size={15} /><input aria-label="Search scenes" type="search" placeholder="Search scenes…" value={query} onChange={event => onQueryChange(event.target.value)} /></label>
    <p className={styles.count}>Showing {scenes.length} of {total} scenes</p>
    {query && <button onClick={() => onQueryChange('')}>Clear search</button>}
    <div className={styles.sceneGroups} onKeyDown={event => {
      if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
      const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-scene]')].filter(button => !button.closest('details:not([open])'))
      const index = buttons.indexOf(event.target as HTMLButtonElement)
      if (index < 0) return
      event.preventDefault()
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))
      buttons[next]?.focus()
    }}>
      {groups.map(group => <details key={group.id} open><summary>{group.id === 'outdoor' ? <MapPin size={15} /> : <Building2 size={15} />}{group.label}</summary>
        {group.sections.map(section => {
          const Section = section.label ? 'details' : 'div'
          return <Section key={section.id} className={styles.floor} {...(section.label ? { open: true } : {})}>
          {section.label && <summary>{section.label}</summary>}
          {section.scenes.map(scene => <button key={scene.id} data-scene aria-label={`Select scene ${scene.label}`} aria-pressed={selectedId === scene.id} className={styles.scene} onClick={() => onSelect(scene.id)}>
            <span className={styles.sceneSymbol} data-missing={!scene.hasImage}><Camera size={18} /></span>
            <span>{scene.label}</span><span className={styles.healthDot} data-health={scene.health} title={scene.health.replaceAll('-', ' ')} />
          </button>)}
        </Section>})}
      </details>)}
      {!scenes.length && query && <p>No scenes match your search.</p>}
    </div>
    <p className={styles.panelNote}>Select a scene to explore its 360° view.</p>
  </div>
}
