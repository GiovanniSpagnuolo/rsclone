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
    // ignore (most likely column already exists)
  }
}

export function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
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
    -- This is the definition of a resource node type: tree, rock, fishing_spot, etc.
    -- You can make variants like "oak_tree", "copper_rock", "shrimp_spot".
    CREATE TABLE IF NOT EXISTS resource_defs (
      id TEXT PRIMARY KEY,

      -- Keep this aligned with your ResourceType union in protocol for now
      -- (later we can loosen it to string like ItemId).
      resource_type TEXT NOT NULL,   -- "tree" | "rock" | "fishing_spot"
      name TEXT NOT NULL,

      -- Which skill this node uses for the action
      skill TEXT NOT NULL,           -- "woodcutting" | "mining" | "fishing"

      xp_gain INTEGER NOT NULL DEFAULT 0,

      -- Action duration in ticks (server tick loop); pick a value between min/max each action
      ticks_min INTEGER NOT NULL DEFAULT 4,
      ticks_max INTEGER NOT NULL DEFAULT 6,

      respawn_ms INTEGER NOT NULL DEFAULT 8000,

      -- Visuals (client)
      mesh TEXT NOT NULL DEFAULT '',
      depleted_mesh TEXT NOT NULL DEFAULT '',

      -- Collision behavior (server)
      -- "block" means the tile is never walkable (even when depleted)
      -- so players can't stand on it when it respawns.
      collision TEXT NOT NULL DEFAULT 'none',

      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,

      meta_json TEXT NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_resource_defs_type ON resource_defs(resource_type);
    CREATE INDEX IF NOT EXISTS idx_resource_defs_skill ON resource_defs(skill);

    -- Skill requirements for harvesting this node (normalized)
    CREATE TABLE IF NOT EXISTS resource_requirements (
      resource_id TEXT NOT NULL,
      skill TEXT NOT NULL,
      level INTEGER NOT NULL,
      PRIMARY KEY (resource_id, skill),
      FOREIGN KEY(resource_id) REFERENCES resource_defs(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_resource_requirements_skill ON resource_requirements(skill);

    -- Loot table rows (normalized)
    -- "weight" implements weighted random selection.
    -- qty is random between min_qty..max_qty when this row is selected.
    CREATE TABLE IF NOT EXISTS resource_loot (
      resource_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      min_qty INTEGER NOT NULL DEFAULT 1,
      max_qty INTEGER NOT NULL DEFAULT 1,
      weight INTEGER NOT NULL DEFAULT 1,

      PRIMARY KEY (resource_id, item_id),
      FOREIGN KEY(resource_id) REFERENCES resource_defs(id) ON DELETE CASCADE
      -- Optionally add FOREIGN KEY(item_id) REFERENCES items(id) later
    );
    CREATE INDEX IF NOT EXISTS idx_resource_loot_resource ON resource_loot(resource_id);

    CREATE INDEX IF NOT EXISTS idx_characters_user_id ON characters(user_id);
  `);

  // ---------------------------------
  // Lightweight migrations (ALTER TABLE)
  // ---------------------------------
  // Resource defs: visuals + collision behavior.
  // NOTE: collision applies regardless of alive/depleted state so players can't stand on the tile.
  tryAlter(`ALTER TABLE resource_defs ADD COLUMN mesh TEXT NOT NULL DEFAULT ''`);
  tryAlter(`ALTER TABLE resource_defs ADD COLUMN depleted_mesh TEXT NOT NULL DEFAULT ''`);
  tryAlter(`ALTER TABLE resource_defs ADD COLUMN collision TEXT NOT NULL DEFAULT 'none'`);

  // Backfill updated_at if old rows existed
  db.exec(`
    UPDATE characters
    SET updated_at = created_at
    WHERE updated_at IS NULL;
  `);

  const now = Date.now();

  // ---------------------------
  // Seed starter items used by loot
  // ---------------------------
  const seedItem = db.prepare(`
    INSERT OR IGNORE INTO items
      (id, name, item_type, equip_slot, stackable, stack_limit, splittable, consumable, created_at, updated_at, meta_json)
    VALUES
      (@id, @name, @item_type, @equip_slot, @stackable, @stack_limit, @splittable, @consumable, @created_at, @updated_at, @meta_json)
  `);

  // ---------------------------
  // Seed starter resources
  // ---------------------------
  const seedRes = db.prepare(`
    INSERT OR IGNORE INTO resource_defs
      (id, resource_type, name, skill, xp_gain, ticks_min, ticks_max, respawn_ms, mesh, depleted_mesh, collision, created_at, updated_at, meta_json)
    VALUES
      (@id, @resource_type, @name, @skill, @xp_gain, @ticks_min, @ticks_max, @respawn_ms, @mesh, @depleted_mesh, @collision, @created_at, @updated_at, @meta_json)
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
      mesh: "tree_basic",
      depleted_mesh: "tree_stump",
      collision: "block",
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
      mesh: "rock_basic",
      depleted_mesh: "rock_depleted",
      collision: "block",
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
      mesh: "fishing_spot_basic",
      depleted_mesh: "fishing_spot_depleted",
      collision: "none",
      created_at: now,
      updated_at: now,
      meta_json: "{}"
    });

    // Loot tables
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
