import { useMemo } from 'react';
import * as THREE from 'three';

interface DumbChunkProps {
  chunkId: string;
  tiles: any[];
  chunks: Record<string, any[]>;
  isDimmed: boolean;
  onPointerDown?: (e: any) => void; // Added this
}

export const DumbChunk = ({ chunkId, tiles, chunks, isDimmed, onPointerDown }: DumbChunkProps) => {
  const [cx, cy] = chunkId.split('_').map(Number);

  const geometry = useMemo(() => {
    // ... (Keep the exact same geometry logic you already have here)
    const geo = new THREE.BufferGeometry();
    const vertices: number[] = [];
    const indices: number[] = [];
    const colors: number[] = [];

    const colorGrass = new THREE.Color("#2d5a27");
    const colorWater = new THREE.Color("#1E90FF");
    const dimFactor = isDimmed ? 0.3 : 1.0;

    const getHeight = (gx: number, gz: number) => {
      const tempCx = Math.floor(gx / 8);
      const tempCz = Math.floor(gz / 8);
      const cId = `${tempCx}_${tempCz}`;
      if (!chunks[cId]) return 0;
      return chunks[cId][(gz % 8 * 8) + (gx % 8)].height;
    };

    let offset = 0;

    tiles.forEach((tile, index) => {
      const lx = index % 8;
      const lz = Math.floor(index / 8);
      const x = (cx * 8) + lx;
      const z = (cy * 8) + lz;

      vertices.push(
        x - 0.5, tile.height, z - 0.5,
        x + 0.5, getHeight(x + 1, z), z - 0.5,
        x - 0.5, getHeight(x, z + 1), z + 0.5,
        x + 0.5, getHeight(x + 1, z + 1), z + 0.5
      );

      const c = tile.textureId === 2 ? colorWater : colorGrass;
      colors.push(
        c.r * dimFactor, c.g * dimFactor, c.b * dimFactor,
        c.r * dimFactor, c.g * dimFactor, c.b * dimFactor,
        c.r * dimFactor, c.g * dimFactor, c.b * dimFactor,
        c.r * dimFactor, c.g * dimFactor, c.b * dimFactor
      );

      indices.push(
        offset + 0, offset + 2, offset + 1,
        offset + 1, offset + 2, offset + 3
      );
      offset += 4;
    });

    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    return geo;
  }, [chunkId, tiles, chunks, isDimmed]);

  return (
    <mesh receiveShadow onPointerDown={onPointerDown}>
      <bufferGeometry attach="geometry" {...geometry} />
      <meshStandardMaterial vertexColors side={THREE.DoubleSide} />
    </mesh>
  );
};