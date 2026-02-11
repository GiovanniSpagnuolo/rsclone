//
//  utils.ts
//  
//
//  Created by Giovanni Spagnuolo on 2/10/26.
//


// packages/client/src/ui/utils.ts
import type { ItemId } from "@rsclone/shared/protocol";

export function fmtTime(ts: number) {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export function asInt(s: string, def = 0) {
  const n = Math.floor(Number(s));
  return Number.isFinite(n) ? n : def;
}

export function safeJsonString(v: string) {
  const t = (v ?? "").trim();
  if (!t) return "{}";
  try {
    JSON.parse(t);
    return t;
  } catch {
    return "{}";
  }
}

const ITEM_NAME: Record<string, string> = {
  logs: "Logs",
  ore: "Ore",
  raw_fish: "Raw fish"
};

export function itemName(id: ItemId | string) {
  return ITEM_NAME[id] ?? id;
}

export function findClosestWalkable(
  collision: number[][],
  start: { x: number; y: number },
  maxRadius = 12
) {
  const H = collision.length;
  const W = collision[0]?.length ?? 0;

  const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
  const walkable = (x: number, y: number) => inBounds(x, y) && collision[y][x] === 0;

  if (walkable(start.x, start.y)) return start;

  const q: Array<{ x: number; y: number }> = [];
  const seen = new Set<string>();
  const push = (x: number, y: number) => {
    const k = `${x},${y}`;
    if (seen.has(k)) return;
    seen.add(k);
    q.push({ x, y });
  };

  push(start.x, start.y);

  while (q.length) {
    const cur = q.shift()!;
    const dist = Math.abs(cur.x - start.x) + Math.abs(cur.y - start.y);
    if (dist > maxRadius) continue;

    if (walkable(cur.x, cur.y)) return cur;

    push(cur.x + 1, cur.y);
    push(cur.x - 1, cur.y);
    push(cur.x, cur.y + 1);
    push(cur.x, cur.y - 1);
  }

  return null;
}
