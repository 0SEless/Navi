import { NextRequest, NextResponse } from 'next/server';
import { getGraphClient as getClient, saveGraphRequest } from '@/lib/graph-write-handler';
export { getClient };

export async function GET(request: NextRequest) {
  const supabase = await getClient("publishable");
  const { searchParams } = new URL(request.url);
  const campusId = searchParams.get("campus_id");

  if (!campusId) {
    return NextResponse.json({ error: "campus_id is required" }, { status: 400 });
  }

  const result = await supabase
    .from("graph_snapshots")
    .select("data, authored_document, updated_at")
    .eq("campus_id", campusId)
    .maybeSingle() as unknown as {
      data: { data: unknown; authored_document?: unknown; updated_at?: string } | null
      error: { message: string } | null
    };

  if (result.error) {
    console.error(`[api/graph] graph_snapshots query failed for campus "${campusId}":`, result.error);
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  if (result.data?.data) {
    const response: Record<string, unknown> = {
      ...(result.data.data as Record<string, unknown>),
      updatedAt: result.data.updated_at ?? null,
    }
    if (result.data.authored_document !== null && result.data.authored_document !== undefined) {
      response.authoredDocumentFormatVersion = 1
      response.authoredDocument = result.data.authored_document
    }
    return NextResponse.json(response);
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
  return saveGraphRequest(request);
}
