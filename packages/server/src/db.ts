import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const dbPath = process.env.DB_PATH || "./data/game.db";
const abs = path.isAbsolute(dbPath) ? dbPath : path.join(process.cwd(), dbPath);

fs.mkdirSync(path.dirname(abs), { recursive: true });

export const db = new Database(abs);
db.pragma("journal_mode = WAL");

function ensureColumn(table: string, column: string, ddl: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  const has = cols.some((c) => c.name === column);
  if (!has) db.exec(ddl);
}

export function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
      -- rights is added via migration below for existing DBs,
      -- and included in CREATE for fresh DBs by ALTER below if needed.
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

    -- ---------------------------
    -- Items catalog (authoritative)
    -- ---------------------------
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
    CREATE INDEX IF NOT EXISTS idx_items_equip_slot ON items(equip_slot);

    CREATE TABLE IF NOT EXISTS item_requirements (
      item_id TEXT NOT NULL,
      skill TEXT NOT NULL,
      level INTEGER NOT NULL,
      PRIMARY KEY (item_id, skill),
      FOREIGN KEY(item_id) REFERENCES items(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_item_requirements_skill ON item_requirements(skill);

    CREATE TABLE IF NOT EXISTS item_consume_buffs (
      item_id TEXT NOT NULL,
      skill TEXT NOT NULL,
      amount INTEGER NOT NULL,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (item_id, skill),
      FOREIGN KEY(item_id) REFERENCES items(id) ON DELETE CASCADE
    );

    -- ---------------------------
    -- Resources catalog (authoritative)
    -- ---------------------------
    CREATE TABLE IF NOT EXISTS resource_defs (
      id TEXT PRIMARY KEY,

      resource_type TEXT NOT NULL,   -- "tree" | "rock" | "fishing_spot"
      name TEXT NOT NULL,

      skill TEXT NOT NULL,           -- "woodcutting" | "mining" | "fishing"

      xp_gain INTEGER NOT NULL DEFAULT 0,

      ticks_min INTEGER NOT NULL DEFAULT 4,
      ticks_max INTEGER NOT NULL DEFAULT 6,

      respawn_ms INTEGER NOT NULL DEFAULT 8000,

      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,

      meta_json TEXT NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_resource_defs_type ON resource_defs(resource_type);
    CREATE INDEX IF NOT EXISTS idx_resource_defs_skill ON resource_defs(skill);

    CREATE TABLE IF NOT EXISTS resource_requirements (
      resource_id TEXT NOT NULL,
      skill TEXT NOT NULL,
      level INTEGER NOT NULL,
      PRIMARY KEY (resource_id, skill),
      FOREIGN KEY(resource_id) REFERENCES resource_defs(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_resource_requirements_skill ON resource_requirements(skill);

    CREATE TABLE IF NOT EXISTS resource_loot (
      resource_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      min_qty INTEGER NOT NULL DEFAULT 1,
      max_qty INTEGER NOT NULL DEFAULT 1,
      weight INTEGER NOT NULL DEFAULT 1,

      PRIMARY KEY (resource_id, item_id),
      FOREIGN KEY(resource_id) REFERENCES resource_defs(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_resource_loot_resource ON resource_loot(resource_id);

    -- ---------------------------
    -- Resource spawns (for in-game map editor)
    -- ---------------------------
    -- This table is the "auth source of truth" for placed resources.
    -- The sim/world can load these and render/simulate them.
    CREATE TABLE IF NOT EXISTS resource_spawns (
      id TEXT PRIMARY KEY,

      def_id TEXT NOT NULL,
      x INTEGER NOT NULL,
      y INTEGER NOT NULL,

      enabled INTEGER NOT NULL DEFAULT 1,

      placed_by_user_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,

      FOREIGN KEY(def_id) REFERENCES resource_defs(id) ON DELETE RESTRICT
    );

    -- Prevent multiple resources on the same tile:
    CREATE UNIQUE INDEX IF NOT EXISTS uq_resource_spawns_xy ON resource_spawns(x, y);
    CREATE INDEX IF NOT EXISTS idx_resource_spawns_def ON resource_spawns(def_id);

    -- ---------------------------
    -- Admin audit log (optional but extremely useful)
    -- ---------------------------
    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      before_json TEXT,
      after_json TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);

    CREATE INDEX IF NOT EXISTS idx_characters_user_id ON characters(user_id);
  `);

  // ---- Migrations for existing DBs ----

  // users.rights (rights >= 3 => admin)
  ensureColumn(
    "users",
    "rights",
    `ALTER TABLE users ADD COLUMN rights INTEGER NOT NULL DEFAULT 0`
  );

  // Backfill updated_at if old rows existed
  db.exec(`
    UPDATE characters
    SET updated_at = created_at
    WHERE updated_at IS NULL;
  `);

  const now = Date.now();

  // ---------------------------
  // Seed starter items/resources (safe to run repeatedly)
  // ---------------------------
  const seedItem = db.prepare(`
    INSERT OR IGNORE INTO items
      (id, name, item_type, equip_slot, stackable, stack_limit, splittable, consumable, created_at, updated_at, meta_json)
    VALUES
      (@id, @name, @item_type, @equip_slot, @stackable, @stack_limit, @splittable, @consumable, @created_at, @updated_at, @meta_json)
  `);

  const seedRes = db.prepare(`
    INSERT OR IGNORE INTO resource_defs
      (id, resource_type, name, skill, xp_gain, ticks_min, ticks_max, respawn_ms, created_at, updated_at, meta_json)
    VALUES
      (@id, @resource_type, @name, @skill, @xp_gain, @ticks_min, @ticks_max, @respawn_ms, @created_at, @updated_at, @meta_json)
  `);

  const seedResLoot = db.prepare(`
    INSERT OR IGNORE INTO resource_loot
      (resource_id, item_id, min_qty, max_qty, weight)
    VALUES
      (@resource_id, @item_id, @min_qty, @max_qty, @weight)
  `);

  const tx = db.transaction(() => {
    // Items
    seedItem.run({
      id: "logs",
      name: "Logs",
      item_type: "resource",
      equip_slot: null,
      stackable: 1,
      stack_limit: 2147483647,
      splittable: 1,
      consumable: 0,
      created_at: now,
      updated_at: now,
      meta_json: "{}"
    });

    seedItem.run({
      id: "ore",
      name: "Ore",
      item_type: "resource",
      equip_slot: null,
      stackable: 1,
      stack_limit: 2147483647,
      splittable: 1,
      consumable: 0,
      created_at: now,
      updated_at: now,
      meta_json: "{}"
    });

    seedItem.run({
      id: "raw_fish",
      name: "Raw fish",
      item_type: "resource",
      equip_slot: null,
      stackable: 1,
      stack_limit: 2147483647,
      splittable: 1,
      consumable: 0,
      created_at: now,
      updated_at: now,
      meta_json: "{}"
    });

    // Resources
    seedRes.run({
      id: "tree_basic",
      resource_type: "tree",
      name: "Tree",
      skill: "woodcutting",
      xp_gain: 25,
      ticks_min: 4,
      ticks_max: 6,
      respawn_ms: 8000,
      created_at: now,
      updated_at: now,
      meta_json: "{}"
    });

    seedRes.run({
      id: "rock_basic",
      resource_type: "rock",
      name: "Rock",
      skill: "mining",
      xp_gain: 35,
      ticks_min: 5,
      ticks_max: 7,
      respawn_ms: 12000,
      created_at: now,
      updated_at: now,
      meta_json: "{}"
    });

    seedRes.run({
      id: "fishing_spot_basic",
      resource_type: "fishing_spot",
      name: "Fishing spot",
      skill: "fishing",
      xp_gain: 20,
      ticks_min: 3,
      ticks_max: 5,
      respawn_ms: 6000,
      created_at: now,
      updated_at: now,
      meta_json: "{}"
    });

    // Loot tables (one row each for now)
    seedResLoot.run({
      resource_id: "tree_basic",
      item_id: "logs",
      min_qty: 1,
      max_qty: 1,
      weight: 1
    });

    seedResLoot.run({
      resource_id: "rock_basic",
      item_id: "ore",
      min_qty: 1,
      max_qty: 1,
      weight: 1
    });

    seedResLoot.run({
      resource_id: "fishing_spot_basic",
      item_id: "raw_fish",
      min_qty: 1,
      max_qty: 1,
      weight: 1
    });
  });

  tx();
}
