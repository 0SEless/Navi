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

  if (campusId) {
    const { data, error } = await supabase
      .from("graph_snapshots")
      .select("campus_id, version, updated_at")
      .eq("campus_id", campusId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Campus not found" }, { status: 404 });
    }

    const { count: buildingCount } = await supabase
      .from("buildings")
      .select("*", { count: "exact", head: true })
      .eq("campus_id", campusId);

    const { count: nodeCount } = await supabase
      .from("route_nodes")
      .select("*", { count: "exact", head: true })
      .eq("campus_id", campusId);

    return NextResponse.json({
      id: data.campus_id,
      campus_id: data.campus_id,
      version: data.version,
      updated_at: data.updated_at,
      building_count: buildingCount ?? 0,
      node_count: nodeCount ?? 0,
    });
  }

  const { data, error } = await supabase
    .from("graph_snapshots")
    .select("campus_id, version, updated_at")
    .order("campus_id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const enriched = await Promise.all(
    (data ?? []).map(async (c) => {
      const { count: bc } = await supabase
        .from("buildings")
        .select("*", { count: "exact", head: true })
        .eq("campus_id", c.campus_id);
      return { ...c, building_count: bc ?? 0 };
    }),
  );

  return NextResponse.json(enriched);
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await getClient("secret");
    const body = await request.json();
    const { campus_id, name, description, address } = body;

    if (!campus_id) {
      return NextResponse.json({ error: "campus_id is required" }, { status: 400 });
    }

    const { error: snapError } = await supabase
      .from("graph_snapshots")
      .upsert(
        {
          campus_id,
          data: { campusId: campus_id, name: name || campus_id, description: description || "", address: address || "" },
          version: "1.0.0",
        },
        { onConflict: "campus_id" },
      );

    if (snapError) {
      return NextResponse.json({ error: snapError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, campus_id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid request";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await getClient("secret");
    const { searchParams } = new URL(request.url);
    const campusId = searchParams.get("campus_id");

    if (!campusId) {
      return NextResponse.json({ error: "campus_id is required" }, { status: 400 });
    }

    await supabase.from("route_edges").delete().eq("campus_id", campusId);
    await supabase.from("route_nodes").delete().eq("campus_id", campusId);
    await supabase.from("buildings").delete().eq("campus_id", campusId);
    const { error } = await supabase.from("graph_snapshots").delete().eq("campus_id", campusId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, campus_id: campusId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid request";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
