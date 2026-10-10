import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { parseAuthoredGraphPayload } from '@/services/authored-snapshot-persistence';
import { fullSnapshotFingerprint } from '@/services/full-snapshot-identity';
import {
  assertCampusMutationAllowed,
  getCampusIdFromBody,
  requireVerifiedMutationAuth,
} from "@/lib/api-guard";
import { assertSafeSupabaseWriteTarget } from "@/lib/supabase-target-guard";
import { supabaseSecretKeyOrUndefined } from "@/lib/supabase-privileged";
import { supabasePublicKeyOrUndefined } from "@/lib/supabase-public";

const RPC_TIMEOUT_MS = 30000

type MutationOutcome =
  | "SUCCESS"
  | "REPLAY"
  | "CAS_CONFLICT"
  | "MUTATION_COLLISION"
  | "INVALID_REQUEST"
  | "TIMEOUT"
  | "UPSTREAM_ERROR"
  | "UNKNOWN"

function logMutationLifecycle(entry: {
  requestId: string
  mutationId: string | null
  campusId: string | null
  expectedRevision: string | null
  durationMs: number
  outcome: MutationOutcome
  status: number
}): void {
  // Structured lifecycle log. Never includes the graph payload or credentials.
  console.log(`[api/graph] lifecycle ${JSON.stringify(entry)}`)
}

function isAbortLike(error: unknown, controller: AbortController): boolean {
  if (controller.signal.aborted) return true
  const name = (error as { name?: string } | null)?.name
  const message = error instanceof Error ? error.message : String((error as { message?: string } | null)?.message ?? "")
  return name === "AbortError" || /abort/i.test(message)
}

export async function getGraphClient(auth: "publishable" | "secret", signal?: AbortSignal) {
  const key = auth === "secret"
    ? supabaseSecretKeyOrUndefined()!
    : supabasePublicKeyOrUndefined()!;
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key,
    {
      cookies: {
        getAll: () => [],
        setAll: () => {},
      },
      // The per-request AbortSignal must reach the real network fetch so a
      // timed-out request stops occupying a connection instead of leaking.
      global: {
        fetch: (input: RequestInfo | URL, init?: RequestInit) =>
          fetch(input, { ...(init ?? {}), signal }),
      },
    },
  );
}

