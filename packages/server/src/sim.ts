import { makeCollision, isWalkable } from "@rsclone/shared/world";
import type {
  Inventory,
  ItemId,
  PlayerAction,
  PlayerState,
  ResourceState,
  SkillName,
  SkillXP,
  Vec2
} from "@rsclone/shared/protocol";
import { findPathAStar } from "./pathfinding/aStar";
import { makeResources } from "./resources.js";
import { db } from "./db.js";
import { ItemRepo } from "./itemRepo.js";
import { ResourceRepo } from "./resourceRepo.js";

const INV_SLOTS = 30;

type PendingAction = null | { kind: "interact"; at: Vec2 };

type Player = {
  id: string;
  name: string;
  pos: Vec2;
  path: Vec2[];
  pending: PendingAction;

  skills: SkillXP; // XP, not level
  inventory: Inventory;

  // server-authoritative action timer
  action: PlayerAction;
};

export type SimEvent =
  | { t: "actionStart"; playerId: string; skill: SkillName; resourceType: ResourceState["type"] }
  | {
      t: "actionComplete";
      playerId: string;
      skill: SkillName;
      xpGained: number;
      resourceType: ResourceState["type"];
    }
  | { t: "inv"; playerId: string; inventory: Inventory }
  | { t: "invFull"; playerId: string };

function randInt(min: number, max: number) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/**
 * TEMP LEVEL MAPPING:
 * Your DB requirements are in "levels" but you store XP.
 * Replace later with a real curve.
 */
function xpToLevel(xp: number) {
  const v = Math.max(0, Math.floor(xp));
  return Math.floor(v / 100) + 1;
}

type SpawnMapRow = { id: string; def_id: string };

export class Sim {
  readonly grid = makeCollision();

  // NOTE: not readonly anymore because we hot-reload in place
  readonly resources: ResourceState[] = [];
  private resourceByPos = new Map<string, ResourceState>();

  // Internal mapping for DB-placed resources: spawnId -> resource_defs.id (defId)
  private defIdBySpawnId = new Map<string, string>();

  readonly players = new Map<string, Player>();
  tick = 0;

  // Catalogs
  private items = new ItemRepo();
  private resourceRepo = new ResourceRepo();

  constructor(private onEvent: (e: SimEvent) => void) {
    // initial load (DB spawns if present, otherwise fallback map)
    this.reloadResourcesFromDb();
  }

  /**
   * Live reload of placed resources from DB (no restart).
   * Called by server after admin place/remove.
   */
  reloadResourcesFromDb() {
    // 1) Load ResourceState[] via resources.ts (DB-driven with fallback)
    const next = makeResources();

    // 2) Replace contents in-place so any existing references remain valid
    this.resources.length = 0;
    this.resources.push(...next);

    // 3) Rebuild quick lookup index
    this.rebuildResourceIndex();

    // 4) Rebuild spawnId -> defId mapping for DB spawns
    // (Fallback resources won't exist in resource_spawns; that's OK.)
    this.defIdBySpawnId.clear();
    try {
      const rows = db
        .prepare(
          `SELECT id, def_id
           FROM resource_spawns
           WHERE enabled = 1`
        )
        .all() as SpawnMapRow[];

      for (const r of rows) {
        this.defIdBySpawnId.set(r.id, r.def_id);
      }
    } catch {
      // If table doesn’t exist yet, ignore (fallback map still works).
    }
  }

  private rebuildResourceIndex() {
    this.resourceByPos.clear();
    for (const r of this.resources) this.resourceByPos.set(`${r.pos.x},${r.pos.y}`, r);
  }

  addPlayer(id: string, name: string, spawn: Vec2, skills: SkillXP, inventory: Inventory) {
    // normalize inventory to 30 slots
    const inv: Inventory =
      inventory?.length === INV_SLOTS ? inventory.slice() : Array.from({ length: INV_SLOTS }, () => null);

    this.players.set(id, {
      id,
      name,
      pos: { ...spawn },
      path: [],
      pending: null,
      skills: { ...skills },
      inventory: inv,
      action: null
    });
  }

