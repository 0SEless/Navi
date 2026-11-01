/** Shared by the server routes and the browser client (no server imports here). */

export const STUDIO_SESSION_HEADER = 'x-navi-studio-session'

/** 4 MiB: Vercel rejects larger request bodies (4.5 MB) before a handler runs. */
export const STUDIO_BODY_MAX_BYTES = 4 * 1024 * 1024
