import { WebSocketServer } from "ws";
import { randomUUID } from "node:crypto";

import { db, migrate } from "./db.js";
import { startHttpServer } from "./http.js";
import { verifyToken } from "./auth.js";
import { getDefaultCharacterForUser, rowToSkills, saveCharacterState } from "./characterRepo.js";
import { Sim, type SimEvent } from "./sim.ts";
import { TerrainRepo } from "./TerrainRepo.js";

import type {
  ChatLine,
  ClientToServer,
  ServerToClient,
  Inventory,
  ItemId,
  SkillName,
  AdminItemRow,
  AdminPlayerRow,
  AdminResourceDefRow,
  AdminResourceLootRow,
  AdminResourceSpawnRow
} from "@rsclone/shared/protocol";

migrate();

const PORT_WS = Number(process.env.PORT_WS ?? 8080);
const PORT_HTTP = Number(process.env.PORT_HTTP ?? 8081);
const TICK_RATE = 10;

const INV_SLOTS = 30;

startHttpServer(PORT_HTTP);

const terrainRepo = new TerrainRepo();

// ----------------- Inventory persistence -----------------

type InvRow = { slot: number; item_id: string; qty: number };

function loadInventory(charId: string): Inventory {
  const inv: Inventory = Array.from({ length: INV_SLOTS }, () => null);

  const rows = db
    .prepare(
      `SELECT slot, item_id, qty
       FROM inventory
       WHERE char_id = ?
       ORDER BY slot ASC`
    )
    .all(charId) as InvRow[];

  for (const r of rows) {
    if (r.slot < 0 || r.slot >= INV_SLOTS) continue;
    inv[r.slot] = { itemId: r.item_id as ItemId, qty: Math.max(0, Math.floor(r.qty)) };
  }

  return inv;
}

const saveInventory = db.transaction((charId: string, inventory: Inventory) => {
  db.prepare(`DELETE FROM inventory WHERE char_id = ?`).run(charId);

  const stmt = db.prepare(
    `INSERT INTO inventory (char_id, slot, item_id, qty)
     VALUES (?, ?, ?, ?)`
  );

  for (let i = 0; i < INV_SLOTS; i++) {
    const s = inventory[i];
    if (!s) continue;
    const qty = Math.max(1, Math.floor(s.qty));
    stmt.run(charId, i, s.itemId, qty);
  }
});

// ----------------- Connections -----------------

type Conn = {
  userId: string;
  charId: string;
  username: string;
  rights: number;
  ws: import("ws").WebSocket;
  lastSavedMs: number;
  lastChatMs: number;
};

const conns = new Map<string, Conn>();

function send(ws: import("ws").WebSocket, msg: ServerToClient) {
  ws.send(JSON.stringify(msg));
}

function sendTo(userId: string, msg: ServerToClient) {
  const c = conns.get(userId);
  if (!c) return;
  c.ws.send(JSON.stringify(msg));
}

function broadcast(msg: ServerToClient) {
  const data = JSON.stringify(msg);
  for (const c of conns.values()) c.ws.send(data);
}

// ----------------- Chat -----------------

const chatHistory: ChatLine[] = [];

function pushChat(line: ChatLine) {
  chatHistory.push(line);
  while (chatHistory.length > 50) chatHistory.shift();
}

function systemLine(text: string): ChatLine {
  return {
    id: randomUUID(),
    ts: Date.now(),
    from: { id: "system", name: "System" },
    text
  };
}

function skillNamePretty(s: SkillName) {
  if (s === "woodcutting") return "Woodcutting";
  if (s === "mining") return "Mining";
  return "Fishing";
}

function verbFor(skill: SkillName) {
  if (skill === "woodcutting") return "chopping the tree";
  if (skill === "mining") return "mining the rock";
  return "fishing";
}

// ----------------- Admin helpers -----------------

function requireAdmin(userId: string): Conn | null {
  const c = conns.get(userId);
  if (!c) return null;
  if ((c.rights ?? 0) >= 3) return c;
  sendTo(userId, { t: "adminError", error: "No access." });
  return null;
}