  removePlayer(id: string) {
    this.players.delete(id);
  }

  setMoveTarget(id: string, dest: Vec2) {
    const p = this.players.get(id);
    if (!p) return;

    // OSRS-ish: you can't walk while doing an action
    if (p.action) return;

    p.pending = null;
    p.path = findPathAStar(this.grid, p.pos, dest, 2000);
  }

  requestInteract(id: string, at: Vec2) {
    const p = this.players.get(id);
    if (!p) return;

    if (p.action) return;

    const tx = Math.floor(at.x);
    const ty = Math.floor(at.y);
    const res = this.resourceByPos.get(`${tx},${ty}`);
    if (!res) return;

    if (this.isAdjacent(p.pos, { x: tx, y: ty })) {
      this.tryStartAction(p, res);
      return;
    }

    const adj = this.findBestAdjacentWalkable(p.pos, { x: tx, y: ty });
    if (!adj) return;

    p.pending = { kind: "interact", at: { x: tx, y: ty } };
    p.path = findPathAStar(this.grid, p.pos, adj, 2000);
  }

  step() {
    this.tick++;
    const now = Date.now();

    // Respawn resources
    for (const r of this.resources) {
      if (!r.alive && r.respawnAtMs > 0 && now >= r.respawnAtMs) {
        r.alive = true;
        r.respawnAtMs = 0;
      }
    }

    for (const p of this.players.values()) {
      // 1) If action is active, tick it down (no movement)
      if (p.action) {
        p.action.ticksLeft -= 1;
        if (p.action.ticksLeft <= 0) {
          this.finishAction(p);
        }
        continue;
      }

      // 2) Otherwise move along path
      const next = p.path[0];
      if (next && isWalkable(this.grid, next.x, next.y)) {
        p.pos = next;
        p.path.shift();
      } else if (next) {
        p.path = [];
      }

      // 3) If arrived and pending interact, start action
      if (p.path.length === 0 && p.pending?.kind === "interact") {
        const target = p.pending.at;
        const res = this.resourceByPos.get(`${target.x},${target.y}`);
        if (res && this.isAdjacent(p.pos, res.pos)) {
          this.tryStartAction(p, res);
        } else {
          p.pending = null;
        }
      }
    }
  }

  snapshotPlayers(): PlayerState[] {
    return Array.from(this.players.values()).map((p) => ({
      id: p.id,
      name: p.name,
      pos: { ...p.pos },
      action: p.action ? { ...p.action, target: { ...p.action.target } } : null
    }));
  }

  snapshotResources(): ResourceState[] {
    return this.resources.map((r) => ({ ...r, pos: { ...r.pos } }));
  }

  getSkills(id: string): SkillXP | null {
    const p = this.players.get(id);
    return p ? { ...p.skills } : null;
  }

  getInventory(id: string): Inventory | null {
    const p = this.players.get(id);
    return p ? p.inventory.map((s) => (s ? { ...s } : null)) : null;
  }

  /**
   * Adds qty of itemId into the player's inventory, respecting DB-backed item rules.
   *
   * Returns true if the *entire* qty was added.
   * Returns false if inventory filled before all items could be added.
   */
  private addItem(playerId: string, itemId: ItemId, qty: number): boolean {
    const p = this.players.get(playerId);
    if (!p) return false;

    qty = Math.max(0, Math.floor(qty));
    if (qty <= 0) return true;

    const inv = p.inventory;
    const def = this.items.getItemOrFallback(itemId);

    // Non-stackable means every unit needs its own slot
    if (!def.stackable || def.stackLimit <= 1) {
      while (qty > 0) {
        const empty = inv.findIndex((s) => !s);
        if (empty === -1) return false;
        inv[empty] = { itemId, qty: 1 };
        qty -= 1;
      }
      return true;
    }

    // 1) Fill existing stacks up to stackLimit
    for (let i = 0; i < inv.length && qty > 0; i++) {
      const s = inv[i];
      if (!s || s.itemId !== itemId) continue;

      const space = def.stackLimit - s.qty;
      if (space <= 0) continue;

      const take = Math.min(space, qty);
      s.qty += take;
      qty -= take;
    }

    // 2) Create new stacks in empty slots
    while (qty > 0) {
      const empty = inv.findIndex((s) => !s);
      if (empty === -1) return false;

      const take = Math.min(def.stackLimit, qty);
      inv[empty] = { itemId, qty: take };
      qty -= take;
    }

    return true;
  }

