// packages/client/src/game3d/TerrainMesh.ts
import * as THREE from "three";
import { CHUNK_SIZE, WORLD_W, WORLD_H } from "@rsclone/shared/world";

// A single 16x16 chunk of terrain
class ChunkMesh {
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;

  constructor(public cx: number, public cy: number, material: THREE.Material, initialData: { heights: Float32Array, colors: Float32Array }) {
    this.geometry = new THREE.BufferGeometry();
    
    this.geometry.setAttribute("position", new THREE.BufferAttribute(initialData.heights, 3));
    this.geometry.setAttribute("color", new THREE.BufferAttribute(initialData.colors, 3));
    
    // Normals
    const vertexCount = CHUNK_SIZE * CHUNK_SIZE * 6;
    this.geometry.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3));
    this.geometry.computeVertexNormals();

    // --- FIX 1: Compute Bounds for Culling ---
    // Without this, Three.js thinks the mesh is at 0,0,0 with radius 0 and culls it.
    this.geometry.computeBoundingSphere();
    this.geometry.computeBoundingBox();

    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.receiveShadow = true;
    
    // --- FIX 2: Disable Culling (Debug Safety) ---
    // If the bounds calculation fails for any reason, this ensures it draws anyway.
    this.mesh.frustumCulled = false;

    // console.log(`[Terrain] Created Chunk ${cx},${cy} at world pos ${cx*CHUNK_SIZE},${cy*CHUNK_SIZE}`);
  }

  getHeight(localX: number, localY: number): number {
    if (localX < 0 || localY < 0 || localX >= CHUNK_SIZE || localY >= CHUNK_SIZE) return 0;
    const base = (localY * CHUNK_SIZE + localX) * 6;
    const arr = this.geometry.attributes.position.array as Float32Array;
    if (!arr || base * 3 + 1 >= arr.length) return 0;
    return arr[base * 3 + 1];
  }

  setVertexHeightFast(localX: number, localY: number, h: number) {
     const pos = this.geometry.attributes.position.array as Float32Array;
     const updateTile = (tx: number, ty: number, cornerIdx: number[]) => {
        if (tx < 0 || ty < 0 || tx >= CHUNK_SIZE || ty >= CHUNK_SIZE) return;
        const base = (ty * CHUNK_SIZE + tx) * 6;
        for (const off of cornerIdx) pos[(base + off) * 3 + 1] = h;
     };

     updateTile(localX - 1, localY - 1, [4]);
     updateTile(localX,     localY - 1, [1, 3]);
     updateTile(localX - 1, localY,     [2, 5]);
     updateTile(localX,     localY,     [0]);
     
     this.geometry.attributes.position.needsUpdate = true;
     this.geometry.computeVertexNormals(); // Recompute lighting
  }

  setTileColor(localX: number, localY: number, col: THREE.Color) {
      if (localX < 0 || localY < 0 || localX >= CHUNK_SIZE || localY >= CHUNK_SIZE) return;
      const base = (localY * CHUNK_SIZE + localX) * 6;
      const arr = this.geometry.attributes.color.array as Float32Array;
      for (let i=0; i<6; i++) {
          arr[(base+i)*3 + 0] = col.r;
          arr[(base+i)*3 + 1] = col.g;
          arr[(base+i)*3 + 2] = col.b;
      }
      this.geometry.attributes.color.needsUpdate = true;
  }

  dispose() { this.geometry.dispose(); }
}

export class TerrainMesh {
  group = new THREE.Group();
  private chunks = new Map<string, ChunkMesh>();
  private matColors = new Map<string, THREE.Color>();
  private defaultColor = new THREE.Color(0x333333);
  
  private heightMap = new Float32Array(WORLD_W * WORLD_H);
  private matMap = new Uint8Array(WORLD_W * WORLD_H);
  private palette: string[] = ["grass"];

