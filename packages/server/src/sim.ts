import { makeCollision, isWalkable, WORLD_H, WORLD_W } from "@rsclone/shared/world";
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
import { SpatialGrid } from "./SpatialGrid.js";

const INV_SLOTS = 30;

type PendingAction = null | { kind: "interact"; at: Vec2 };

type Player = {
  id: string;
  name: string;
  pos: Vec2;
  path: Vec2[];
  pending: PendingAction;
  skills: SkillXP;
  inventory: Inventory;
  action: PlayerAction;
};

// Internal resource type includes defId for lookups
type SimResource = ResourceState & { defId: string };

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

function xpToLevel(xp: number) {
  const v = Math.max(0, Math.floor(xp));
  return Math.floor(v / 100) + 1;
}

export class Sim {
  // Grid is mutable so we can block/unblock tiles dynamically
  readonly grid: number[][] = makeCollision();

  // Spatial Grids for efficient querying
  readonly playerGrid = new SpatialGrid<Player>();
  readonly resourceGrid = new SpatialGrid<SimResource>();

  // Keep a map for O(1) exact-tile lookups (interaction checks)
  private resourceByPos = new Map<string, SimResource>();

  tick = 0;

  private items = new ItemRepo();
  private resourceRepo = new ResourceRepo();

  constructor(private onEvent: (e: SimEvent) => void) {
    this.reloadResourcesFromDb();
  }

  /**
   * Reloads resources and rebuilds the collision grid.
   */
  reloadResourcesFromDb() {
    this.items.clearCache();
    this.resourceRepo.clearCache();

    // 1. Fetch new map layout
    const next = makeResources();
    
    // 2. Clear old data
    this.resourceGrid.clear();
    this.resourceByPos.clear();

    // 3. Populate new data
    for (const r of next) {
      this.resourceGrid.add(r);
      this.resourceByPos.set(`${r.pos.x},${r.pos.y}`, r);
    }

    // 4. Reset collision grid to world base
    const base = makeCollision();
    for (let y = 0; y < WORLD_H; y++) {
      for (let x = 0; x < WORLD_W; x++) {
        this.grid[y][x] = base[y][x];
      }
    }

    // 5. Apply resource collision
    for (const r of next) {
      const def = this.resourceRepo.getById(r.defId) ?? this.resourceRepo.getDefaultForType(r.type);
      if (def && def.collision === "block") {
        if (r.pos.x >= 0 && r.pos.x < WORLD_W && r.pos.y >= 0 && r.pos.y < WORLD_H) {
           this.grid[r.pos.y][r.pos.x] = 1;
        }
      }
    }
  }

  addPlayer(id: string, name: string, spawn: Vec2, skills: SkillXP, inventory: Inventory) {
    const inv: Inventory =
      inventory?.length === INV_SLOTS ? inventory.slice() : Array.from({ length: INV_SLOTS }, () => null);

    const p: Player = {
      id,
      name,
      pos: { ...spawn },
      path: [],
      pending: null,
      skills: { ...skills },
      inventory: inv,
      action: null
    };
    
    this.playerGrid.add(p);
  }

  removePlayer(id: string) {
    this.playerGrid.remove(id);
  }

  getPlayer(id: string) {
    return this.playerGrid.get(id);
  }

  setMoveTarget(id: string, dest: Vec2) {
    const p = this.getPlayer(id);
    if (!p) return;
    if (p.action) return;

    p.pending = null;
    p.path = findPathAStar(this.grid, p.pos, dest, 2000);
    // Grid update happens in step() as they move
  }

