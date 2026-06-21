import { NextRequest, NextResponse } from "next/server";
import { getSupabaseContext } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  const ctx = await getSupabaseContext(request, "publishable");
  const { searchParams } = new URL(request.url);
  const campusId = searchParams.get("campus_id") || "asu-ibajay";

  const { data, error } = await ctx.supabase
    .from("graph_snapshots")
    .select("data")
    .eq("campus_id", campusId)
    .single();

  if (error && error.code !== "PGRST116") {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (data?.data) {
    return NextResponse.json(data.data);
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
    const ctx = await getSupabaseContext(request, "secret");
    const body = await request.json();

    const { data, error } = await ctx.supabaseAdmin.rpc("sync_graph_snapshot", {
      payload: body,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data ?? { success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid request";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
