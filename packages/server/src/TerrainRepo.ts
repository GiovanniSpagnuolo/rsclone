import { db } from "./db.js";
import type { TerrainMaterial, TerrainPatch } from "@rsclone/shared/protocol";
import { CHUNK_SIZE, WORLD_W, WORLD_H } from "@rsclone/shared/world";

export class TerrainRepo {
  private matCache = new Map<string, TerrainMaterial>();
  // tileCache key: "x,y"
  private tileCache = new Map<string, { h: number; m: string }>();

  constructor() {
    this.loadAll();
    this.ensureDefaultTerrain(); // <--- CRITICAL FIX
  }

  loadAll() {
    try {
      const mats = db.prepare("SELECT id, name, color, texture_name FROM materials").all() as any[];
      for (const m of mats) {
        this.matCache.set(m.id, {
          id: m.id,
          name: m.name,
          color: Number(m.color),
          textureName: m.texture_name || undefined
        });
      }

      const tiles = db.prepare("SELECT x, y, height, mat_id FROM tiles").all() as any[];
      for (const t of tiles) {
        this.tileCache.set(`${t.x},${t.y}`, { h: t.height, m: t.mat_id });
      }
    } catch (e) {
      console.warn("Terrain tables missing or empty, skipping load.");
    }
  }

  // --- NEW: Check and Create Default ---
  ensureDefaultTerrain() {
      const exists = db.prepare("SELECT 1 FROM assets WHERE name = 'terrain.dat'").get();
      if (!exists) {
          console.log("[TerrainRepo] No terrain.dat found. Generating default flat world...");
          this.saveToAssetCache();
      }
  }

  getMaterials(): TerrainMaterial[] {
    return Array.from(this.matCache.values());
  }

  getPatchesInChunk(chunkX: number, chunkY: number): TerrainPatch[] {
    const patches: TerrainPatch[] = [];
    const startX = chunkX * CHUNK_SIZE;
    const startY = chunkY * CHUNK_SIZE;
    const endX = startX + CHUNK_SIZE;
    const endY = startY + CHUNK_SIZE;

    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const val = this.tileCache.get(`${x},${y}`);
        if (val) {
          patches.push({ x, y, h: val.h, m: val.m });
        }
      }
    }
    return patches;
  }

  applyPatches(patches: TerrainPatch[]) {
    const upsert = db.prepare(`
      INSERT INTO tiles (x, y, height, mat_id) VALUES (@x, @y, @h, @m)
      ON CONFLICT(x,y) DO UPDATE SET height=excluded.height, mat_id=excluded.mat_id
    `);

    const tx = db.transaction(() => {
      for (const p of patches) {
        const key = `${p.x},${p.y}`;
        const current = this.tileCache.get(key) || { h: 0, m: "grass" };
        
        const newH = p.h !== undefined ? p.h : current.h;
        const newM = p.m !== undefined ? p.m : current.m;

        this.tileCache.set(key, { h: newH, m: newM });
        upsert.run({ x: p.x, y: p.y, h: newH, m: newM });
      }
    });
    tx();
  }
  
  upsertMaterial(mat: TerrainMaterial) {
      db.prepare(`
        INSERT INTO materials (id, name, color, texture_name, created_at)
        VALUES (@id, @name, @color, @textureName, @now)
        ON CONFLICT(id) DO UPDATE SET name=excluded.name, color=excluded.color, texture_name=excluded.texture_name
      `).run({ ...mat, textureName: mat.textureName || null, now: Date.now() });
      this.matCache.set(mat.id, mat);
  }

  saveToAssetCache() {
    console.log("Saving terrain to cache...");
    
    // 1. Build Palette
    const materials = this.getMaterials();
    if (materials.length === 0) materials.push({ id: "grass", name: "Grass", color: 0x55ff55 });

    const matToIndex = new Map<string, number>();
    const palette: string[] = [];
    
    materials.sort((a, b) => (a.id === "grass" ? -1 : 1));
    
    materials.forEach((m, i) => {
        if (i > 255) throw new Error("Too many materials for Uint8 index");
        matToIndex.set(m.id, i);
        palette.push(m.id);
    });

    // 2. Calculate Size
    // Header (5) + Palette Count (1)
    let size = 6;
    for (const id of palette) size += 1 + Buffer.byteLength(id);
    // Grid (5 bytes per tile)
    size += (WORLD_W * WORLD_H) * 5;

    const buf = Buffer.alloc(size);
    let offset = 0;

    // 3. Write Header
    buf.write("TERR", offset); offset += 4;
    buf.writeUInt8(1, offset); offset += 1;

    // 4. Write Palette
    buf.writeUInt8(palette.length, offset); offset += 1;
    for (const id of palette) {
        const len = Buffer.byteLength(id);
        buf.writeUInt8(len, offset); offset += 1;
        buf.write(id, offset); offset += len;
    }

    // 5. Write Grid
    const defaultMatIdx = matToIndex.get("grass") ?? 0;
    
    for (let y = 0; y < WORLD_H; y++) {
        for (let x = 0; x < WORLD_W; x++) {
            const val = this.tileCache.get(`${x},${y}`);
            const h = val ? val.h : 0;
            const mStr = val ? val.m : "grass";
            const mIdx = matToIndex.get(mStr) ?? defaultMatIdx;
            
            buf.writeFloatLE(h, offset); offset += 4;
            buf.writeUInt8(mIdx, offset); offset += 1;
        }
    }

    db.prepare(`
      INSERT INTO assets (name, data, size, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET data=excluded.data, size=excluded.size, updated_at=excluded.updated_at
    `).run("terrain.dat", buf, buf.length, Date.now());
    
    console.log(`Saved terrain.dat (${size} bytes) to assets table.`);
  }
}
