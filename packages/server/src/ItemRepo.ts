//
//  ItemRepo.swift
//  
//
//  Created by Giovanni Spagnuolo on 2/10/26.
//


import { db } from "./db.js";
import type { ItemId, SkillName } from "@rsclone/shared/protocol";

export type ItemDef = {
  id: ItemId;
  name: string;
  itemType: string;
  equipSlot: string | null;

  stackable: boolean;
  stackLimit: number;
  splittable: boolean;

  consumable: boolean;

  meta: Record<string, unknown>;
};

export type ItemRequirement = { skill: SkillName; level: number };

export type ItemConsumeBuff = {
  skill: SkillName;
  amount: number;
  durationMs: number;
};

type ItemRow = {
  id: string;
  name: string;
  item_type: string;
  equip_slot: string | null;
  stackable: number;
  stack_limit: number;
  splittable: number;
  consumable: number;
  meta_json: string;
};

type ReqRow = { skill: string; level: number };
type BuffRow = { skill: string; amount: number; duration_ms: number };

function safeJsonParse(s: string): Record<string, unknown> {
  try {
    const v = JSON.parse(s);
    if (v && typeof v === "object" && !Array.isArray(v)) return v as any;
  } catch {}
  return {};
}

/**
 * DB-backed item catalog with in-memory caching.
 * - getItem(id): returns null if missing
 * - getItemOrFallback(id): always returns a usable def (dev-friendly)
 *
 * Later we can add hot-reload in dev, or invalidate cache on admin edits.
 */
export class ItemRepo {
  private cache = new Map<ItemId, ItemDef>();

  private loadItemFromDb(id: ItemId): ItemDef | null {
    const row = db
      .prepare(
        `SELECT id, name, item_type, equip_slot, stackable, stack_limit, splittable, consumable, meta_json
         FROM items
         WHERE id = ?`
      )
      .get(id) as ItemRow | undefined;

    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      itemType: row.item_type,
      equipSlot: row.equip_slot,

      stackable: !!row.stackable,
      stackLimit: Math.max(1, Math.floor(row.stack_limit ?? 1)),
      splittable: !!row.splittable,

      consumable: !!row.consumable,

      meta: safeJsonParse(row.meta_json ?? "{}")
    };
  }

  getItem(id: ItemId): ItemDef | null {
    const cached = this.cache.get(id);
    if (cached) return cached;

    const def = this.loadItemFromDb(id);
    if (!def) return null;

    this.cache.set(id, def);
    return def;
  }

  /**
   * For resilience during dev:
   * If an item is missing from the catalog, allow it anyway with safe defaults.
   */
  getItemOrFallback(id: ItemId): ItemDef {
    return (
      this.getItem(id) ?? {
        id,
        name: id,
        itemType: "unknown",
        equipSlot: null,
        stackable: true,
        stackLimit: 2147483647,
        splittable: true,
        consumable: false,
        meta: {}
      }
    );
  }

  /**
   * Useful for admin tools / debugging.
   */
  getAllItems(): ItemDef[] {
    const rows = db
      .prepare(
        `SELECT id, name, item_type, equip_slot, stackable, stack_limit, splittable, consumable, meta_json
         FROM items
         ORDER BY id ASC`
      )
      .all() as ItemRow[];

    const out: ItemDef[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      itemType: r.item_type,
      equipSlot: r.equip_slot,
      stackable: !!r.stackable,
      stackLimit: Math.max(1, Math.floor(r.stack_limit ?? 1)),
      splittable: !!r.splittable,
      consumable: !!r.consumable,
      meta: safeJsonParse(r.meta_json ?? "{}")
    }));

    // refresh cache with authoritative results
    this.cache.clear();
    for (const it of out) this.cache.set(it.id, it);

    return out;
  }

  getRequirements(itemId: ItemId): ItemRequirement[] {
    const rows = db
      .prepare(
        `SELECT skill, level
         FROM item_requirements
         WHERE item_id = ?
         ORDER BY skill ASC`
      )
      .all(itemId) as ReqRow[];

    return rows
      .map((r) => ({ skill: r.skill as SkillName, level: Math.max(0, Math.floor(r.level)) }))
      .filter((r) => r.skill === "woodcutting" || r.skill === "mining" || r.skill === "fishing");
  }

  getConsumeBuffs(itemId: ItemId): ItemConsumeBuff[] {
    const rows = db
      .prepare(
        `SELECT skill, amount, duration_ms
         FROM item_consume_buffs
         WHERE item_id = ?
         ORDER BY skill ASC`
      )
      .all(itemId) as BuffRow[];

    return rows
      .map((r) => ({
        skill: r.skill as SkillName,
        amount: Math.floor(r.amount),
        durationMs: Math.max(0, Math.floor(r.duration_ms ?? 0))
      }))
      .filter((r) => r.skill === "woodcutting" || r.skill === "mining" || r.skill === "fishing");
  }

  /**
   * Call this if you edit items via an admin panel and want changes to take effect immediately.
   */
  clearCache() {
    this.cache.clear();
  }
}
