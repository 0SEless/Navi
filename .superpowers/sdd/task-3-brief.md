### Task 3: Auto-toggle Node/Edge Layers During Vertex Editing

**Files:**
- Modify: `navi-next/src/components/studio/StudioCanvas.tsx`

**Interfaces:**
- Consumes: `useStudioStore.isVertexEditing`, `useStudioStore.layers`, `useStudioStore.setLayers`
- Produces: NODES/NODES_CONNECTION layers auto-shown during vertex editing, auto-restored to user's layer preference on exit

When the user enters vertex editing (`setVertexEditing('trace', id)`), the node layers should appear. On exit, they should return to their previous visibility state (the `layers.nodes` store value).

- [ ] **Step 1: Add auto-layer effect in StudioCanvas.tsx**

Add after the existing layer visibility effect (after line 654):
```tsx
// Auto-show node layers during vertex editing
useEffect(() => {
  const map = mapRef.current
  if (!map || !readyRef.current) return

  const setVis = (layerId: string, visible: boolean) => {
    try { map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none') } catch { /* ok */ }
  }

  if (isVertexEditing) {
    setVis(LYR.NODES, true)
    setVis(LYR.NODES_CONNECTION, true)
  } else {
    // Restore to user's layer preference
    setVis(LYR.NODES, layers.nodes)
    setVis(LYR.NODES_CONNECTION, layers.nodes)
  }
}, [isVertexEditing, mapInstance])
```

You'll need to add `isVertexEditing` to the subscriptions at the top of the component. Add `const isVertexEditing = useStudioStore((s) => s.isVertexEditing)` near the other store subscriptions (around line 238, near `editTargetType`).

- [ ] **Step 2: Verify build compiles**

Run: `cd navi-next && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add navi-next/src/components/studio/StudioCanvas.tsx
git commit -m "feat(route): auto-show node layers during vertex editing"
```