  private meetsRequirements(p: Player, resourceDefId: string): boolean {
    const reqs = this.resourceRepo.getRequirements(resourceDefId);
    if (!reqs.length) return true;

    for (const r of reqs) {
      const lvl = xpToLevel(p.skills[r.skill]);
      if (lvl < r.level) return false;
    }
    return true;
  }

  private defForResource(res: ResourceState) {
    // If this resource came from DB spawns, we know the exact def_id
    const defId = this.defIdBySpawnId.get(res.id);
    if (defId) {
      const def = this.resourceRepo.getById(defId);
      if (def) return def;
    }

    // Fallback: use default for type (for the hardcoded fallback map)
    return this.resourceRepo.getDefaultForType(res.type);
  }

  private tryStartAction(p: Player, res: ResourceState) {
    p.pending = null;
    if (!res.alive) return;

    const def = this.defForResource(res);
    if (!def) return;

    // Requirements (optional but enabled)
    if (!this.meetsRequirements(p, def.id)) return;

    const ticks = randInt(def.ticksMin, def.ticksMax);
    const skill = def.skill;

    p.action = { kind: skill, ticksLeft: ticks, target: { ...res.pos } };
    this.onEvent({ t: "actionStart", playerId: p.id, skill, resourceType: res.type });
  }

  private finishAction(p: Player) {
    const action = p.action;
    if (!action) return;

    const res = this.resourceByPos.get(`${action.target.x},${action.target.y}`);

    // Always clear action
    p.action = null;

    // Resource gone/dead -> nothing
    if (!res || !res.alive) return;

    const def = this.defForResource(res);
    if (!def) return;

    // enforce again at completion
    if (!this.meetsRequirements(p, def.id)) return;

    const skill = def.skill;

    // Award XP (DB-driven)
    const xpGained = def.xpGain;
    p.skills[skill] += xpGained;

    // Deplete + respawn timer (DB-driven)
    res.alive = false;
    res.respawnAtMs = Date.now() + def.respawnMs;

    // Loot roll (DB-driven)
    const loot = this.resourceRepo.rollLoot(def.id);
    if (loot && loot.qty > 0) {
      const ok = this.addItem(p.id, loot.itemId, loot.qty);
      if (!ok) {
        this.onEvent({ t: "invFull", playerId: p.id });
      } else {
        this.onEvent({ t: "inv", playerId: p.id, inventory: this.getInventory(p.id)! });
      }
    }

    this.onEvent({ t: "actionComplete", playerId: p.id, skill, xpGained, resourceType: res.type });
  }

  private isAdjacent(a: Vec2, b: Vec2) {
    const dx = Math.abs(a.x - b.x);
    const dy = Math.abs(a.y - b.y);
    return dx + dy === 1;
  }

  private findBestAdjacentWalkable(from: Vec2, target: Vec2): Vec2 | null {
    const candidates = [
      { x: target.x + 1, y: target.y },
      { x: target.x - 1, y: target.y },
      { x: target.x, y: target.y + 1 },
      { x: target.x, y: target.y - 1 }
    ].filter((c) => isWalkable(this.grid, c.x, c.y));

    if (candidates.length === 0) return null;

    candidates.sort(
      (a, b) =>
        (Math.abs(a.x - from.x) + Math.abs(a.y - from.y)) -
        (Math.abs(b.x - from.x) + Math.abs(b.y - from.y))
    );

    return candidates[0];
  }
}
