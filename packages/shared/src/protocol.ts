export const PROTOCOL_VERSION = 1;

export type Vec2 = { x: number; y: number };

export type SkillName = "woodcutting" | "mining" | "fishing";
export type SkillXP = Record<SkillName, number>;

export type ResourceType = "tree" | "rock" | "fishing_spot";

export type ResourceState = {
  id: string;
  type: ResourceType;
  pos: Vec2;
  alive: boolean;
  respawnAtMs: number;
};

/**
 * DB-driven item ids (not a union).
 */
export type ItemId = string;

export type InventorySlot = {
  itemId: ItemId;
  qty: number;
};

export type Inventory = Array<InventorySlot | null>; // length 30

export type PlayerAction =
  | { kind: "woodcutting" | "mining" | "fishing"; ticksLeft: number; target: Vec2 }
  | null;

export type PlayerState = {
  id: string;
  name: string;
  pos: Vec2;
  action: PlayerAction;
};

export type ChatLine = {
  id: string;
  ts: number;
  from: { id: string; name: string } | { id: "system"; name: "System" };
  text: string;
};

// -------------------- Admin DTOs (safe CRUD, no raw SQL) --------------------

export type AdminItemRow = {
  id: ItemId;
  name: string;
  itemType: string;
  equipSlot: string | null;
  stackable: boolean;
  stackLimit: number;
  splittable: boolean;
  consumable: boolean;
  metaJson: string; // keep as string for easy text editing in UI
};

export type AdminResourceDefRow = {
  id: string; // e.g. "tree_basic", "oak_tree"
  resourceType: ResourceType;
  name: string;
  skill: SkillName;
  xpGain: number;
  ticksMin: number;
  ticksMax: number;
  respawnMs: number;

  // --- NEW (client visuals + pathing) ---
  mesh: string;           // alive mesh id / asset key
  depletedMesh: string;   // depleted mesh id / asset key
  collision: "none" | "block"; // NOTE: "block" blocks even when depleted

  metaJson: string;
};


export type AdminResourceLootRow = {
  resourceId: string;
  itemId: ItemId;
  minQty: number;
  maxQty: number;
  weight: number;
};

export type AdminResourceSpawnRow = {
  id: string;
  defId: string;
  x: number;
  y: number;
  enabled: boolean;
};

export type AdminPlayerRow = {
  userId: string;
  username: string;
  rights: number;

  charId: string;
  charName: string;

  x: number;
  y: number;

  xpWoodcutting: number;
  xpMining: number;
  xpFishing: number;
};

export type AdminTool =
  | { mode: "off" }
  | { mode: "remove" }
  | { mode: "place"; defId: string };

// -------------------- Client → Server --------------------

export type ClientToServer =
  | { t: "moveTo"; dest: Vec2 }
  | { t: "interact"; at: Vec2 }
  | { t: "chat"; text: string }

  // ---- Admin requests (server must enforce rights >= 3) ----
  | { t: "adminGetSnapshot" } // fetch items/resources/spawns/players for editor
  | { t: "adminPlaceSpawn"; defId: string; x: number; y: number }
  | { t: "adminRemoveSpawn"; x: number; y: number }
  | { t: "adminUpsertItem"; item: AdminItemRow }
  | { t: "adminUpsertResourceDef"; def: AdminResourceDefRow }
  | { t: "adminSetResourceLoot"; resourceId: string; loot: AdminResourceLootRow[] }
  | { t: "adminUpdatePlayer"; player: AdminPlayerRow };

// -------------------- Server → Client --------------------

export type ServerToClient =
  | { t: "welcome"; id: string; tickRate: number }
  | { t: "snapshot"; tick: number; players: PlayerState[]; resources: ResourceState[] }

  // private-to-you state
  | { t: "you"; skills: SkillXP; inventory: Inventory }

  // inventory updates
  | { t: "inv"; inventory: Inventory }
  | { t: "invFull" }

  // chat
  | { t: "chat"; line: ChatLine }
  | { t: "chatHistory"; lines: ChatLine[] }

  // ---- Admin ----
  | { t: "adminOpen"; rights: number } // sent only after ::admin and rights check
  | {
      t: "adminSnapshot";
      items: AdminItemRow[];
      resourceDefs: AdminResourceDefRow[];
      resourceLoot: AdminResourceLootRow[];
      resourceSpawns: AdminResourceSpawnRow[];
      players: AdminPlayerRow[];
    }
  | { t: "adminAck"; op: string }
  | { t: "adminError"; error: string };
