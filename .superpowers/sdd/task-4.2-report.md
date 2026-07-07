# Task 4.2 Report — Welcome Page with Location Detection

## Status: DONE

## Files Changed
| File | Change |
|------|--------|
| `navi-next/src/components/map/CampusMap.tsx` | Added props interface (`CampusMapProps` with `center`, `zoom`, `interactive`, `onMapLoaded`); changed to default export; applies `interactive` to Map constructor; calls `onMapLoaded` callback |
| `navi-next/src/app/page.tsx` | Replaced redirect-to-dashboard with a full Welcome page |

## Behaviour
- Hero section with title, description, and two CTAs ("Start Navigating" and "Explore Map") — both link to `/map`
- Non-interactive map preview via `CampusMap` (dynamically imported, `ssr: false`, `interactive={false}`, `zoom={15}`)
- Location detection via `useGeolocation` hook — shows loading, coordinates (±accuracy), error, or permission-denied state
- Campus cards fetched from `/api/campuses` with graceful fallback to 4 hardcoded ASU campuses on failure
- Responsive grid layout (1 col → 2 col → 4 col)
- Tailwind styling throughout

## Concerns
1. **`/api/campuses` backend does not exist yet** — the fetch will always fall back to hardcoded campuses until the API route is added
2. **Campus cards link to `/map?campus=...`** — the public map page does not yet parse query params for campus selection (expected in a later task)
3. **CampusMap no longer has a named export** — changed to `export default function CampusMap`; any code importing `{ CampusMap }` will break (verify cross-references)
