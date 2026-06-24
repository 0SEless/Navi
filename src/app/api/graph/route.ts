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
  const campusId = searchParams.get("campus_id") || "asu-ibajay";

  const result = await supabase
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
    const supabase = await getClient("secret");
    const body = await request.json();

    const { data: result, error: rpcError } = await supabase.rpc("sync_graph_snapshot", body as never);

    if (rpcError) {
      return NextResponse.json({ error: rpcError.message }, { status: 500 });
    }

    return NextResponse.json((result ?? { success: true }) as Record<string, unknown>);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid request";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
