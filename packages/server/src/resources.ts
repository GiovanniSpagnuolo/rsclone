// packages/server/src/resources.ts
import type { ResourceState, ResourceType, Vec2 } from "@rsclone/shared/protocol";
import { db } from "./db.js";

// Helper to keep the map populated if DB is empty
function fallbackHardcoded(): (ResourceState & { defId: string })[] {
  const out: (ResourceState & { defId: string })[] = [];

  const trees: Vec2[] = [{ x: 6, y: 6 }, { x: 7, y: 6 }, { x: 8, y: 6 }, { x: 6, y: 7 }, { x: 8, y: 7 }, { x: 7, y: 8 }];
  for (const p of trees) {
    out.push({
      id: `tree:${p.x},${p.y}`,
      defId: "tree_basic",
      type: "tree",
      pos: p,
      alive: true,
      respawnAtMs: 0
    });
  }

  const rocks: Vec2[] = [{ x: 28, y: 6 }, { x: 29, y: 6 }, { x: 28, y: 7 }];
  for (const p of rocks) {
    out.push({
      id: `rock:${p.x},${p.y}`,
      defId: "rock_basic",
      type: "rock",
      pos: p,
      alive: true,
      respawnAtMs: 0
    });
  }

  const fish: Vec2[] = [{ x: 10, y: 11 }, { x: 14, y: 11 }, { x: 18, y: 11 }];
  for (const p of fish) {
    out.push({
      id: `fishing_spot:${p.x},${p.y}`,
      defId: "fishing_spot_basic",
      type: "fishing_spot",
      pos: p,
      alive: true,
      respawnAtMs: 0
    });
  }

  return out;
}

type SpawnRow = {
  id: string;
  x: number;
  y: number;
  def_id: string;
  resource_type: string;
};

function asResourceType(s: string): ResourceType | null {
  if (s === "tree" || s === "rock" || s === "fishing_spot") return s;
  return null;
}

export function makeResources(): (ResourceState & { defId: string })[] {
  try {
    const rows = db
      .prepare(
        `SELECT
           s.id as id,
           s.x as x,
           s.y as y,
           s.def_id as def_id,
           d.resource_type as resource_type
         FROM resource_spawns s
         JOIN resource_defs d ON d.id = s.def_id
         WHERE s.enabled = 1
         ORDER BY s.y ASC, s.x ASC`
      )
      .all() as SpawnRow[];

    if (!rows.length) {
      return fallbackHardcoded();
    }

    const out: (ResourceState & { defId: string })[] = [];
    for (const r of rows) {
      const t = asResourceType(r.resource_type);
      if (!t) continue;

      out.push({
        id: r.id,
        defId: r.def_id,
        type: t,
        pos: { x: Math.floor(r.x), y: Math.floor(r.y) },
        alive: true,
        respawnAtMs: 0
      });
    }

    return out;
  } catch {
    return fallbackHardcoded();
  }
}
