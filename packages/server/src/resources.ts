//
//  resources.ts
//
//  Created by Giovanni Spagnuolo on 2/9/26.
//

import type { ResourceState, ResourceType, Vec2 } from "@rsclone/shared/protocol";
import { db } from "./db.js";

function fallbackHardcoded(): ResourceState[] {
  const out: ResourceState[] = [];

  // Trees (north area)
  const trees: Vec2[] = [
    { x: 6, y: 6 },
    { x: 7, y: 6 },
    { x: 8, y: 6 },
    { x: 6, y: 7 },
    { x: 8, y: 7 },
    { x: 7, y: 8 }
  ];
  for (const p of trees) {
    out.push({
      id: `tree:${p.x},${p.y}`,
      type: "tree",
      pos: p,
      alive: true,
      respawnAtMs: 0
    });
  }

  // Rocks (east area)
  const rocks: Vec2[] = [
    { x: 28, y: 6 },
    { x: 29, y: 6 },
    { x: 28, y: 7 }
  ];
  for (const p of rocks) {
    out.push({
      id: `rock:${p.x},${p.y}`,
      type: "rock",
      pos: p,
      alive: true,
      respawnAtMs: 0
    });
  }

  // Fishing spots near river edge (just above water line)
  const fish: Vec2[] = [
    { x: 10, y: 11 },
    { x: 14, y: 11 },
    { x: 18, y: 11 }
  ];
  for (const p of fish) {
    out.push({
      id: `fishing_spot:${p.x},${p.y}`,
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
  resource_type: string;
};

function asResourceType(s: string): ResourceType | null {
  if (s === "tree" || s === "rock" || s === "fishing_spot") return s;
  return null;
}

export function makeResources(): ResourceState[] {
  try {
    const rows = db
      .prepare(
        `SELECT
           s.id as id,
           s.x as x,
           s.y as y,
           d.resource_type as resource_type
         FROM resource_spawns s
         JOIN resource_defs d ON d.id = s.def_id
         WHERE s.enabled = 1
         ORDER BY s.y ASC, s.x ASC`
      )
      .all() as SpawnRow[];

    if (!rows.length) {
      // If nothing has been placed yet, keep the old map so the world isn't empty.
      return fallbackHardcoded();
    }

    const out: ResourceState[] = [];
    for (const r of rows) {
      const t = asResourceType(r.resource_type);
      if (!t) continue;

      out.push({
        id: r.id, // stable spawn id from DB
        type: t,
        pos: { x: Math.floor(r.x), y: Math.floor(r.y) },
        alive: true,
        respawnAtMs: 0
      });
    }

    return out;
  } catch {
    // If DB schema isn't ready for any reason, fail safe to old behavior.
    return fallbackHardcoded();
  }
}
