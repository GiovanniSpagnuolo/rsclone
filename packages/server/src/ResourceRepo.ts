//
//  ResourceRepo.swift
//  
//
//  Created by Giovanni Spagnuolo on 2/10/26.
//


import { db } from "./db.js";
import type { ItemId, ResourceType, SkillName } from "@rsclone/shared/protocol";

export type ResourceDef = {
  id: string;

  resourceType: ResourceType; // "tree" | "rock" | "fishing_spot"
  name: string;

  skill: SkillName;

  xpGain: number;

  ticksMin: number;
  ticksMax: number;

  respawnMs: number;

  meta: Record<string, unknown>;
};

export type ResourceRequirement = { skill: SkillName; level: number };

export type ResourceLootRow = {
  itemId: ItemId;
  minQty: number;
  maxQty: number;
  weight: number;
};

type ResRow = {
  id: string;
  resource_type: string;
  name: string;
  skill: string;
  xp_gain: number;
  ticks_min: number;
  ticks_max: number;
  respawn_ms: number;
  meta_json: string;
};

type ReqRow = { skill: string; level: number };

type LootRow = {
  item_id: string;
  min_qty: number;
  max_qty: number;
  weight: number;
};

function safeJsonParse(s: string): Record<string, unknown> {
  try {
    const v = JSON.parse(s);
    if (v && typeof v === "object" && !Array.isArray(v)) return v as any;
  } catch {}
  return {};
}

function asSkillName(s: string): SkillName | null {
  if (s === "woodcutting" || s === "mining" || s === "fishing") return s;
  return null;
}

function asResourceType(s: string): ResourceType | null {
  if (s === "tree" || s === "rock" || s === "fishing_spot") return s;
  return null;
}

function clampInt(n: any, min: number, max: number) {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

export class ResourceRepo {
  private cacheById = new Map<string, ResourceDef>();
  private cacheDefaultByType = new Map<ResourceType, ResourceDef>();
  private lootCache = new Map<string, ResourceLootRow[]>();
  private reqCache = new Map<string, ResourceRequirement[]>();

  clearCache() {
    this.cacheById.clear();
    this.cacheDefaultByType.clear();
    this.lootCache.clear();
    this.reqCache.clear();
  }

  private loadDefaultForTypeFromDb(resourceType: ResourceType): ResourceDef | null {
    // Strategy: pick the first row for that type ordered by id.
    // Later we can add an explicit "is_default" column or "tier" column.
    const row = db
      .prepare(
        `SELECT id, resource_type, name, skill, xp_gain, ticks_min, ticks_max, respawn_ms, meta_json
         FROM resource_defs
         WHERE resource_type = ?
         ORDER BY id ASC
         LIMIT 1`
      )
      .get(resourceType) as ResRow | undefined;

    if (!row) return null;

    return this.rowToDef(row);
  }

  private loadByIdFromDb(id: string): ResourceDef | null {
    const row = db
      .prepare(
        `SELECT id, resource_type, name, skill, xp_gain, ticks_min, ticks_max, respawn_ms, meta_json
         FROM resource_defs
         WHERE id = ?`
      )
      .get(id) as ResRow | undefined;

    if (!row) return null;
    return this.rowToDef(row);
  }

  private rowToDef(row: ResRow): ResourceDef {
    const rt = asResourceType(row.resource_type);
    const skill = asSkillName(row.skill);

    // If DB has invalid values, fail safe to basic types.
    const resourceType = rt ?? "tree";
    const skillName = skill ?? "woodcutting";

    const ticksMin = clampInt(row.ticks_min, 1, 10_000);
    const ticksMax = clampInt(row.ticks_max, ticksMin, 10_000);

    return {
      id: row.id,
      resourceType,
      name: row.name,
      skill: skillName,
      xpGain: clampInt(row.xp_gain, 0, 1_000_000),
      ticksMin,
      ticksMax,
      respawnMs: clampInt(row.respawn_ms, 0, 1_000_000_000),
      meta: safeJsonParse(row.meta_json ?? "{}")
    };
  }

  /**
   * Returns the default resource def for a type (tree/rock/fishing_spot).
   * For now: the smallest id for that type.
   */
  getDefaultForType(resourceType: ResourceType): ResourceDef | null {
    const cached = this.cacheDefaultByType.get(resourceType);
    if (cached) return cached;

    const def = this.loadDefaultForTypeFromDb(resourceType);
    if (!def) return null;

    this.cacheDefaultByType.set(resourceType, def);
    this.cacheById.set(def.id, def);
    return def;
  }

  getById(id: string): ResourceDef | null {
    const cached = this.cacheById.get(id);
    if (cached) return cached;

    const def = this.loadByIdFromDb(id);
    if (!def) return null;

    this.cacheById.set(id, def);
    return def;
  }

  getRequirements(resourceId: string): ResourceRequirement[] {
    const cached = this.reqCache.get(resourceId);
    if (cached) return cached;

    const rows = db
      .prepare(
        `SELECT skill, level
         FROM resource_requirements
         WHERE resource_id = ?
         ORDER BY skill ASC`
      )
      .all(resourceId) as ReqRow[];

    const reqs: ResourceRequirement[] = rows
      .map((r) => {
        const s = asSkillName(r.skill);
        if (!s) return null;
        return { skill: s, level: clampInt(r.level, 0, 10_000) };
      })
      .filter(Boolean) as ResourceRequirement[];

    this.reqCache.set(resourceId, reqs);
    return reqs;
  }

  getLootTable(resourceId: string): ResourceLootRow[] {
    const cached = this.lootCache.get(resourceId);
    if (cached) return cached;

    const rows = db
      .prepare(
        `SELECT item_id, min_qty, max_qty, weight
         FROM resource_loot
         WHERE resource_id = ?
         ORDER BY item_id ASC`
      )
      .all(resourceId) as LootRow[];

    const loot: ResourceLootRow[] = rows
      .map((r) => ({
        itemId: r.item_id as ItemId,
        minQty: clampInt(r.min_qty, 0, 1_000_000),
        maxQty: clampInt(r.max_qty, clampInt(r.min_qty, 0, 1_000_000), 1_000_000),
        weight: clampInt(r.weight, 0, 1_000_000)
      }))
      .filter((r) => r.weight > 0 && r.maxQty >= r.minQty);

    this.lootCache.set(resourceId, loot);
    return loot;
  }

  /**
   * Weighted random roll.
   * Returns null if no loot rows exist.
   */
  rollLoot(resourceId: string, rng = Math.random): { itemId: ItemId; qty: number } | null {
    const table = this.getLootTable(resourceId);
    if (!table.length) return null;

    let total = 0;
    for (const r of table) total += r.weight;

    if (total <= 0) return null;

    let pick = Math.floor(rng() * total);
    for (const r of table) {
      pick -= r.weight;
      if (pick < 0) {
        const qty =
          r.minQty === r.maxQty
            ? r.minQty
            : r.minQty + Math.floor(rng() * (r.maxQty - r.minQty + 1));
        return { itemId: r.itemId, qty };
      }
    }

    // should never happen, but fail safe
    const last = table[table.length - 1];
    return { itemId: last.itemId, qty: last.minQty };
  }
}
