# Browser Acceptance Matrix

All results below are from synthetic data in isolated localhost sessions. No real campus or cloud service was used.

| Scenario | Result | Evidence |
| --- | --- | --- |
| Local edit persists after editor refresh | PASS | `logs/browser-local-draft-saved.png`; Playwright enabled run |
| Building/floor switching keeps drafts scoped | PASS | Enabled Playwright scenario; synthetic two-building, GF/1F fixture |
| Offline edit remains locally durable without cloud write | PASS | Enabled Playwright scenario; external network blocked |
| IndexedDB quota failure is surfaced without cloud fallback | PASS | `logs/browser-local-draft-quota-error.png` |
| Corrupt draft is preserved and recovery fails closed | PASS | Enabled Playwright scenario |
| Manual cloud save acknowledgement while a newer edit is pending | PASS | `logs/browser-cloud-save-ack.png`; server mock keeps acknowledged older body, newest edit remains locally saved |
| Browser process restart restores latest local draft | PASS | `logs/browser-process-restart-recovery.png`; isolated persistent Playwright profile |
| Opt-in disabled: no local draft, no cloud POST, conflict guard retained | PASS | Separate Playwright run, 1/1; `logs/playwright-results.json` |

Enabled-draft run: 6 passed / 1 skipped (the disabled-mode case was run separately). Disabled-mode run: 1 passed. No browser acceptance was performed against Production, Preview, Supabase, R2, or real campus data.