function audit(
  userId: string,
  action: string,
  entityType: string,
  entityId: string | null,
  before: any,
  after: any
) {
  try {
    db.prepare(
      `INSERT INTO audit_log (id, user_id, action, entity_type, entity_id, before_json, after_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      randomUUID(),
      userId,
      action,
      entityType,
      entityId,
      before ? JSON.stringify(before) : null,
      after ? JSON.stringify(after) : null,
      Date.now()
    );
  } catch {}
}

function toInt(n: any, def = 0) {
  const v = Math.floor(Number(n));
  return Number.isFinite(v) ? v : def;
}

// ----------------- Admin snapshot queries -----------------

type ItemRowDb = {
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

type ResDefRowDb = {
  id: string;
  resource_type: string;
  name: string;
  skill: string;
  xp_gain: number;
  ticks_min: number;
  ticks_max: number;
  respawn_ms: number;
    mesh: string; 
      depleted_mesh: string;
      collision: string;
  meta_json: string;
};

type LootRowDb = {
  resource_id: string;
  item_id: string;
  min_qty: number;
  max_qty: number;
  weight: number;
};

type SpawnRowDb = {
  id: string;
  def_id: string;
  x: number;
  y: number;
  enabled: number;
};

type PlayerRowDb = {
  user_id: string;
  username: string;
  rights: number;
  char_id: string;
  char_name: string;
  x: number;
  y: number;
  xp_woodcutting: number;
  xp_mining: number;
  xp_fishing: number;
};

function buildAdminSnapshot(): {
  items: AdminItemRow[];
  resourceDefs: AdminResourceDefRow[];
  resourceLoot: AdminResourceLootRow[];
  resourceSpawns: AdminResourceSpawnRow[];
  players: AdminPlayerRow[];
} {
  const itemsDb = db
    .prepare(
      `SELECT id, name, item_type, equip_slot, stackable, stack_limit, splittable, consumable, meta_json
       FROM items
       ORDER BY id ASC`
    )
    .all() as ItemRowDb[];

  const resDefsDb = db.prepare(
     `SELECT id, resource_type, name, skill, xp_gain, ticks_min, ticks_max, respawn_ms, 
             mesh, depleted_mesh, collision, meta_json
      FROM resource_defs
      ORDER BY id ASC`
   ).all() as ResDefRowDb[];

  const lootDb = db
    .prepare(
      `SELECT resource_id, item_id, min_qty, max_qty, weight
       FROM resource_loot
       ORDER BY resource_id ASC, item_id ASC`
    )
    .all() as LootRowDb[];

  const spawnsDb = db
    .prepare(
      `SELECT id, def_id, x, y, enabled
       FROM resource_spawns
       WHERE enabled = 1
       ORDER BY y ASC, x ASC`
    )
    .all() as SpawnRowDb[];

  const playersDb = db
    .prepare(
      `SELECT
         u.id as user_id,
         u.username as username,
         u.rights as rights,
         c.id as char_id,
         c.name as char_name,
         c.x as x,
         c.y as y,
         c.xp_woodcutting as xp_woodcutting,
         c.xp_mining as xp_mining,
         c.xp_fishing as xp_fishing
       FROM users u
       JOIN characters c ON c.user_id = u.id
       ORDER BY u.username ASC`
    )
    .all() as PlayerRowDb[];

  const items: AdminItemRow[] = itemsDb.map((r) => ({
    id: r.id as ItemId,
    name: r.name,
    itemType: r.item_type,
    equipSlot: r.equip_slot ?? null,
    stackable: !!r.stackable,
    stackLimit: toInt(r.stack_limit, 1),
    splittable: !!r.splittable,
    consumable: !!r.consumable,
    metaJson: r.meta_json ?? "{}"
  }));

    const resourceDefs: AdminResourceDefRow[] = resDefsDb.map((r) => ({
        id: r.id,
        resourceType: r.resource_type as any,
        name: r.name,
        skill: r.skill as any,
        xpGain: toInt(r.xp_gain, 0),
        ticksMin: toInt(r.ticks_min, 1),
        ticksMax: toInt(r.ticks_max, 1),
        respawnMs: toInt(r.respawn_ms, 0),
        mesh: r.mesh ?? "",
        depletedMesh: r.depleted_mesh ?? "",
        collision: r.collision as any,
        metaJson: r.meta_json ?? "{}"
      }));

  const resourceLoot: AdminResourceLootRow[] = lootDb.map((r) => ({
    resourceId: r.resource_id,
    itemId: r.item_id as ItemId,
    minQty: toInt(r.min_qty, 1),
    maxQty: toInt(r.max_qty, toInt(r.min_qty, 1)),
    weight: toInt(r.weight, 1)
  }));

  const resourceSpawns: AdminResourceSpawnRow[] = spawnsDb.map((r) => ({
    id: r.id,
    defId: r.def_id,
    x: toInt(r.x, 0),
    y: toInt(r.y, 0),
    enabled: !!r.enabled
  }));

  const players: AdminPlayerRow[] = playersDb.map((r) => ({
    userId: r.user_id,
    username: r.username,
    rights: toInt(r.rights, 0),

    charId: r.char_id,
    charName: r.char_name,

    x: toInt(r.x, 0),
    y: toInt(r.y, 0),

    xpWoodcutting: toInt(r.xp_woodcutting, 0),
    xpMining: toInt(r.xp_mining, 0),
    xpFishing: toInt(r.xp_fishing, 0)
  }));

  return { items, resourceDefs, resourceLoot, resourceSpawns, players };
}

// ----------------- Admin write ops -----------------

const adminPlaceSpawnTx = db.transaction((userId: string, defId: string, x: number, y: number) => {
  const before = db
    .prepare(`SELECT id, def_id, x, y, enabled FROM resource_spawns WHERE x=? AND y=?`)
    .get(x, y);

  db.prepare(`DELETE FROM resource_spawns WHERE x = ? AND y = ?`).run(x, y);

  const id = randomUUID();
  const now = Date.now(); // You can keep this variable if you want, but it's unused in the query below

  // --- FIXED QUERY ---
  db.prepare(
    `INSERT INTO resource_spawns (id, def_id, x, y, enabled)
     VALUES (?, ?, ?, ?, 1)`
  ).run(id, defId, x, y); // <--- REMOVED: userId, now, now
  // -------------------

  const after = db
    .prepare(`SELECT id, def_id, x, y, enabled FROM resource_spawns WHERE x=? AND y=?`)
    .get(x, y);

  audit(userId, "place_spawn", "resource_spawns", id, before, after);
});

const adminRemoveSpawnTx = db.transaction((userId: string, x: number, y: number) => {
  const before = db
    .prepare(`SELECT id, def_id, x, y, enabled FROM resource_spawns WHERE x=? AND y=?`)
    .get(x, y);

  db.prepare(`DELETE FROM resource_spawns WHERE x = ? AND y = ?`).run(x, y);

  audit(userId, "remove_spawn", "resource_spawns", before?.id ?? null, before, null);
});

function upsertItem(userId: string, item: AdminItemRow) {
  const now = Date.now();

  const before = db
    .prepare(
      `SELECT id, name, item_type, equip_slot, stackable, stack_limit, splittable, consumable, meta_json, created_at, updated_at
       FROM items WHERE id = ?`
    )
    .get(item.id);

  const createdAt = before?.created_at ?? now;

  db.prepare(
    `INSERT INTO items
      (id, name, item_type, equip_slot, stackable, stack_limit, splittable, consumable, created_at, updated_at, meta_json)
     VALUES
      (?,  ?,    ?,        ?,         ?,        ?,           ?,          ?,          ?,          ?,          ?)
     ON CONFLICT(id) DO UPDATE SET
      name=excluded.name,
      item_type=excluded.item_type,
      equip_slot=excluded.equip_slot,
      stackable=excluded.stackable,
      stack_limit=excluded.stack_limit,
      splittable=excluded.splittable,
      consumable=excluded.consumable,
      updated_at=excluded.updated_at,
      meta_json=excluded.meta_json`
  ).run(
    item.id,
    item.name,
    item.itemType,
    item.equipSlot ?? null,
    item.stackable ? 1 : 0,
    Math.max(1, toInt(item.stackLimit, 1)),
    item.splittable ? 1 : 0,
    item.consumable ? 1 : 0,
    createdAt,
    now,
    item.metaJson?.trim() || "{}"
  );

  const after = db
    .prepare(
      `SELECT id, name, item_type, equip_slot, stackable, stack_limit, splittable, consumable, meta_json
       FROM items WHERE id = ?`
    )
    .get(item.id);

  audit(userId, "upsert_item", "items", item.id, before, after);
}

function upsertResourceDef(userId: string, def: AdminResourceDefRow) {
  const now = Date.now();

  const before = db
    .prepare(
      `SELECT id, resource_type, name, skill, xp_gain, ticks_min, ticks_max, respawn_ms, meta_json, created_at, updated_at
       FROM resource_defs WHERE id = ?`
    )
    .get(def.id);

  const createdAt = before?.created_at ?? now;

  db.prepare(
    `INSERT INTO resource_defs
      (id, resource_type, name, skill, xp_gain, ticks_min, ticks_max, respawn_ms, mesh, depleted_mesh, collision, created_at, updated_at, meta_json)
     VALUES
      (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET
      resource_type=excluded.resource_type,
      name=excluded.name,
      skill=excluded.skill,
      xp_gain=excluded.xp_gain,
      ticks_min=excluded.ticks_min,
      ticks_max=excluded.ticks_max,
      respawn_ms=excluded.respawn_ms,
                         mesh=excluded.mesh, 
                         depleted_mesh=excluded.depleted_mesh, 
                         collision=excluded.collision,   
      updated_at=excluded.updated_at,
      meta_json=excluded.meta_json`
             

  ).run(
        def.id, def.resourceType, def.name, def.skill, def.xpGain,
            def.ticksMin, def.ticksMax, def.respawnMs,
            def.mesh || "", def.depletedMesh || "", def.collision || "none",
            createdAt, now, def.metaJson?.trim() || "{}"
  );

  const after = db
    .prepare(
      `SELECT id, resource_type, name, skill, xp_gain, ticks_min, ticks_max, respawn_ms, meta_json
       FROM resource_defs WHERE id = ?`
    )
    .get(def.id);

  audit(userId, "upsert_resource_def", "resource_defs", def.id, before, after);
}

const setResourceLootTx = db.transaction(
  (userId: string, resourceId: string, loot: AdminResourceLootRow[]) => {
    const before = db
      .prepare(
        `SELECT resource_id, item_id, min_qty, max_qty, weight
         FROM resource_loot
         WHERE resource_id = ?
         ORDER BY item_id ASC`
      )
      .all(resourceId);

    db.prepare(`DELETE FROM resource_loot WHERE resource_id = ?`).run(resourceId);

    const ins = db.prepare(
      `INSERT INTO resource_loot (resource_id, item_id, min_qty, max_qty, weight)
       VALUES (?, ?, ?, ?, ?)`
    );

    for (const r of loot) {
      ins.run(
        resourceId,
        r.itemId,
        Math.max(0, toInt(r.minQty, 1)),
        Math.max(Math.max(0, toInt(r.minQty, 1)), toInt(r.maxQty, toInt(r.minQty, 1))),
        Math.max(0, toInt(r.weight, 1))
      );
    }

    const after = db
      .prepare(
        `SELECT resource_id, item_id, min_qty, max_qty, weight
         FROM resource_loot
         WHERE resource_id = ?
         ORDER BY item_id ASC`
      )
      .all(resourceId);

    audit(userId, "set_resource_loot", "resource_loot", resourceId, before, after);
  }
);

const updatePlayerTx = db.transaction((userId: string, player: AdminPlayerRow) => {
  const beforeUser = db.prepare(`SELECT id, username, rights FROM users WHERE id = ?`).get(player.userId);
  db.prepare(`UPDATE users SET rights = ? WHERE id = ?`).run(toInt(player.rights, 0), player.userId);
  const afterUser = db.prepare(`SELECT id, username, rights FROM users WHERE id = ?`).get(player.userId);

  const beforeChar = db
    .prepare(
      `SELECT id, name, x, y, xp_woodcutting, xp_mining, xp_fishing
       FROM characters WHERE id = ?`
    )
    .get(player.charId);

  db.prepare(
    `UPDATE characters
     SET name = ?, x = ?, y = ?,
         xp_woodcutting = ?, xp_mining = ?, xp_fishing = ?,
         updated_at = ?
     WHERE id = ?`
  ).run(
    player.charName,
    toInt(player.x, 0),
    toInt(player.y, 0),
    Math.max(0, toInt(player.xpWoodcutting, 0)),
    Math.max(0, toInt(player.xpMining, 0)),
    Math.max(0, toInt(player.xpFishing, 0)),
    Date.now(),
    player.charId
  );

  const afterChar = db
    .prepare(
      `SELECT id, name, x, y, xp_woodcutting, xp_mining, xp_fishing
       FROM characters WHERE id = ?`
    )
    .get(player.charId);

  audit(userId, "update_player", "users", player.userId, beforeUser, afterUser);
  audit(userId, "update_player", "characters", player.charId, beforeChar, afterChar);
});

// ----------------- Sim + events -----------------

const sim = new Sim((e: SimEvent) => {
  if (e.t === "actionStart") {
    sendTo(e.playerId, { t: "chat", line: systemLine(`You start ${verbFor(e.skill)}.`) });
    return;
  }

  if (e.t === "actionComplete") {
    sendTo(e.playerId, {
      t: "chat",
      line: systemLine(`You gain ${e.xpGained} ${skillNamePretty(e.skill)} XP.`)
    });

    const skills = sim.getSkills(e.playerId);
    const inventory = sim.getInventory(e.playerId);
    if (skills && inventory) sendTo(e.playerId, { t: "you", skills, inventory });

    return;
  }

  if (e.t === "inv") {
    sendTo(e.playerId, { t: "inv", inventory: e.inventory });
    return;
  }

  if (e.t === "invFull") {
    sendTo(e.playerId, { t: "invFull" });
    sendTo(e.playerId, { t: "chat", line: systemLine("Your inventory is full.") });
    return;
  }
});

// ----------------- WebSocket -----------------

const wss = new WebSocketServer({ port: PORT_WS });
console.log(`WS listening on ws://localhost:${PORT_WS}`);

wss.on("connection", (ws, req) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const token = url.searchParams.get("token");
  const user = token ? verifyToken(token) : null;

  if (!user) {
    ws.close(1008, "Unauthorized");
    return;
  }

  const userId = user.id;
  const username = user.username;
  const rights = user.rights ?? 0;

  const chr = getDefaultCharacterForUser(userId);
  if (!chr) {
    ws.close(1011, "No character");
    return;
  }

  const skills = rowToSkills(chr);
  const spawn = { x: chr.x, y: chr.y };
  const inventory = loadInventory(chr.id);

  conns.set(userId, {
    userId,
    charId: chr.id,
    username,
    rights,
    ws,
    lastSavedMs: Date.now(),
    lastChatMs: 0
  });

  sim.addPlayer(userId, username, spawn, skills, inventory);

  send(ws, { t: "welcome", id: userId, tickRate: TICK_RATE });
  send(ws, { t: "you", skills, inventory });
  send(ws, { t: "chatHistory", lines: chatHistory });
    send(ws, { t: "materials", list: terrainRepo.getMaterials() });
    
    const currentTerrain = terrainRepo.getAllPatches();
      if (currentTerrain.length > 0) {
          send(ws, { t: "terrainUpdate", patches: currentTerrain });
      }

  const joinLine: ChatLine = {
    id: randomUUID(),
    ts: Date.now(),
    from: { id: "system", name: "System" },
    text: `${username} connected.`
  };
  pushChat(joinLine);
  broadcast({ t: "chat", line: joinLine });

  ws.on("message", (raw) => {
    let msg: ClientToServer | null = null;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!msg) return;

    if (msg.t === "moveTo") {
      sim.setMoveTarget(userId, { x: Math.floor(msg.dest.x), y: Math.floor(msg.dest.y) });
      return;
    }

    if (msg.t === "interact") {
      sim.requestInteract(userId, { x: Math.floor(msg.at.x), y: Math.floor(msg.at.y) });
      return;
    }

    // ---------------- Admin RPCs ----------------
    if (typeof (msg as any).t === "string" && (msg as any).t.startsWith("admin")) {
      const c = requireAdmin(userId);
      if (!c) return;

      try {
        if (msg.t === "adminGetSnapshot") {
          const snap = buildAdminSnapshot();
          sendTo(userId, { t: "adminSnapshot", ...snap });
          return;
        }

        if (msg.t === "adminPlaceSpawn") {
          const x = toInt((msg as any).x, 0);
          const y = toInt((msg as any).y, 0);
          const defId = String((msg as any).defId ?? "").trim();
          if (!defId) return sendTo(userId, { t: "adminError", error: "Missing defId." });

          const exists = db.prepare(`SELECT 1 FROM resource_defs WHERE id = ?`).get(defId);
          if (!exists) return sendTo(userId, { t: "adminError", error: `Unknown resource def: ${defId}` });
          adminPlaceSpawnTx(userId, defId, x, y);

          // ✅ live reload world resources
          sim.reloadResourcesFromDb();

          sendTo(userId, { t: "adminAck", op: "adminPlaceSpawn" });
          sendTo(userId, { t: "adminSnapshot", ...buildAdminSnapshot() });
          return;
        }

        if (msg.t === "adminRemoveSpawn") {
          const x = toInt((msg as any).x, 0);
          const y = toInt((msg as any).y, 0);
            console.log ("Removing item");
          adminRemoveSpawnTx(userId, x, y);

          // ✅ live reload world resources
          sim.reloadResourcesFromDb();

          sendTo(userId, { t: "adminAck", op: "adminRemoveSpawn" });
          sendTo(userId, { t: "adminSnapshot", ...buildAdminSnapshot() });
          return;
        }

        if (msg.t === "adminUpsertItem") {
          upsertItem(userId, (msg as any).item as AdminItemRow);
            sim.reloadResourcesFromDb();
          sendTo(userId, { t: "adminAck", op: "adminUpsertItem" });
          sendTo(userId, { t: "adminSnapshot", ...buildAdminSnapshot() });
          return;
        }

        if (msg.t === "adminUpsertResourceDef") {
          upsertResourceDef(userId, (msg as any).def as AdminResourceDefRow);
            sim.reloadResourcesFromDb();
          sendTo(userId, { t: "adminAck", op: "adminUpsertResourceDef" });
          sendTo(userId, { t: "adminSnapshot", ...buildAdminSnapshot() });
          return;
        }

        if (msg.t === "adminSetResourceLoot") {
          const resourceId = String((msg as any).resourceId ?? "").trim();
          if (!resourceId) return sendTo(userId, { t: "adminError", error: "Missing resourceId." });

          const exists = db.prepare(`SELECT 1 FROM resource_defs WHERE id = ?`).get(resourceId);
          if (!exists) return sendTo(userId, { t: "adminError", error: `Unknown resource def: ${resourceId}` });

          setResourceLootTx(userId, resourceId, ((msg as any).loot ?? []) as AdminResourceLootRow[]);
            sim.reloadResourcesFromDb();
          sendTo(userId, { t: "adminAck", op: "adminSetResourceLoot" });
          sendTo(userId, { t: "adminSnapshot", ...buildAdminSnapshot() });
          return;
        }

        if (msg.t === "adminUpdatePlayer") {
          const p = (msg as any).player as AdminPlayerRow;
          updatePlayerTx(userId, p);

          // If target user is online, update rights + live sim state
          const target = conns.get(p.userId);
          if (target) {
            target.rights = toInt(p.rights, 0);

            const pl = sim.players.get(p.userId);
            if (pl) {
              pl.pos.x = toInt(p.x, 0);
              pl.pos.y = toInt(p.y, 0);
              pl.path = [];
              pl.pending = null;
              pl.action = null;

              pl.skills.woodcutting = Math.max(0, toInt(p.xpWoodcutting, 0));
              pl.skills.mining = Math.max(0, toInt(p.xpMining, 0));
              pl.skills.fishing = Math.max(0, toInt(p.xpFishing, 0));

              const skillsNow = sim.getSkills(p.userId);
              const invNow = sim.getInventory(p.userId);
              if (skillsNow && invNow) sendTo(p.userId, { t: "you", skills: skillsNow, inventory: invNow });
            }
          }
            
            

          sendTo(userId, { t: "adminAck", op: "adminUpdatePlayer" });
          sendTo(userId, { t: "adminSnapshot", ...buildAdminSnapshot() });
          return;
        }

        sendTo(userId, { t: "adminError", error: `Unknown admin op: ${(msg as any).t}` });
        return;
      } catch (err: any) {
        sendTo(userId, { t: "adminError", error: err?.message ?? "Admin op failed." });
        return;
      }
        
        
        
        
    }
      
      if (msg.t === "adminTerrainPaint") {
         if (!requireAdmin(userId)) return;
         terrainRepo.applyPatches(msg.patches);
         // Broadcast to everyone so they see the change live!
         broadcast({ t: "terrainUpdate", patches: msg.patches });
         return;
      }

      if (msg.t === "adminUpsertMaterial") {
         if (!requireAdmin(userId)) return;
         terrainRepo.upsertMaterial(msg.mat);
         broadcast({ t: "materials", list: terrainRepo.getMaterials() });
         return;
      }

    // ---------------- Chat ----------------
    if (msg.t === "chat") {
      const c = conns.get(userId);
      if (!c) return;

      const now = Date.now();
      if (now - c.lastChatMs < 400) return;
      c.lastChatMs = now;

      const text = (msg.text ?? "").trim();
      if (text.length === 0) return;
      if (text.length > 200) return;

      // server-authoritative admin command
      if (text === "::admin") {
        if (c.rights >= 3) {
          sendTo(userId, { t: "adminOpen", rights: c.rights });
          sendTo(userId, { t: "chat", line: systemLine("Admin panel opened.") });
          sendTo(userId, { t: "adminSnapshot", ...buildAdminSnapshot() });
        } else {
          sendTo(userId, { t: "chat", line: systemLine("No access.") });
        }
        return;
      }

      const line: ChatLine = {
        id: randomUUID(),
        ts: now,
        from: { id: userId, name: username },
        text
      };

      pushChat(line);
      broadcast({ t: "chat", line });
      return;
    }
  });

    ws.on("close", () => {
        // FIX: Use sim.getPlayer() instead of sim.players.get()
        const p = sim.getPlayer(userId);
        
        const skillsNow = sim.getSkills(userId);
        const invNow = sim.getInventory(userId);
        
        if (p && skillsNow && invNow) {
          saveCharacterState(chr.id, p.pos.x, p.pos.y, skillsNow);
          saveInventory(chr.id, invNow);
        }

        conns.delete(userId);
        sim.removePlayer(userId);

        const leaveLine: ChatLine = {
          id: randomUUID(),
          ts: Date.now(),
          from: { id: "system", name: "System" },
          text: `${username} disconnected.`
        };
        pushChat(leaveLine);
        broadcast({ t: "chat", line: leaveLine });
      });
    });

// packages/server/src/index.ts

// Tick loop: step sim, broadcast snapshots, periodic persistence
setInterval(() => {
  sim.step();

  const now = Date.now();

  // 1. Loop for Snapshots (Personalized View)
  for (const c of conns.values()) {
    const snap = sim.getSnapshotFor(c.userId);
    
    if (snap) {
      send(c.ws, {
        t: "snapshot",
        tick: sim.tick,
        players: snap.players,
        resources: snap.resources
      });
    }
  }
  // ^ You were missing this closing brace

  // 2. Loop for Persistence (Save Data)
  for (const c of conns.values()) {
    if (now - c.lastSavedMs < 5000) continue;

    // FIX: Use sim.getPlayer() because sim.players (Map) no longer exists
    const p = sim.getPlayer(c.userId);
    const skills = sim.getSkills(c.userId);
    const inv = sim.getInventory(c.userId);
    
    if (!p || !skills || !inv) continue;

    saveCharacterState(c.charId, p.pos.x, p.pos.y, skills);
    saveInventory(c.charId, inv);
    c.lastSavedMs = now;
  }
}, 1000 / TICK_RATE);
