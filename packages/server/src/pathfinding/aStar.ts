//
//  aStar.ts
//  
//
//  Created by Giovanni Spagnuolo on 2/9/26.
//


import type { Vec2 } from "@rsclone/shared/protocol";
import { isWalkable } from "@rsclone/shared/world";

function k(x: number, y: number) {
  return `${x},${y}`;
}

function manhattan(ax: number, ay: number, bx: number, by: number) {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

export function findPathAStar(
  grid: number[][],
  start: Vec2,
  goal: Vec2,
  maxExpanded = 2000
): Vec2[] {
  const sx = Math.floor(start.x);
  const sy = Math.floor(start.y);
  const gx = Math.floor(goal.x);
  const gy = Math.floor(goal.y);

  if (sx === gx && sy === gy) return [];
  if (!isWalkable(grid, gx, gy)) return [];

  // openSet holds discovered nodes we haven't fully evaluated yet
  const openSet = new Set<string>();
  openSet.add(k(sx, sy));

  // For node bookkeeping
  const cameFrom = new Map<string, string>(); // childKey -> parentKey
  const gScore = new Map<string, number>();
  const fScore = new Map<string, number>();

  const startKey = k(sx, sy);
  gScore.set(startKey, 0);
  fScore.set(startKey, manhattan(sx, sy, gx, gy));

  let expanded = 0;

  while (openSet.size > 0 && expanded < maxExpanded) {
    expanded++;

    // current = node in openSet with lowest fScore
    let currentKey: string | null = null;
    let currentF = Infinity;

    for (const key of openSet) {
      const f = fScore.get(key) ?? Infinity;
      if (f < currentF) {
        currentF = f;
        currentKey = key;
      }
    }

    if (!currentKey) break;

    const [cxStr, cyStr] = currentKey.split(",");
    const cx = Number(cxStr);
    const cy = Number(cyStr);

    if (cx === gx && cy === gy) {
      return reconstructPath(cameFrom, currentKey).slice(1); // drop the starting tile
    }

    openSet.delete(currentKey);

    const neighbors = [
      [cx + 1, cy],
      [cx - 1, cy],
      [cx, cy + 1],
      [cx, cy - 1]
    ] as const;

    for (const [nx, ny] of neighbors) {
      if (!isWalkable(grid, nx, ny)) continue;

      const nKey = k(nx, ny);
      const tentativeG = (gScore.get(currentKey) ?? Infinity) + 1;

      if (tentativeG < (gScore.get(nKey) ?? Infinity)) {
        cameFrom.set(nKey, currentKey);
        gScore.set(nKey, tentativeG);
        fScore.set(nKey, tentativeG + manhattan(nx, ny, gx, gy));
        openSet.add(nKey);
      }
    }
  }

  return [];
}

function reconstructPath(cameFrom: Map<string, string>, currentKey: string): Vec2[] {
  const pathKeys: string[] = [currentKey];
  while (cameFrom.has(currentKey)) {
    currentKey = cameFrom.get(currentKey)!;
    pathKeys.push(currentKey);
  }
  pathKeys.reverse();

  return pathKeys.map((kk) => {
    const [x, y] = kk.split(",").map(Number);
    return { x, y };
  });
}