export async function saveGraphRequest(request: NextRequest, options: { recovery?: boolean } = {}) {
  const requestId = (globalThis.crypto?.randomUUID?.() ?? `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeoutTimer = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
  let mutationId: string | null = null;
  let campusId: string | null = null;
  let expectedRevision: string | null = null;
  let outcome: MutationOutcome = "UNKNOWN";
  let status = 500;

  try {
    let actorId: string | null = null;
    const unauthorized = await requireVerifiedMutationAuth(request, { onVerified: user => { actorId = user.id; } });
    if (unauthorized) return unauthorized;
    if (!actorId) {
      outcome = 'INVALID_REQUEST';
      status = 401;
      return NextResponse.json({ error: 'Verified actor identity is required.' }, { status });
    }

    // A verified admin is about to mutate the configured Supabase project. If
    // this non-production runtime is pointed at a protected project, stop before
    // any mutation rather than writing with the service-role key.
    const unsafeTarget = assertSafeSupabaseWriteTarget();
    if (unsafeTarget) {
      outcome = 'INVALID_REQUEST';
      status = unsafeTarget.status;
      return unsafeTarget;
    }

    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid snapshot request.');
    mutationId = typeof body?.mutationId === "string" ? body.mutationId : null;
    campusId = getCampusIdFromBody(body) ?? null;
    expectedRevision = typeof body?.expectedServerUpdatedAt === "string" ? body.expectedServerUpdatedAt : null;

    if (!campusId) {
      outcome = "INVALID_REQUEST";
      status = 400;
      return NextResponse.json({ error: "campusId is required" }, { status });
    }

    const blocked = assertCampusMutationAllowed(campusId);
    if (blocked) return blocked;

    if (!Object.prototype.hasOwnProperty.call(body, 'expectedServerUpdatedAt') ||
        (body.expectedServerUpdatedAt !== null && (typeof body.expectedServerUpdatedAt !== 'string' || !Number.isFinite(Date.parse(body.expectedServerUpdatedAt))))) {
      outcome = 'INVALID_REQUEST'; status = 400;
      return NextResponse.json({ error: 'An explicit expected server revision is required (NULL only for initial creation).' }, { status });
    }
    if (!mutationId?.trim()) {
      outcome = 'INVALID_REQUEST'; status = 400;
      return NextResponse.json({ error: 'A mutation identity is required.' }, { status });
    }
    if (body.forceServerOverwrite !== undefined && body.forceServerOverwrite !== false) {
      outcome = 'INVALID_REQUEST'; status = 403;
      return NextResponse.json({ error: 'Force overwrite is forbidden. Administrator recovery uses a separate revision-checked action.' }, { status });
    }
    const purpose = typeof body.recoveryPurpose === 'string' ? body.recoveryPurpose.trim() : '';
    if (options.recovery && (!expectedRevision || !purpose)) {
      outcome = 'INVALID_REQUEST'; status = 400;
      return NextResponse.json({ error: 'Administrator recovery requires a current revision and an explicit purpose.' }, { status });
    }
    // Caller metadata never grants recovery or supplies actor/content authority.
    const trustedPayload = { ...body, createdBy: actorId, revisionSource: options.recovery ? 'admin-recovery' : 'autosave', persistenceProtocol: 2 };
    delete trustedPayload.committedContentFingerprint;
    delete trustedPayload.committedRevision;
    delete trustedPayload.recoveryPurpose;
    if (options.recovery) trustedPayload.recoveryPurpose = purpose;

    const supabase = await getGraphClient("secret", controller.signal);
    const incoming = parseAuthoredGraphPayload(body);
    if (incoming.authoredDocument && incoming.authoredDocument.metadata.campusId !== campusId) throw new Error('Authored document campus does not match the snapshot campus.');
    if (!incoming.authoredDocument) {
      const existing = await supabase.from('graph_snapshots').select('authored_document').eq('campus_id', campusId).maybeSingle();
      if (existing.error) throw new Error(existing.error.message);
      if (existing.data?.authored_document != null) {
        outcome = 'INVALID_REQUEST';
        status = 409;
        return NextResponse.json({ error: 'AUTHORED_DOCUMENT_DOWNGRADE: a modern snapshot requires its authored document.' }, { status });
      }
    }
    // No unsafe fallback: the v2 entry point proves migration 017 is installed.
    const { data: result, error: rpcError } = await supabase.rpc(
      options.recovery ? 'recover_graph_snapshot_idempotent_v2' : 'sync_graph_snapshot_idempotent_v2',
      { payload: trustedPayload },
    );

    if (rpcError) {
      // Normalize the RPC error. postgrest-js can surface two shapes:
      //  1. A wrapped fetch failure — `message` = "TypeError: fetch failed",
      //     `details` = "TypeError: fetch failed\n\nCaused by: TypeError: fetch failed (ECONNREFUSED)"
      //  2. A malformed/empty error object (`{}`) from an upstream 5xx with a
      //     non-JSON body — all fields undefined. Prefer the wrapped cause so
      //     the client's network-error detection actually works; fall back to
      //     a stable generic message otherwise.
      const errMsg = rpcError.message || rpcError.details || "Supabase RPC failed";
      console.error("[api/graph] sync_graph_snapshot RPC failed:", {
        message: rpcError.message ?? null,
        code: rpcError.code ?? null,
        hint: rpcError.hint ?? null,
        details: rpcError.details ?? null,
      });
      if (isAbortLike(rpcError, controller)) {
        outcome = "TIMEOUT";
        status = 504;
        return NextResponse.json(
          { error: "The save request timed out on the server. It was NOT retried; local changes are preserved and the next save will re-check the authoritative revision." },
          { status: 504 },
        );
      }
      if (/GRAPH_REVISION_REQUIRED|GRAPH_SNAPSHOT_INVALID|MUTATION_ID_REQUIRED|GRAPH_RECOVERY_REQUIRED/.test(errMsg)) {
        outcome = 'INVALID_REQUEST'; status = 400;
        return NextResponse.json({ error: errMsg }, { status });
      }
      if (/GRAPH_FORCE_FORBIDDEN/.test(errMsg)) {
        outcome = 'INVALID_REQUEST'; status = 403;
        return NextResponse.json({ error: 'Force overwrite is forbidden.' }, { status });
      }
      if (/AUTHORED_DOCUMENT_DOWNGRADE/.test(errMsg)) {
        outcome = 'INVALID_REQUEST'; status = 409;
        return NextResponse.json({ error: 'The authored document cannot be cleared by a Graph-only writer.' }, { status });
      }
      if (/could not find the function|does not exist|PGRST202/i.test(errMsg)) {
        outcome = 'UPSTREAM_ERROR'; status = 503;
        return NextResponse.json({ error: 'Safe persistence is temporarily unavailable. Local changes are preserved.' }, { status });
      }
      if (errMsg.includes("GRAPH_SNAPSHOT_CONFLICT")) {
        outcome = "CAS_CONFLICT";
        status = 409;
        return NextResponse.json({ error: "The server changed since this editor loaded it. Your local changes were not overwritten." }, { status: 409 });
      }
      if (errMsg.includes("MUTATION_ID_COLLISION")) {
        outcome = "MUTATION_COLLISION";
        status = 409;
        return NextResponse.json({ error: "Mutation id collision: this save identity was already used with different content." }, { status: 409 });
      }
      outcome = "UPSTREAM_ERROR";
      status = 500;
      return NextResponse.json({ error: errMsg }, { status: 500 });
    }

    const replay = Boolean((result as { idempotent_replay?: boolean } | null)?.idempotent_replay);
    const rpcRevision = (result as { updatedAt?: unknown } | null)?.updatedAt;
    if (typeof rpcRevision !== 'string' || !rpcRevision || !mutationId) {
      status = 503;
      return NextResponse.json({ error: 'The committed revision could not be confirmed.' }, { status });
    }
    // Read the immutable revision, not the current head: another writer may
    // already have advanced it, and an idempotent replay refers to the original.
    const committed = await supabase.from('campus_graph_revisions')
      .select('graph_data, authored_document, revision')
      .eq('campus_id', campusId).eq('revision', rpcRevision).maybeSingle();
    if (committed.error || !committed.data?.graph_data || typeof committed.data.revision !== 'string') {
      status = 503;
      return NextResponse.json({ error: 'The committed content could not be confirmed.' }, { status });
    }
    const committedRevision = committed.data.revision;
    const committedContentFingerprint = fullSnapshotFingerprint({
      ...(committed.data.graph_data as Record<string, unknown>),
      authoredDocument: committed.data.authored_document ?? null,
    });
    outcome = replay ? "REPLAY" : "SUCCESS";
    status = 200;
    return NextResponse.json({ ...(result as Record<string, unknown>), campusId, mutationId, updatedAt: committedRevision, committedRevision, committedContentFingerprint });
  } catch (e) {
    if (isAbortLike(e, controller)) {
      outcome = "TIMEOUT";
      status = 504;
      return NextResponse.json(
        { error: "The save request timed out on the server. It was NOT retried; local changes are preserved and the next save will re-check the authoritative revision." },
        { status: 504 },
      );
    }
    const msg = e instanceof Error ? e.message : "Invalid request";
    console.error("[api/graph] POST handler error:", e);
    outcome = "UNKNOWN";
    status = 400;
    return NextResponse.json({ error: msg }, { status: 400 });
  } finally {
    clearTimeout(timeoutTimer);
    logMutationLifecycle({
      requestId,
      mutationId,
      campusId,
      expectedRevision,
      durationMs: Date.now() - startedAt,
      outcome,
      status,
    });
  }
}
