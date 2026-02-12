import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const dbPath = process.env.DB_PATH || "./data/game.db";
const abs = path.isAbsolute(dbPath) ? dbPath : path.join(process.cwd(), dbPath);

fs.mkdirSync(path.dirname(abs), { recursive: true });

export const db = new Database(abs);
db.pragma("journal_mode = WAL");

function tryAlter(sql: string) {
  try {
    db.exec(sql);
  } catch {
    // ignore
  }
}

export function migrate() {
  db.exec(`
    -- USERS & CHARACTERS
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      rights INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS characters (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      x INTEGER NOT NULL DEFAULT 7,
      y INTEGER NOT NULL DEFAULT 7,
      xp_woodcutting INTEGER NOT NULL DEFAULT 0,
      xp_mining INTEGER NOT NULL DEFAULT 0,
      xp_fishing INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS inventory (
      char_id TEXT NOT NULL,
      slot INTEGER NOT NULL,
      item_id TEXT NOT NULL,
      qty INTEGER NOT NULL,
      PRIMARY KEY (char_id, slot)
    );
    CREATE INDEX IF NOT EXISTS idx_inventory_char ON inventory(char_id);

    -- ITEMS
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      item_type TEXT NOT NULL,
      equip_slot TEXT,
      stackable INTEGER NOT NULL DEFAULT 0,
      stack_limit INTEGER NOT NULL DEFAULT 1,
      splittable INTEGER NOT NULL DEFAULT 0,
      consumable INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      meta_json TEXT NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_items_type ON items(item_type);

    CREATE TABLE IF NOT EXISTS item_requirements (
      item_id TEXT NOT NULL,
      skill TEXT NOT NULL,
      level INTEGER NOT NULL,
      PRIMARY KEY (item_id, skill),
      FOREIGN KEY(item_id) REFERENCES items(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS item_consume_buffs (
      item_id TEXT NOT NULL,
      skill TEXT NOT NULL,
      amount INTEGER NOT NULL,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (item_id, skill),
      FOREIGN KEY(item_id) REFERENCES items(id) ON DELETE CASCADE
    );

    -- RESOURCES
    CREATE TABLE IF NOT EXISTS resource_defs (
      id TEXT PRIMARY KEY,
      resource_type TEXT NOT NULL,
      name TEXT NOT NULL,
      skill TEXT NOT NULL,
      xp_gain INTEGER NOT NULL DEFAULT 0,
      ticks_min INTEGER NOT NULL DEFAULT 4,
      ticks_max INTEGER NOT NULL DEFAULT 6,
      respawn_ms INTEGER NOT NULL DEFAULT 8000,
      mesh TEXT NOT NULL DEFAULT '',
      depleted_mesh TEXT NOT NULL DEFAULT '',
      collision TEXT NOT NULL DEFAULT 'none',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      meta_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS resource_requirements (
      resource_id TEXT NOT NULL,
      skill TEXT NOT NULL,
      level INTEGER NOT NULL,
      PRIMARY KEY (resource_id, skill),
      FOREIGN KEY(resource_id) REFERENCES resource_defs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS resource_loot (
      resource_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      min_qty INTEGER NOT NULL DEFAULT 1,
      max_qty INTEGER NOT NULL DEFAULT 1,
      weight INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (resource_id, item_id),
      FOREIGN KEY(resource_id) REFERENCES resource_defs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS resource_spawns (
      id TEXT PRIMARY KEY,
      x INTEGER NOT NULL,
      y INTEGER NOT NULL,
      def_id TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY(def_id) REFERENCES resource_defs(id)
    );

    -- MODELS (Legacy / fallback)
    CREATE TABLE IF NOT EXISTS models (
      id TEXT PRIMARY KEY,
      name TEXT,
      data_json TEXT NOT NULL
    );

    -- ASSETS (Binary Cache)
    CREATE TABLE IF NOT EXISTS assets (
      name TEXT PRIMARY KEY, 
      data BLOB NOT NULL,
      size INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  // Migrations
  tryAlter(`ALTER TABLE resource_defs ADD COLUMN mesh TEXT NOT NULL DEFAULT ''`);
  tryAlter(`ALTER TABLE resource_defs ADD COLUMN depleted_mesh TEXT NOT NULL DEFAULT ''`);
  tryAlter(`ALTER TABLE resource_defs ADD COLUMN collision TEXT NOT NULL DEFAULT 'none'`);

  seedDefaults();
}

function seedDefaults() {
  const now = Date.now();

  // Seed Items
  const hasItems = db.prepare("SELECT 1 FROM items LIMIT 1").get();
  if (!hasItems) {
    const insertItem = db.prepare(`
      INSERT OR IGNORE INTO items (id, name, item_type, equip_slot, stackable, stack_limit, splittable, consumable, created_at, updated_at, meta_json)
      VALUES (@id, @name, @item_type, @equip_slot, @stackable, @stack_limit, @splittable, @consumable, @created_at, @updated_at, @meta_json)
    `);
    insertItem.run({ id: "logs", name: "Logs", item_type: "resource", equip_slot: null, stackable: 1, stack_limit: 9999, splittable: 1, consumable: 0, created_at: now, updated_at: now, meta_json: "{}" });
    insertItem.run({ id: "ore", name: "Ore", item_type: "resource", equip_slot: null, stackable: 1, stack_limit: 9999, splittable: 1, consumable: 0, created_at: now, updated_at: now, meta_json: "{}" });
    insertItem.run({ id: "raw_fish", name: "Raw fish", item_type: "resource", equip_slot: null, stackable: 1, stack_limit: 9999, splittable: 1, consumable: 0, created_at: now, updated_at: now, meta_json: "{}" });
  }

  // Seed Resources
  const hasDefs = db.prepare("SELECT 1 FROM resource_defs LIMIT 1").get();
  if (!hasDefs) {
    const insertDef = db.prepare(`
      INSERT OR IGNORE INTO resource_defs (id, resource_type, name, skill, xp_gain, ticks_min, ticks_max, respawn_ms, mesh, depleted_mesh, collision, created_at, updated_at, meta_json)
      VALUES (@id, @resource_type, @name, @skill, @xp_gain, @ticks_min, @ticks_max, @respawn_ms, @mesh, @depleted_mesh, @collision, @created_at, @updated_at, @meta_json)
    `);
    const insertReq = db.prepare("INSERT OR IGNORE INTO resource_requirements (resource_id, skill, level) VALUES (?, ?, ?)");
    const insertLoot = db.prepare("INSERT OR IGNORE INTO resource_loot (resource_id, item_id, min_qty, max_qty, weight) VALUES (?, ?, ?, ?, ?)");

    // Tree
    insertDef.run({ id: "tree_basic", resource_type: "tree", name: "Tree", skill: "woodcutting", xp_gain: 25, ticks_min: 4, ticks_max: 6, respawn_ms: 8000, mesh: "tree.glb", depleted_mesh: "tree_stump.glb", collision: "block", created_at: now, updated_at: now, meta_json: "{}" });
    insertReq.run("tree_basic", "woodcutting", 1);
    insertLoot.run("tree_basic", "logs", 1, 1, 100);

    // Rock
    insertDef.run({ id: "rock_basic", resource_type: "rock", name: "Rock", skill: "mining", xp_gain: 35, ticks_min: 5, ticks_max: 8, respawn_ms: 12000, mesh: "rock.glb", depleted_mesh: "rock_rubble.glb", collision: "block", created_at: now, updated_at: now, meta_json: "{}" });
    insertReq.run("rock_basic", "mining", 1);
    insertLoot.run("rock_basic", "ore", 1, 1, 100);

    // Fish
    insertDef.run({ id: "fishing_spot_basic", resource_type: "fishing_spot", name: "Fishing Spot", skill: "fishing", xp_gain: 20, ticks_min: 3, ticks_max: 5, respawn_ms: 6000, mesh: "fishing_spot.glb", depleted_mesh: "fishing_spot.glb", collision: "none", created_at: now, updated_at: now, meta_json: "{}" });
    insertReq.run("fishing_spot_basic", "fishing", 1);
    insertLoot.run("fishing_spot_basic", "raw_fish", 1, 1, 100);
  }

  // Seed Spawns
  const hasSpawns = db.prepare("SELECT 1 FROM resource_spawns LIMIT 1").get();
  if (!hasSpawns) {
      console.log("NO SPAWNS!");
    const insertSpawn = db.prepare("INSERT OR IGNORE INTO resource_spawns (id, x, y, def_id) VALUES (?, ?, ?, ?)");
    insertSpawn.run("spawn_t1", 10, 10, "tree_basic");
    insertSpawn.run("spawn_t2", 11, 10, "tree_basic");
    insertSpawn.run("spawn_t3", 12, 10, "tree_basic");
    insertSpawn.run("spawn_r1", 15, 10, "rock_basic");
    insertSpawn.run("spawn_r2", 16, 10, "rock_basic");
    insertSpawn.run("spawn_f1", 10, 15, "fishing_spot_basic");
  }
}
