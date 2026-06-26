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
  const buildingId = searchParams.get("id");

  if (buildingId) {
    const { data, error } = await supabase
      .from("buildings")
      .select("id, campus_id, name, code, description, floors, color, floor_plan_url, created_at, updated_at")
      .eq("id", buildingId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Building not found" }, { status: 404 });
    }

    return NextResponse.json(data as Record<string, unknown>);
  }

  const { data, error } = await supabase
    .from("buildings")
    .select("id, campus_id, name, code, description, floors, color, floor_plan_url, created_at, updated_at")
    .eq("campus_id", campusId)
    .order("name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await getClient("secret");
    const body = await request.json();
    const { id, campus_id, name, code, description, floors, color, floor_plan_url } = body;

    if (!id || !name) {
      return NextResponse.json({ error: "id and name are required" }, { status: 400 });
    }

    const row = {
      id,
      campus_id: campus_id || "asu-ibajay",
      name,
      code: code ?? null,
      description: description ?? "",
      floors: floors ?? 1,
      color: color ?? "#64748B",
      floor_plan_url: floor_plan_url ?? null,
    };

    const { error } = await supabase.from("buildings").upsert(row, { onConflict: "id" });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid request";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await getClient("secret");
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const { error } = await supabase.from("buildings").delete().eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid request";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
