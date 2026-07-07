# Task 4.4 Report — Search Bar with Autocomplete

## Status: DONE

## Files Changed
| File | Change |
|------|--------|
| `navi-next/src/components/search/SearchBar.tsx` | Created search bar with autocomplete dropdown |

## Behaviour
- Text input with search icon, clear button, and placeholder
- Debounced (150ms) local filtering of `graph.nodes` by `label`, `type`, or `id` (case-insensitive)
- Dropdown shows up to 10 matching results with highlighted match text and type badge
- Keyboard navigation: Arrow Up/Down to move focus, Enter to select, Escape to close
- Click or mouse-down on a result selects it and fires `onSelect(node)` callback
- Blur closes the dropdown (with 200ms delay to allow click)
- Uses `useGraphStore((s) => s.graph)` for reactive node list
- Tailwind styling consistent with existing UI components (using CSS variable tokens like `--ring`, `--accent`, `--popover`, `--muted`, `--background`, `--border`, `--input`, `--foreground`)

## Concerns
1. Filtering is purely client-side over all nodes — large graphs may benefit from virtualization or server-side search later
2. The component uses `'use client'` and must be dynamically imported (`next/dynamic` with `ssr: false`) if used in a server component
3. No index export created for the `search/` directory — consumers should import via `import { SearchBar } from '@/components/search/SearchBar'`
