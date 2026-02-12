// packages/server/src/TerrainRepo.ts
import { db } from "./db.js";
import type { TerrainMaterial, TerrainPatch } from "@rsclone/shared/protocol";
import { CHUNK_SIZE } from "@rsclone/shared/world";

export class TerrainRepo {
  private matCache = new Map<string, TerrainMaterial>();
  // tileCache key: "x,y"
  private tileCache = new Map<string, { h: number; m: string }>();

  constructor() {
    this.loadAll();
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

  getMaterials(): TerrainMaterial[] {
    return Array.from(this.matCache.values());
  }

  // --- NEW: Chunk Based Query ---
  getPatchesInChunk(chunkX: number, chunkY: number): TerrainPatch[] {
    const patches: TerrainPatch[] = [];
    const startX = chunkX * CHUNK_SIZE;
    const startY = chunkY * CHUNK_SIZE;
    const endX = startX + CHUNK_SIZE;
    const endY = startY + CHUNK_SIZE;

    // Iterate only the bounds of this chunk
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
  // ------------------------------

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
}
