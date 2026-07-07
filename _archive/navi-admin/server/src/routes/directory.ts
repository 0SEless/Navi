import { Router, type Request, type Response } from "express";
import { getDb, queryAll } from "../db/database.js";

const router = Router();

export interface DirEntry {
  id: string;
  label: string;
  type: "building" | "floor" | "room" | "entrance" | "facility";
  nodeId?: string;
  children?: DirEntry[];
}

// GET /api/directory?campus_id=asu-ibajay
router.get("/", async (req: Request, res: Response) => {
  try {
    const campusId = (req.query.campus_id as string) || "asu-ibajay";
    const db = await getDb();

    const buildRows = queryAll(
      db,
      "SELECT id, name, code, floors FROM buildings WHERE campus_id = ? ORDER BY name",
      [campusId]
    );

    const nodeRows = queryAll(
      db,
      "SELECT id, name, type, building_id, floor FROM nodes WHERE campus_id = ?",
      [campusId]
    );

    const tree: DirEntry[] = buildRows.map((b: any) => {
      const buildingNodes = nodeRows.filter((n: any) => n.building_id === b.id);
      const floorSet = new Set<number>();
      for (const n of buildingNodes) {
        if (n.floor !== null) floorSet.add(n.floor);
      }

      const floorEntries: DirEntry[] = Array.from(floorSet)
        .sort((a, b) => b - a)
        .map((floorNum) => {
          const floorNodes = buildingNodes.filter((n: any) => n.floor === floorNum);
          const pois: DirEntry[] = floorNodes
            .filter((n: any) => n.type === "room" || n.type === "building_entrance")
            .map((n: any) => ({
              id: n.id,
              label: n.name,
              type: n.type === "building_entrance" ? "entrance" : "room",
              nodeId: n.id,
            }));

          return {
            id: `${b.id}-f${floorNum}`,
            label: floorNum === 0 ? "Ground Floor" : `Floor ${floorNum}`,
            type: "floor" as const,
            children: pois.length > 0 ? pois : undefined,
          };
        });

      return {
        id: b.id,
        label: b.code ? `${b.code} — ${b.name}` : b.name,
        type: "building" as const,
        children: floorEntries,
      };
    });

    res.json(tree);
  } catch (err) {
    console.error("GET /api/directory error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