  private sharedMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    flatShading: true,
    side: THREE.DoubleSide // --- FIX 3: Ensure we see it even if winding is wrong
  });

  constructor() {
      this.heightMap.fill(0);
      this.matMap.fill(0);
  }

  setMaterials(list: { id: string; color: number }[]) {
    for (const m of list) this.matColors.set(m.id, new THREE.Color(m.color));
    // Refresh visible chunks to apply new colors
    for (const chunk of this.chunks.values()) {
        this.group.remove(chunk.mesh);
        chunk.dispose();
    }
    this.chunks.clear();
  }

  updateView(playerX: number, playerY: number) {
    const cx = Math.floor(playerX / CHUNK_SIZE);
    const cy = Math.floor(playerY / CHUNK_SIZE);
    
    // Radius 5 = 80 tiles.
    const radius = 5;
    
    for (let y = cy - radius; y <= cy + radius; y++) {
      for (let x = cx - radius; x <= cx + radius; x++) {
        this.getChunk(x, y);
      }
    }
    
    this.cull(cx, cy, radius + 2);
  }

  private getChunk(cx: number, cy: number): ChunkMesh {
      const key = `${cx},${cy}`;
      if (!this.chunks.has(key)) {
          const data = this.generateChunkData(cx, cy);
          const chunk = new ChunkMesh(cx, cy, this.sharedMaterial, data);
          this.chunks.set(key, chunk);
          this.group.add(chunk.mesh);
      }
      return this.chunks.get(key)!;
  }

  private generateChunkData(cx: number, cy: number) {
      const width = CHUNK_SIZE;
      const height = CHUNK_SIZE;
      const vertexCount = width * height * 6;
      
      const positions = new Float32Array(vertexCount * 3);
      const colors = new Float32Array(vertexCount * 3);
      
      const worldOffsetX = cx * CHUNK_SIZE;
      const worldOffsetY = cy * CHUNK_SIZE;
      
      let idx = 0;
      for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
              const wx = worldOffsetX + x;
              const wy = worldOffsetY + y;
              
              const hTL = this.getHeightAt(wx, wy);
              const hTR = this.getHeightAt(wx + 1, wy);
              const hBL = this.getHeightAt(wx, wy + 1);
              const hBR = this.getHeightAt(wx + 1, wy + 1);

              const mIdx = this.getMatAt(wx, wy);
              const matId = this.palette[mIdx] || "grass";
              const col = this.matColors.get(matId) || this.defaultColor;

              const pushPos = (h: number, ox: number, oz: number) => {
                  positions[idx * 3 + 0] = wx + ox;
                  positions[idx * 3 + 1] = h;
                  positions[idx * 3 + 2] = wy + oz;
                  
                  colors[idx * 3 + 0] = col.r;
                  colors[idx * 3 + 1] = col.g;
                  colors[idx * 3 + 2] = col.b;
                  idx++;
              };

              // Tri 1: TL -> BL -> TR
              pushPos(hTL, 0, 0);
              pushPos(hBL, 0, 1);
              pushPos(hTR, 1, 0);

              // Tri 2: BL -> BR -> TR
              pushPos(hBL, 0, 1);
              pushPos(hBR, 1, 1);
              pushPos(hTR, 1, 0);
          }
      }
      return { heights: positions, colors };
  }
  
    private getHeightAt(wx: number, wy: number) {
      const ix = Math.floor(wx);
      const iy = Math.floor(wy);
      if (ix < 0 || iy < 0 || ix >= WORLD_W || iy >= WORLD_H) return 0;
      return this.heightMap[iy * WORLD_W + ix] ?? 0;
    }

    private getMatAt(wx: number, wy: number) {
      const ix = Math.floor(wx);
      const iy = Math.floor(wy);
      if (ix < 0 || iy < 0 || ix >= WORLD_W || iy >= WORLD_H) return 0;
      return this.matMap[iy * WORLD_W + ix] ?? 0;
    }


  // --- PUBLIC API ---

  getHeight(worldX: number, worldY: number): number {
    return this.getHeightAt(worldX, worldY);
  }

  setHeight(worldX: number, worldY: number, h: number) {
      if (worldX >= 0 && worldY >= 0 && worldX < WORLD_W && worldY < WORLD_H) {
          this.heightMap[worldY * WORLD_W + worldX] = h;
      }
      
      const updateChunk = (cx: number, cy: number) => {
          const key = `${cx},${cy}`;
          const chunk = this.chunks.get(key);
          if (chunk) {
             const lx = worldX - cx * CHUNK_SIZE;
             const ly = worldY - cy * CHUNK_SIZE;
             chunk.setVertexHeightFast(lx, ly, h);
          }
      }

      const cx = Math.floor(worldX / CHUNK_SIZE);
      const cy = Math.floor(worldY / CHUNK_SIZE);
      
      updateChunk(cx, cy);
      updateChunk(cx-1, cy);
      updateChunk(cx, cy-1);
      updateChunk(cx-1, cy-1);
  }

  setTileMaterial(worldX: number, worldY: number, matId: string) {
      let pIdx = this.palette.indexOf(matId);
      if (pIdx === -1) {
          pIdx = this.palette.length;
          this.palette.push(matId);
      }
      
      if (worldX >= 0 && worldY >= 0 && worldX < WORLD_W && worldY < WORLD_H) {
          this.matMap[worldY * WORLD_W + worldX] = pIdx;
      }

      const cx = Math.floor(worldX / CHUNK_SIZE);
      const cy = Math.floor(worldY / CHUNK_SIZE);
      const lx = worldX % CHUNK_SIZE;
      const ly = worldY % CHUNK_SIZE;
      
      const chunk = this.chunks.get(`${cx},${cy}`);
      const col = this.matColors.get(matId) || this.defaultColor;
      if (chunk) chunk.setTileColor(lx, ly, col);
  }
  
  cull(pcx: number, pcy: number, radius: number) {
      for (const [key, chunk] of this.chunks) {
          const dist = Math.abs(chunk.cx - pcx) + Math.abs(chunk.cy - pcy);
          if (dist > radius) {
              this.group.remove(chunk.mesh);
              chunk.dispose();
              this.chunks.delete(key);
          }
      }
  }

  hydrate(worldW: number, worldH: number, buffer: ArrayBuffer) {
      console.log(`[Terrain] Hydrating Data Layer ${worldW}x${worldH}`);
      
      // Basic Safety Check
      if (buffer.byteLength < 6) return;

      const view = new DataView(buffer);
      let offset = 0;

      const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
      offset += 4;
      if (magic !== "TERR") {
          console.error("[Terrain] Invalid header magic");
          return;
      }
      
      const version = view.getUint8(offset++);
      const paletteCount = view.getUint8(offset++);

      this.palette = [];
      for (let i=0; i<paletteCount; i++) {
          const len = view.getUint8(offset++);
          const decoder = new TextDecoder();
          this.palette.push(decoder.decode(new Uint8Array(buffer, offset, len)));
          offset += len;
      }

      // Safe Read Loop
      try {
        for (let y = 0; y < worldH; y++) {
            for (let x = 0; x < worldW; x++) {
                // Ensure we don't read past buffer
                if (offset + 5 > buffer.byteLength) break;

                const h = view.getFloat32(offset, true);
                const matIdx = view.getUint8(offset + 4);
                offset += 5;
                
                const idx = y * WORLD_W + x;
                if (idx < this.heightMap.length) {
                    this.heightMap[idx] = h;
                    this.matMap[idx] = matIdx;
                }
            }
        }
      } catch (e) {
          console.error("[Terrain] Hydration read error:", e);
      }
      
      // Force refresh
      for (const chunk of this.chunks.values()) {
          this.group.remove(chunk.mesh);
          chunk.dispose();
      }
      this.chunks.clear();
      console.log("[Terrain] Hydration Complete.");
  }
}
