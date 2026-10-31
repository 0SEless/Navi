# Save UX Verification

The opt-in local draft mode now presents local durability separately from cloud acknowledgement in the Floor Editor header. IndexedDB draft state takes precedence over older pending cloud state, so a durable local edit is not mislabeled as merely unsaved. While a cloud save is pending, a newer authored edit is independently written to the local draft store; after the older request is acknowledged, the UI reports local-only saved state for the newer edit instead of claiming that it reached the server.

The new local write is debounced/coalesced, gated on browser and IndexedDB availability, and does not call a cloud endpoint. Cloud Save continues through the existing guarded save path. With the local-draft feature disabled, the existing save-status path remains in use.

Verification covered delayed acknowledgement, edit-during-pending-save, local recovery, quota failure, offline operation, and disabled-mode behavior against local mocks. A real Supabase acknowledgement, production latency, or live campus save was not tested.
