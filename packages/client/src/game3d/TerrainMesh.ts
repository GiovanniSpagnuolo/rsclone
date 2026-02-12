//
//  TerrainMesh.swift
//  
//
//  Created by Giovanni Spagnuolo on 2/12/26.
//


import * as THREE from "three";
import { WORLD_W, WORLD_H } from "@rsclone/shared/world";

export class TerrainMesh {
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
  
  // Helpers to map coordinates to buffer indices
  // We have WORLD_W * WORLD_H tiles
  // Each tile has 2 triangles = 6 vertices
  private readonly width = WORLD_W;
  private readonly height = WORLD_H;

  // Cache materials { "grass": 0x00ff00 }
  private matColors = new Map<string, THREE.Color>();
  private defaultColor = new THREE.Color(0x333333);

  constructor() {
    this.geometry = new THREE.BufferGeometry();
    
    // 1. Build the buffers
    const vertexCount = this.width * this.height * 6;
    const positions = new Float32Array(vertexCount * 3);
    const colors = new Float32Array(vertexCount * 3);
    const normals = new Float32Array(vertexCount * 3);

    // 2. Generate flat grid
    let idx = 0;
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        // Quad for tile (x, y) composed of 2 triangles
        // TL, BL, TR,  BL, BR, TR
        // Coordinates:
        // x,y --- x+1,y
        //  |        |
        // x,y+1 -- x+1,y+1
        // Note: In 3D, 'y' usually maps to 'z'. Let's stick to x,z plane.
        
        const x0 = x, z0 = y;
        const x1 = x + 1, z1 = y + 1;

        // Triangle 1: TL -> BL -> TR
        this.pushVertex(positions, idx + 0, x0, 0, z0); // TL
        this.pushVertex(positions, idx + 1, x0, 0, z1); // BL
        this.pushVertex(positions, idx + 2, x1, 0, z0); // TR

        // Triangle 2: BL -> BR -> TR
        this.pushVertex(positions, idx + 3, x0, 0, z1); // BL
        this.pushVertex(positions, idx + 4, x1, 0, z1); // BR
        this.pushVertex(positions, idx + 5, x1, 0, z0); // TR

        // Initialize colors to dark grey
        for (let i = 0; i < 6; i++) {
          colors[(idx + i) * 3 + 0] = 0.2;
          colors[(idx + i) * 3 + 1] = 0.2;
          colors[(idx + i) * 3 + 2] = 0.2;
        }
        
        // Default Up Normals
        for (let i = 0; i < 6; i++) {
          normals[(idx + i) * 3 + 1] = 1;
        }

        idx += 6;
      }
    }

    this.geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    this.geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.9,
      flatShading: true // Makes it look low-poly/crisp
    });

    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false; // Self-shadowing terrain can be expensive/ugly without tweaking
  }

  private pushVertex(arr: Float32Array, i: number, x: number, y: number, z: number) {
    arr[i * 3 + 0] = x;
    arr[i * 3 + 1] = y;
    arr[i * 3 + 2] = z;
  }

  setMaterials(list: { id: string; color: number }[]) {
    for (const m of list) {
      this.matColors.set(m.id, new THREE.Color(m.color));
    }
  }

  /**
   * Update the Y value of a specific grid intersection.
   * This affects the 4 tiles touching this corner.
   */
  setHeight(vx: number, vy: number, h: number) {
    // We need to find every vertex in the buffer that corresponds to (vx, vy)
    // A vertex (vx, vy) is shared by:
    // Tile (vx-1, vy-1): Bottom-Right vertex
    // Tile (vx,   vy-1): Bottom-Left vertex
    // Tile (vx-1, vy)  : Top-Right vertex
    // Tile (vx,   vy)  : Top-Left vertex

    this.updateVertexHeight(vx - 1, vy - 1, "BR", h);
    this.updateVertexHeight(vx,     vy - 1, "BL", h);
    this.updateVertexHeight(vx - 1, vy,     "TR", h);
    this.updateVertexHeight(vx,     vy,     "TL", h);
    
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.computeVertexNormals();
  }

  private updateVertexHeight(tileX: number, tileY: number, corner: string, h: number) {
    if (tileX < 0 || tileY < 0 || tileX >= this.width || tileY >= this.height) return;
    
    // Base index for this tile (6 verts per tile)
    const baseIdx = (tileY * this.width + tileX) * 6;
    const pos = this.geometry.attributes.position.array as Float32Array;

    // Indices for our 6 vertices:
    // 0: TL, 1: BL, 2: TR
    // 3: BL, 4: BR, 5: TR

    const setY = (offset: number) => {
      pos[(baseIdx + offset) * 3 + 1] = h;
    };

    if (corner === "TL") { setY(0); }
    if (corner === "BL") { setY(1); setY(3); }
    if (corner === "TR") { setY(2); setY(5); }
    if (corner === "BR") { setY(4); }
  }

  setTileMaterial(tileX: number, tileY: number, matId: string) {
    if (tileX < 0 || tileY < 0 || tileX >= this.width || tileY >= this.height) return;
    
    const col = this.matColors.get(matId) || this.defaultColor;
    const colors = this.geometry.attributes.color.array as Float32Array;
    const baseIdx = (tileY * this.width + tileX) * 6;

    for (let i = 0; i < 6; i++) {
      colors[(baseIdx + i) * 3 + 0] = col.r;
      colors[(baseIdx + i) * 3 + 1] = col.g;
      colors[(baseIdx + i) * 3 + 2] = col.b;
    }
    this.geometry.attributes.color.needsUpdate = true;
  }
}