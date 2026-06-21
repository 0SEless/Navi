import { NextRequest, NextResponse } from "next/server";
import { createSupabaseContext } from "@supabase/server";

export async function GET(request: NextRequest) {
  const { data: ctx, error } = await createSupabaseContext(request, { auth: "publishable" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { searchParams } = new URL(request.url);
  const campusId = searchParams.get("campus_id") || "asu-ibajay";

  const { data: snapshot, error: snapError } = await ctx.supabase
    .from("graph_snapshots")
    .select("data")
    .eq("campus_id", campusId)
    .single();

  if (snapError && snapError.code !== "PGRST116") {
    return NextResponse.json({ error: snapError.message }, { status: 500 });
  }

  if (snapshot?.data) {
    return NextResponse.json(snapshot.data);
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

    const { data: result, error: rpcError } = await ctx.supabaseAdmin.rpc("sync_graph_snapshot", {
      payload: body,
    });

    if (rpcError) {
      return NextResponse.json({ error: rpcError.message }, { status: 500 });
    }

    return NextResponse.json(result ?? { success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid request";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
