import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { supabaseSecretKeyOrUndefined } from "@/lib/supabase-privileged";
import { supabasePublicKeyOrUndefined } from "@/lib/supabase-public";
import {
  assertCampusMutationAllowed,
  getCampusIdFromBody,
  getOptionalJsonBody,
  getQueryParam,
  requireVerifiedMutationAuth,
} from "@/lib/api-guard";

async function getClient(auth: "publishable" | "secret") {
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
    },
  );
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const campusId = searchParams.get("campus_id");
  const buildingId = searchParams.get("id");

  if (buildingId) {
    if (!campusId) {
      return NextResponse.json({ error: "campus_id is required when id is provided" }, { status: 400 });
    }
    const supabase = await getClient("publishable");
    const { data, error } = await supabase
      .from("buildings")
      .select("id, campus_id, name, code, description, floors, color, floor_plan_url, created_at, updated_at")
      .eq("campus_id", campusId)
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

  if (!campusId) {
    return NextResponse.json({ error: "campus_id is required" }, { status: 400 });
  }

  const supabase = await getClient("publishable");
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
    const unauthorized = await requireVerifiedMutationAuth(request);
    if (unauthorized) return unauthorized;

    const body = await request.json();
    const { id, campus_id, name, code, description, floors, color, floor_plan_url } = body;

    if (!id || !name || !campus_id) {
      return NextResponse.json({ error: "id, name, and campus_id are required" }, { status: 400 });
    }

    const blocked = assertCampusMutationAllowed(campus_id);
    if (blocked) return blocked;

    const supabase = await getClient("secret");

    const row = {
      id,
      campus_id,
      name,
      code: code ?? null,
      description: description ?? "",
      floors: floors ?? 1,
      color: color ?? "#64748B",
      floor_plan_url: floor_plan_url ?? null,
    };

    const { error } = await supabase.from("buildings").upsert(row, { onConflict: "campus_id,id" });

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
    const unauthorized = await requireVerifiedMutationAuth(request);
    if (unauthorized) return unauthorized;

    const id = getQueryParam(request, "id");

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const body = await getOptionalJsonBody(request);
    const campusId =
      getQueryParam(request, "campus_id", "campusId") ?? getCampusIdFromBody(body);

    if (!campusId) {
      return NextResponse.json({ error: "campus_id is required" }, { status: 400 });
    }

    const blocked = assertCampusMutationAllowed(campusId);
    if (blocked) return blocked;

    const supabase = await getClient("secret");
    const { error } = await supabase.from("buildings").delete().eq("campus_id", campusId).eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid request";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
