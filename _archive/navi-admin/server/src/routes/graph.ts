import { Router, type Request, type Response } from "express";
import { getDb, queryAll, persistDb } from "../db/database.js";
import type { GraphSnapshot } from "../types.js";

const router = Router();

// GET /api/graph?campus_id=asu-ibajay
router.get("/", async (req: Request, res: Response) => {
  try {
    const campusId = (req.query.campus_id as string) || "asu-ibajay";
    const db = await getDb();

    const buildRows = queryAll(
      db,
      `SELECT id, campus_id as campusId, name, code, description,
              center_lat, center_lng, outline, floors, color
       FROM buildings WHERE campus_id = ? ORDER BY name`,
      [campusId]
    );

    const buildings = buildRows.map((r: any) => ({
      id: r.id,
      campusId: r.campusId,
      name: r.name,
      code: r.code,
      description: r.description ?? "",
      center: { lat: r.center_lat, lng: r.center_lng },
      outline: r.outline ? JSON.parse(r.outline) : undefined,
      floors: r.floors ?? 1,
      color: r.color,
    }));

    const nodeRows = queryAll(
      db,
      `SELECT id, name, type, building_id as buildingId, component_id as componentId,
              floor, lat, lng, has_qr as hasQr, has_panorama as hasPanorama, metadata
       FROM nodes WHERE campus_id = ?`,
      [campusId]
    );

    const nodes = nodeRows.map((r: any) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      buildingId: r.buildingId,
      componentId: r.componentId,
      floor: r.floor ?? 0,
      position: { lat: r.lat, lng: r.lng },
      hasQr: r.hasQr === 1,
      hasPanorama: r.hasPanorama === 1,
      ...(r.metadata ? { metadata: JSON.parse(r.metadata) } : {}),
    }));

    const edgeRows = queryAll(
      db,
      `SELECT id, from_node as "from", to_node as "to", type, distance, metadata
       FROM edges WHERE campus_id = ?`,
      [campusId]
    );

    const edges = edgeRows.map((r: any) => ({
      id: r.id,
      from: r.from,
      to: r.to,
      type: r.type,
      distance: r.distance,
      ...(r.metadata ? { metadata: JSON.parse(r.metadata) } : {}),
    }));

    const compRows = queryAll(
      db,
      `SELECT id, type, name, building_id as buildingId, floor,
              lat, lng, dimensions, metadata
       FROM components WHERE campus_id = ?`,
      [campusId]
    );

    const components = compRows.map((r: any) => ({
      id: r.id,
      type: r.type,
      name: r.name,
      buildingId: r.buildingId,
      floor: r.floor ?? 0,
      position: { lat: r.lat, lng: r.lng },
      ...(r.dimensions ? { dimensions: JSON.parse(r.dimensions) } : {}),
      ...(r.metadata ? { metadata: JSON.parse(r.metadata) } : {}),
    }));

    const snapshot: GraphSnapshot = {
      version: "1.0.0",
      campusId,
      buildings,
      nodes,
      edges,
      components,
      exportedAt: new Date().toISOString(),
    };

    res.json(snapshot);
  } catch (err) {
    console.error("GET /api/graph error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/graph
router.post("/", async (req: Request, res: Response) => {
  try {
    const snapshot = req.body as GraphSnapshot;
    if (!snapshot || !snapshot.campusId) {
      res.status(400).json({ error: "Missing campusId or body" });
      return;
    }

    const db = await getDb();
    const campusId = snapshot.campusId;

    // Upsert buildings
    const upsertBld = db.prepare(
      `INSERT INTO buildings (id, campus_id, name, code, description, center_lat, center_lng, outline, floors, color)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id, campus_id) DO UPDATE SET
         name = excluded.name, code = excluded.code,
         description = excluded.description,
         center_lat = excluded.center_lat, center_lng = excluded.center_lng,
         outline = excluded.outline, floors = excluded.floors, color = excluded.color`
    );
    for (const b of snapshot.buildings) {
      upsertBld.bind([
        b.id, campusId, b.name, b.code ?? null, b.description ?? "",
        b.center.lat, b.center.lng,
        b.outline ? JSON.stringify(b.outline) : null,
        b.floors ?? 1, b.color ?? null,
      ]);
      upsertBld.step();
      upsertBld.reset();
    }
    upsertBld.free();

    // Replace nodes
    db.run("DELETE FROM nodes WHERE campus_id = ?", [campusId]);
    const insNode = db.prepare(
      `INSERT INTO nodes (id, campus_id, name, type, building_id, component_id, floor, lat, lng, has_qr, has_panorama, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const n of snapshot.nodes) {
      insNode.bind([
        n.id, campusId, n.name, n.type,
        n.buildingId ?? null, n.componentId ?? null,
        n.floor ?? 0, n.position.lat, n.position.lng,
        n.hasQr ? 1 : 0, n.hasPanorama ? 1 : 0,
        n.metadata ? JSON.stringify(n.metadata) : null,
      ]);
      insNode.step();
      insNode.reset();
    }
    insNode.free();

    // Replace edges
    db.run("DELETE FROM edges WHERE campus_id = ?", [campusId]);
    const insEdge = db.prepare(
      `INSERT INTO edges (id, campus_id, from_node, to_node, type, distance, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    for (const e of snapshot.edges) {
      insEdge.bind([
        e.id, campusId, e.from, e.to,
        e.type ?? "walkway", e.distance ?? 0,
        e.metadata ? JSON.stringify(e.metadata) : null,
      ]);
      insEdge.step();
      insEdge.reset();
    }
    insEdge.free();

    // Replace components
    db.run("DELETE FROM components WHERE campus_id = ?", [campusId]);
    const insComp = db.prepare(
      `INSERT INTO components (id, campus_id, type, name, building_id, floor, lat, lng, dimensions, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const c of snapshot.components ?? []) {
      insComp.bind([
        c.id, campusId, c.type, c.name, c.buildingId,
        c.floor ?? 0, c.position.lat, c.position.lng,
        c.dimensions ? JSON.stringify(c.dimensions) : null,
        c.metadata ? JSON.stringify(c.metadata) : null,
      ]);
      insComp.step();
      insComp.reset();
    }
    insComp.free();

    // Record snapshot
    db.run(
      "INSERT INTO graph_snapshots (campus_id, data, version) VALUES (?, ?, ?)",
      [campusId, JSON.stringify(snapshot), snapshot.version ?? "1.0.0"]
    );

    persistDb();
    res.json({ ok: true, campusId, savedAt: new Date().toISOString() });
  } catch (err) {
    console.error("POST /api/graph error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
