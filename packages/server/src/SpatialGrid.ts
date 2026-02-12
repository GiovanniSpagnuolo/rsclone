import type { Vec2 } from "@rsclone/shared/protocol";
import { CHUNK_SIZE, WORLD_W, WORLD_H } from "@rsclone/shared/world";

export class SpatialGrid<T extends { id: string; pos: Vec2 }> {
  // Map "chunkKey" -> Set of Entity IDs
  private chunks = new Map<string, Set<string>>();
  // Map "EntityID" -> Entity Object
  private entities = new Map<string, T>();
  // Map "EntityID" -> Last known Chunk Key (to detect changes)
  private entityChunk = new Map<string, string>();

  private getKey(x: number, y: number) {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cy = Math.floor(y / CHUNK_SIZE);
    return `${cx},${cy}`;
  }

  add(entity: T) {
    this.entities.set(entity.id, entity);
    this.update(entity);
  }

  remove(id: string) {
    const oldKey = this.entityChunk.get(id);
    if (oldKey) {
      this.chunks.get(oldKey)?.delete(id);
    }
    this.entityChunk.delete(id);
    this.entities.delete(id);
  }

  get(id: string): T | undefined {
    return this.entities.get(id);
  }

  getAll(): T[] {
    return Array.from(this.entities.values());
  }

  clear() {
    this.chunks.clear();
    this.entities.clear();
    this.entityChunk.clear();
  }

  update(entity: T) {
    const newKey = this.getKey(entity.pos.x, entity.pos.y);
    const oldKey = this.entityChunk.get(entity.id);

    if (newKey !== oldKey) {
      // Remove from old
      if (oldKey) {
        this.chunks.get(oldKey)?.delete(entity.id);
      }
      
      // Add to new
      let set = this.chunks.get(newKey);
      if (!set) {
        set = new Set();
        this.chunks.set(newKey, set);
      }
      set.add(entity.id);
      
      this.entityChunk.set(entity.id, newKey);
    }
  }

  /**
   * Returns all entities in the 3x3 chunks surrounding the center position.
   * (Current chunk + 8 neighbors)
   */
  queryViewRect(pos: Vec2): T[] {
    const cx = Math.floor(pos.x / CHUNK_SIZE);
    const cy = Math.floor(pos.y / CHUNK_SIZE);
    
    const results: T[] = [];

    // Loop through 3x3 chunk grid
    for (let y = cy - 1; y <= cy + 1; y++) {
      for (let x = cx - 1; x <= cx + 1; x++) {
        const key = `${x},${y}`;
        const chunk = this.chunks.get(key);
        if (chunk) {
          for (const id of chunk) {
            const ent = this.entities.get(id);
            if (ent) results.push(ent);
          }
        }
      }
    }
    return results;
  }
}
