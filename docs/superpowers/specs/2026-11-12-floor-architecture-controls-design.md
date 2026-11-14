# Floor architecture controls — design for review

Date: 2026-11-12. Status: planned, not implemented. Owner asked for a validated plan before implementation. Existing door-validation changes and their rollback checkpoint remain separate and uncommitted.

## Intent

Trace architectural geometry over a floor plan in 2D; inspect the same authored geometry in 2.5D. Give authors control over wall heights, attached doors/windows, then columns and floor heights. Eventually show recognizable stacked buildings, balconies and open corridors on the public campus map. Furniture, arbitrary imported models, detailed roof shapes and full CAD/BIM are excluded.

## Constraints

Work only in D:\CODEme\Navi\.navi-worktrees\navi-save-v2 on feat/save-v2. No commits/staging without instruction. Preserve all unrelated existing edits. No Save, Done or Publish unless the owner authorizes the exact campus change. No old navi-development or trial map writes; never expose .env.import.local. Do not use clear-reference autofixes. Use the existing port3001 server and 3GB watchdog; no second server. Single-worker targeted tests. Keep database save4 unchanged during development; synthetic fixtures and in-memory previews prove behavior first.

## Approaches

Recommended: extend the existing wall/door commands and MapLibre extrusion geometry; reuse the same geometry generator for preview and later public rendering. This uses the current stack and supports low walls, rectangular windows and simple columns without model assets.

Alternative: replace architecture with custom 3D meshes now. This permits richer roofs/assets but adds picking, clipping, terrain alignment and mobile performance work before the requested controls exist. Defer until extrusion geometry proves insufficient.

A marker-only window implementation is insufficient: the request requires visible openings in 2.5D.

## Confirmed code facts

Wall already has height/thickness. Floor already has height/elevation. wall.update exists; generic floor height updates recalculate floor elevations. FloorEditorCanvas calls wallsToExtrusionCollection without openings, so current wall prisms remain solid. Floor.openings has wallId/offset/width/height/sillHeight; Floor.doors uses spatial RoomDoor objects with independent routeConnection. Existing windows/openings are separate representations and must not be silently merged. Floor preview intentionally renders its active floor at z=0. Multi-floor contexts use building base plus floor.elevation. Compiler floorGeometry emits wall/opening details, but its current returned floor record does not explicitly carry floor.height. Public building-slabs currently emits a solid footprint block, so it cannot reveal balconies just by editing the floor preview.

## First implementation release: walls, attached doors/windows, opening-aware preview

1. Select a wall in Architecture and edit positive finite height and thickness. A Use floor height button copies the current floor height; it is NOT an invisible inheritance mode. Existing numeric heights stay unchanged until edited. Lowering wall height never creates navigation access or deletes a room boundary. Reject a height/thickness edit that would invalidate an existing attached aperture and list the conflicting doors/windows; never silently clamp existing attachments.
2. Door drawing retains click-and-drag. Acquire and highlight the active-floor wall at drag start; project both drag endpoints onto that wall; width equals their along-wall separation. Door center lies on the wall centerline and rotation follows its tangent. Depth remains centered across it. Lock the candidate wall throughout the drag; reject too-short spans or spans beyond wall ends instead of jumping to another wall. Escape cancels with no document change.
3. Add optional RoomDoor.wallAttachment = {wallId:string, offset:number, openingHeight:number}. offset is the center measured from the host wall start in local meters; width remains RoomDoor.width. New attached doors use openingHeight=2.1m capped by host wall height, subject to valid positive geometry; an impossibly short wall requires correction rather than a zero-height door. Derived position/rotation are synchronized through commands for current consumers. Unattached legacy doors remain byte-identical. Existing-door attachment is an explicit reviewed operation, preserving door ID, room ownership and route references.
4. New windows use Floor.openings entries of type window on canonical Floor.walls, with explicit width, sillHeight and height. Do not dual-write Floor.windows. Existing legacy window data remains readable and unmodified; renderer normalization must avoid duplicate apertures. New opening defaults: width1.2m, sill0.9m, height1.2m, and only accept if the host wall can contain them. Invalid values keep the draft and show an error. Existing Opening.offset is the START of its span; its interval is [offset, offset+width]. Attached RoomDoor.offset is a CENTER; its interval is [offset-width/2, offset+width/2]. Convert explicitly when normalizing rendering input, without rewriting old records.
5. Generate solid wall volumes around attached door/window apertures using horizontal span and vertical base/top. Windows retain wall below the sill and above the head; doors retain a lintel when shorter than the wall. Full-height door openings are allowed when they fit. Never generate negative/zero-height extrusion pieces. Overlapping new apertures and spans outside wall bounds are refused with an explanation. Existing overlaps are reported, not silently rewritten.
6. Wall movement carries attachments and door route anchors; connector distances update in the same undoable command, keeping target route nodes unchanged. A formerly valid connector that crosses a moved wall becomes a validation issue, never silently disconnected. Split/merge operations remap attachment offsets and host IDs for canonical openings and attached doors on both retained and removed hosts, accounting for reversed wall direction/origin changes. Refuse merging walls with incompatible height/thickness until explicitly made compatible; splitting through an aperture, shortening past an attachment, or deleting an attached wall is refused until the author explicitly resolves the attachment. Preserve explicitly assigned owning rooms; ambiguous ownership is shown for review.
7. New tools must be exposed through the real Architecture dock and floor inspector, with normal room selection suspended during drawing/attachment gestures. One completed gesture/property edit is one Undo step. Failed/refused commands keep selection and show actionable feedback. Lock refusal and read-only floors produce no mutation. Editor exit is navigation away, not Done.

## Later releases, independently reviewed

B: Floor height controls, using explicit affected-floor review and atomic undo/save across all shifted floor parts. Never silently resize custom wall heights. Validate stairs, doors, windows and attached outdoor stair landings. A floor-to-floor/slab-thickness model must be settled before changing existing elevation semantics.

C: Rectangular/circular architectural columns and low corridor edge walls. Columns are separate architectural geometry, not fake rooms/POIs/wall loops, and do not automatically alter the route graph. A visible corridor opening does not imply traversability. Slabs, open spans and columns compose a balcony-like appearance. Persist/export column records before exposing the tool.

D: Public stacked architectural view. Keep lightweight blocks at overview zoom; show detailed authored floors at close zoom without drawing the solid block over them. Selecting a floor hides higher floors and roof. Use shared geometry, stable IDs, actual elevations and terrain base once. Cache per building/floor and measure on a small-phone viewport. Roof design and assets remain separate proposals.

Connect Doors remains a separate saved design; wall attachment will improve its ownership and exit-side inputs, but batch route suggestions are not part of this release.

## Acceptance and limits

A low corridor wall, full room wall, diagonal attached door and rectangular window are authored in2D and correctly previewed in2.5D. Identical commands survive undo/redo, serialization, split/join and synthetic save/load. Architecture changes alone do not change route IDs/edges except the explicitly moved door anchor and incident distances. Editor active-floor geometry remains at z0; future multi-floor geometry uses actual elevation. No production-campus write is part of acceptance. Existing Preview export/refusal defects are baseline findings, not permission to clear references or weaken publishing checks. No claim of CAD precision, structural correctness or collision-free navigation is made from appearance alone.

Implementation gate: compiler door floorGeometry must preserve wallAttachment/openingHeight through emission and reading, and both window tool paths must create canonical Floor.openings. This is part of release A acceptance, not optional later cleanup.
