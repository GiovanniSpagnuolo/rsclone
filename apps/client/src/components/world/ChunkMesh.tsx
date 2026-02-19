
import { useMemo } from 'react';
import * as THREE from 'three';

const textureLoader = new THREE.TextureLoader();
textureLoader.setCrossOrigin('anonymous');

const macroNoiseTexture = textureLoader.load('http://localhost:3001/textures/noise.png');
macroNoiseTexture.wrapS = THREE.RepeatWrapping;
macroNoiseTexture.wrapT = THREE.RepeatWrapping;

const materialCache: Record<string, THREE.Material> = {};

const getSharedMaterial = (baseColor: string, textureUrl?: string) => {
  const cacheKey = textureUrl ? textureUrl : baseColor;
  
  if (!materialCache[cacheKey]) {
    const actualColor = textureUrl ? '#ffffff' : baseColor;
    const mat = new THREE.MeshStandardMaterial({ color: actualColor, side: THREE.DoubleSide });

    mat.onBeforeCompile = (shader, renderer) => {
      if (THREE.Material.prototype.onBeforeCompile) {
        THREE.Material.prototype.onBeforeCompile.call(mat, shader, renderer);
      }
      
      shader.uniforms.tNoise = { value: macroNoiseTexture };
      
      shader.vertexShader = `
        varying vec3 vWorldPos;
        ${shader.vertexShader}
      `.replace(
        `#include <worldpos_vertex>`,
        `
        #include <worldpos_vertex>
        vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        `
      );

      shader.fragmentShader = `
        uniform sampler2D tNoise;
        varying vec3 vWorldPos;
        ${shader.fragmentShader}
      `.replace(
        `#include <map_fragment>`,
        `
        #include <map_fragment>
        float noiseVal = texture2D(tNoise, vWorldPos.xz * 0.03).r; 
        diffuseColor.rgb *= (0.55 + noiseVal * 0.55);
        `
      );
    };

    if (textureUrl) {
      textureLoader.load(`http://localhost:3001${textureUrl}?v=dev`, (texture) => {
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        mat.map = texture;
        mat.needsUpdate = true;
      });
    }
    
    materialCache[cacheKey] = mat;
  }
  return materialCache[cacheKey];
};

interface ChunkMeshProps {
  chunkId: string;
  tiles: any[];
  chunks: Record<string, any[]>;
  materials: Record<string, any>;
  onPointerDown: (e: any) => void;
}

export const ChunkMesh = ({ chunkId, tiles, chunks, materials, onPointerDown }: ChunkMeshProps) => {
  const [cx, cz] = chunkId.split('_').map(Number);
  const startX = cx * 8;
  const startZ = cz * 8;

  const getHeight = (gx: number, gz: number) => {
    const tempCx = Math.floor(gx / 8);
    const tempCz = Math.floor(gz / 8);
    const cId = `${tempCx}_${tempCz}`;
    if (!chunks[cId]) return 0;
    return chunks[cId][(gz % 8 * 8) + (gx % 8)].height;
  };

  const { geometry, chunkMaterials } = useMemo(() => {
    const positions: number[] = [];
    const indices: number[] = [];
    const uvs: number[] = [];
    const materialsArray: THREE.Material[] = [];
    const uniqueMats = new Map<string, number>();

    const geometry = new THREE.BufferGeometry();

    tiles.forEach((tile, i) => {
      const lx = i % 8;
      const lz = Math.floor(i / 8);
      const gx = startX + lx;
      const gz = startZ + lz;

      const h00 = tile.height;
      const h10 = getHeight(gx + 1, gz);
      const h01 = getHeight(gx, gz + 1);
      const h11 = getHeight(gx + 1, gz + 1);

      positions.push(
        gx - 0.5, h00, gz - 0.5,
        gx + 0.5, h10, gz - 0.5,
        gx - 0.5, h01, gz + 0.5,
        gx + 0.5, h11, gz + 0.5
      );

      uvs.push(0, 1, 1, 1, 0, 0, 1, 0);

      const offset = i * 4;
      indices.push(
        offset, offset + 2, offset + 1,
        offset + 2, offset + 3, offset + 1
      );

      const matDef = materials[tile.textureId] || materials[1];
      const color = matDef?.color || '#FF00FF';
      const textureUrl = matDef?.textureUrl;
      const cacheKey = textureUrl ? textureUrl : color;

      let matIndex = uniqueMats.get(cacheKey);
      if (matIndex === undefined) {
        matIndex = materialsArray.length;
        uniqueMats.set(cacheKey, matIndex);
        materialsArray.push(getSharedMaterial(color, textureUrl));
      }

      geometry.addGroup(i * 6, 6, matIndex);
    });

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    return { geometry, chunkMaterials: materialsArray };
  }, [tiles, chunks, materials, startX, startZ]);

  return (
    <mesh
      geometry={geometry}
      material={chunkMaterials}
      onPointerDown={onPointerDown}
      receiveShadow
    />
  );
};