  requestInteract(id: string, at: Vec2) {
    const p = this.getPlayer(id);
    if (!p) return;
    if (p.action) return;

    const tx = Math.floor(at.x);
    const ty = Math.floor(at.y);
    
    // Use the O(1) map for specific tile interaction
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

    // Respawn logic (Iterate all resources)
    for (const r of this.resourceGrid.getAll()) {
      if (!r.alive && r.respawnAtMs > 0 && now >= r.respawnAtMs) {
        r.alive = true;
        r.respawnAtMs = 0;
      }
    }

    // Player logic (Iterate all players)
    for (const p of this.playerGrid.getAll()) {
      if (p.action) {
        p.action.ticksLeft -= 1;
        if (p.action.ticksLeft <= 0) {
          this.finishAction(p);
        }
        continue;
      }

      const next = p.path[0];
      if (next && isWalkable(this.grid, next.x, next.y)) {
        p.pos = next;
        p.path.shift();
        
        // --- KEY CHANGE: Update Spatial Grid Position ---
        this.playerGrid.update(p);
        
      } else if (next) {
        p.path = []; // Path blocked
      }

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

  /**
   * Generates a snapshot tailored for a specific viewer.
   * Only includes entities in the chunks near the viewer.
   */
  getSnapshotFor(viewerId: string) {
    const viewer = this.getPlayer(viewerId);
    if (!viewer) return null;

    // 1. Get nearby players
    const nearbyPlayers = this.playerGrid.queryViewRect(viewer.pos);
    const pStates: PlayerState[] = nearbyPlayers.map((p) => ({
      id: p.id,
      name: p.name,
      pos: { ...p.pos },
      action: p.action ? { ...p.action, target: { ...p.action.target } } : null
    }));

    // 2. Get nearby resources
    const nearbyRes = this.resourceGrid.queryViewRect(viewer.pos);
    const rStates = nearbyRes.map((r) => {
      const def = this.resourceRepo.getById(r.defId) ?? this.resourceRepo.getDefaultForType(r.type);
      
      return {
        ...r,
        pos: { ...r.pos },
        // Ensure these strings are passed so createGame3d.ts can find them in the vfs
        mesh: def?.mesh ?? "",
        depletedMesh: def?.depletedMesh ?? ""
      };
    });

    return { players: pStates, resources: rStates };
  }
  
  // Legacy global snapshots (can be removed if index.ts is updated)
  snapshotPlayers(): PlayerState[] {
      return this.playerGrid.getAll().map((p) => ({
        id: p.id,
        name: p.name,
        pos: { ...p.pos },
        action: p.action ? { ...p.action, target: { ...p.action.target } } : null
      }));
  }
  
  snapshotResources() {
      return this.resourceGrid.getAll().map((r) => {
        const def = this.resourceRepo.getById(r.defId) ?? this.resourceRepo.getDefaultForType(r.type);
        return {
          ...r,
          pos: { ...r.pos },
          mesh: def?.mesh ?? "",
          depletedMesh: def?.depletedMesh ?? ""
        };
      });
  }

  getSkills(id: string): SkillXP | null {
    const p = this.getPlayer(id);
    return p ? { ...p.skills } : null;
  }

  getInventory(id: string): Inventory | null {
    const p = this.getPlayer(id);
    return p ? p.inventory.map((s) => (s ? { ...s } : null)) : null;
  }

  private addItem(playerId: string, itemId: ItemId, qty: number): boolean {
    const p = this.getPlayer(playerId);
    if (!p) return false;

    qty = Math.max(0, Math.floor(qty));
    if (qty <= 0) return true;

    const inv = p.inventory;
    const def = this.items.getItemOrFallback(itemId);

    if (!def.stackable || def.stackLimit <= 1) {
      while (qty > 0) {
        const empty = inv.findIndex((s) => !s);
        if (empty === -1) return false;
        inv[empty] = { itemId, qty: 1 };
        qty -= 1;
      }
      return true;
    }

    for (let i = 0; i < inv.length && qty > 0; i++) {
      const s = inv[i];
      if (!s || s.itemId !== itemId) continue;
      const space = def.stackLimit - s.qty;
      if (space <= 0) continue;
      const take = Math.min(space, qty);
      s.qty += take;
      qty -= take;
    }

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

  private tryStartAction(p: Player, res: SimResource) {
    p.pending = null;
    if (!res.alive) return;

    const def = this.resourceRepo.getById(res.defId) ?? this.resourceRepo.getDefaultForType(res.type);
    if (!def) return;
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
    p.action = null;

    if (!res || !res.alive) return;

    const def = this.resourceRepo.getById(res.defId) ?? this.resourceRepo.getDefaultForType(res.type);
    if (!def) return;
    if (!this.meetsRequirements(p, def.id)) return;

    const skill = def.skill;
    const xpGained = def.xpGain;
    p.skills[skill] += xpGained;

    res.alive = false;
    res.respawnAtMs = Date.now() + def.respawnMs;

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
