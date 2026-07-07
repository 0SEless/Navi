# REMEMBER

Critical project warnings and things to keep in mind.

## 🔴 Never Commit .env.local

The `navi-next/.env.local` file contains **real production credentials** for Supabase (project URL, anon key, service role keys) and Cloudinary (API key, API secret). It is listed in `.gitignore` but must never be force-added or committed.

**See:** [[06 Errors/Never Commit .env.local]] for full details.
