import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  assertCampusMutationAllowed,
  getCampusIdFromBody,
  getOptionalJsonBody,
  getQueryParam,
  requireVerifiedMutationAuth,
} from "@/lib/api-guard";
import {
  isSaveV2PublicReadEnabled,
  readCurrentPublication,
  readPublishedCampuses,
} from "@/studio-v2/server/public-read";
import type { PublicationRow } from "@/studio-v2/server/types";

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

// ── Save v2 public catalog (server env NAVI_SAVE_V2_PUBLIC_READ=1) ──
//
// Same field names and types as the legacy GET below, built from Save v2
// publications: only campuses with a current publication are listed, in
// campus_id order, and graph_snapshots / buildings / route_nodes are never read.
// name, description and address come from the campus as it was when the
// publication was recorded (ruling R22). Fields whose legacy source was a
// draft table keep their names and types but now describe the publication:
//   version         legacy graph_snapshots.version (text, normally "1.0.0");
//                   here String(publicationNo)
//   updated_at      legacy draft save time; here the publication time
//   building_count  legacy count of `buildings` rows; here
//                   artifacts.buildingIndex.buildings.length
//   node_count      (single campus) legacy count of `route_nodes` rows; here
//                   artifacts.graph.nodes.length

function textSetting(settings: Record<string, unknown>, key: string): string {
  const value = settings[key];
  return typeof value === "string" ? value : "";
}

function lengthAt(value: unknown, first: string, second: string): number {
  const outer = typeof value === "object" && value !== null ? (value as Record<string, unknown>)[first] : undefined;
  const inner = typeof outer === "object" && outer !== null ? (outer as Record<string, unknown>)[second] : undefined;
  return Array.isArray(inner) ? inner.length : 0;
}

function catalogEntry(campusId: string, publication: PublicationRow) {
  const settings = publication.campusSettings ?? {};
  return {
    id: campusId,
    campus_id: campusId,
    name: typeof publication.campusName === "string" ? publication.campusName : campusId,
    description: textSetting(settings, "description"),
    address: textSetting(settings, "address"),
    version: String(publication.publicationNo),
    updated_at: publication.publishedAt,
    building_count: lengthAt(publication.artifacts, "buildingIndex", "buildings"),
  };
}

async function getFromPublications(campusId: string | null) {
  try {
    if (campusId) {
      const publication = await readCurrentPublication(campusId);
      if (!publication) {
        return NextResponse.json({ error: "Campus not found" }, { status: 404 });
      }
      return NextResponse.json({
        ...catalogEntry(campusId, publication),
        node_count: lengthAt(publication.artifacts, "graph", "nodes"),
      });
    }

    const entries = [];
    for (const campus of await readPublishedCampuses()) {
      const publication = await readCurrentPublication(campus.id);
      if (publication) entries.push(catalogEntry(campus.id, publication));
    }
    return NextResponse.json(entries);
  } catch {
    console.warn("[campuses] publication read failed");
    return NextResponse.json({ error: "Campus catalog is temporarily unavailable" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  if (isSaveV2PublicReadEnabled()) {
    return getFromPublications(new URL(request.url).searchParams.get("campus_id"));
  }

  const supabase = await getClient("publishable");
  const { searchParams } = new URL(request.url);
  const campusId = searchParams.get("campus_id");

  if (campusId) {
    const { data, error } = await supabase
      .from("graph_snapshots")
      .select("campus_id, version, updated_at, data")
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

    const snapData = (data.data ?? {}) as Record<string, unknown>;
    return NextResponse.json({
      id: data.campus_id,
      campus_id: data.campus_id,
      name: typeof snapData.name === 'string' ? snapData.name : data.campus_id,
      description: typeof snapData.description === 'string' ? snapData.description : '',
      address: typeof snapData.address === 'string' ? snapData.address : '',
      version: data.version,
      updated_at: data.updated_at,
      building_count: buildingCount ?? 0,
      node_count: nodeCount ?? 0,
    });
  }

  const { data, error } = await supabase
    .from("graph_snapshots")
    .select("campus_id, version, updated_at, data")
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
      const snapData = (c.data ?? {}) as Record<string, unknown>;
      return {
        id: c.campus_id,
        campus_id: c.campus_id,
        name: typeof snapData.name === 'string' ? snapData.name : c.campus_id,
        description: typeof snapData.description === 'string' ? snapData.description : '',
        address: typeof snapData.address === 'string' ? snapData.address : '',
        version: c.version,
        updated_at: c.updated_at,
        building_count: bc ?? 0,
      };
    }),
  );

  return NextResponse.json(enriched);
}

export async function POST(request: NextRequest) {
  try {
    const unauthorized = await requireVerifiedMutationAuth(request);
    if (unauthorized) return unauthorized;

    const body = await request.json();
    const { campus_id, name, description, address } = body;

    if (!campus_id) {
      return NextResponse.json({ error: "campus_id is required" }, { status: 400 });
    }

    const blocked = assertCampusMutationAllowed(campus_id);
    if (blocked) return blocked;

    const supabase = await getClient("secret");
    const { error: snapError } = await supabase
      .from("graph_snapshots")
      .insert({
        campus_id,
        data: { campusId: campus_id, name: name || campus_id, description: description || "", address: address || "" },
        version: "1.0.0",
      });

    if (snapError) {
      if (snapError.code === '23505') {
        return NextResponse.json(
          { error: 'Campus already exists', code: 'CAMPUS_ALREADY_EXISTS' },
          { status: 409 },
        );
      }
      const snapMsg = snapError.message || 'Failed to create campus';
      return NextResponse.json({ error: snapMsg }, { status: 500 });
    }

    return NextResponse.json({ success: true, campus_id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid request";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const unauthorized = await requireVerifiedMutationAuth(request);
    if (unauthorized) return unauthorized;

    const body = await getOptionalJsonBody(request);
    const campusId =
      getQueryParam(request, "campus_id", "campusId") ?? getCampusIdFromBody(body);

    if (!campusId) {
      return NextResponse.json({ error: "campus_id is required" }, { status: 400 });
    }

    const blocked = assertCampusMutationAllowed(campusId);
    if (blocked) return blocked;

    const supabase = await getClient("secret");
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
