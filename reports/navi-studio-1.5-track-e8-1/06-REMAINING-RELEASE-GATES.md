# Remaining Release Gates

E8.1 is **PARTIAL** and does not authorize enabling scoped saving by default or replacing `/api/graph`.

Before a release decision:

1. Diagnose why the normalized Studio manual-save workflow produces no captured scoped POST; fix only the E8-specific path and repeat with a fresh E5 synthetic campus.
2. Prove exactly one building operation, one revision, exact acknowledgment, E5 GET reconstruction, and browser reload with the unrelated Lab unchanged.
3. Exercise route and terrain edits and atomic multi-scope behavior through the actual editor.
4. Inject browser network failure and stale revision conflict; confirm IndexedDB drafts survive and an exact retry resolves the pending mutation.
5. Run a true flags-off editor save test and confirm it uses the legacy `/api/graph` path while scoped persistence remains disabled.
6. Complete the full focused regression set and review the remaining repository-wide TypeScript and ESLint diagnostics separately.

Synthetic PostgreSQL tests establish only that the tested local E5 adapter and database behavior worked. They do not prove that the real Development database has a verified backup, restore compatibility, or recoverability. A real Development backup still requires the approved backup/recovery gates and owner authorization for that operation. Production, Supabase, Vercel, deployment, and GitHub actions remain out of scope.

**Next milestone: Track E8.2 — unblock and pass the single-building browser save/reload gate, then finish the remaining editor scenarios above.**
