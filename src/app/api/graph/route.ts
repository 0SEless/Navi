import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

async function getClient(auth: "publishable" | "secret") {
  const key = auth === "secret"
    ? process.env.SUPABASE_SERVICE_ROLE_KEY!
    : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key,
    {
      cookies: {
        getAll: () => [],
        setAll: () => {},
      },
    },
  );
}

export async function GET(request: NextRequest) {
  const supabase = await getClient("publishable");
  const { searchParams } = new URL(request.url);
  const campusId = searchParams.get("campus_id");

  if (!campusId) {
    return NextResponse.json({ error: "campus_id is required" }, { status: 400 });
  }

  const result = await supabase
    .from("graph_snapshots")
    .select("data, updated_at")
    .eq("campus_id", campusId)
    .maybeSingle() as unknown as { data: { data: unknown; updated_at?: string } | null; error: { message: string } | null };

  if (result.error) {
    console.error(`[api/graph] graph_snapshots query failed for campus "${campusId}":`, result.error);
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  if (result.data?.data) {
    return NextResponse.json({
      ...(result.data.data as Record<string, unknown>),
      updatedAt: result.data.updated_at ?? null,
    });
  }

  return NextResponse.json({
    version: "1.0.0",
    campusId: campusId,
    buildings: [],
    nodes: [],
    edges: [],
    components: [],
    exportedAt: new Date().toISOString(),
  });
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await getClient("secret");
    const body = await request.json();

    const { data: result, error: rpcError } = await supabase.rpc("sync_graph_snapshot", { payload: body });

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
      if (errMsg.includes("GRAPH_SNAPSHOT_CONFLICT")) {
        return NextResponse.json({ error: "The server changed since this editor loaded it. Your local changes were not overwritten." }, { status: 409 });
      }
      return NextResponse.json({ error: errMsg }, { status: 500 });
    }

    return NextResponse.json((result ?? { success: true }) as Record<string, unknown>);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid request";
    console.error("[api/graph] POST handler error:", e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
