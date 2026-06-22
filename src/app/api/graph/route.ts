import { NextRequest, NextResponse } from "next/server";
import { createSupabaseContext } from "@supabase/server";

export async function GET(request: NextRequest) {
  const { data: ctx, error } = await createSupabaseContext(request, { auth: "publishable" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { searchParams } = new URL(request.url);
  const campusId = searchParams.get("campus_id") || "asu-ibajay";

  // ponytail: raw typed assertion because @supabase/server types are noisy
  const result = await ctx.supabase
    .from("graph_snapshots")
    .select("data")
    .eq("campus_id", campusId)
    .maybeSingle() as unknown as { data: { data: unknown } | null; error: { message: string } | null };

  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  if (result.data?.data) {
    return NextResponse.json(result.data.data as Record<string, unknown>);
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
    const { data: ctx, error } = await createSupabaseContext(request, { auth: "secret" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const body = await request.json();

    const { data: result, error: rpcError } = await ctx.supabaseAdmin.rpc("sync_graph_snapshot", body as never);

    if (rpcError) {
      return NextResponse.json({ error: rpcError.message }, { status: 500 });
    }

    return NextResponse.json((result ?? { success: true }) as Record<string, unknown>);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid request";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
