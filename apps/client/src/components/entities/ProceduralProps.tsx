//
//  ProceduralProps.tsx
//  
//
//  Created by Giovanni Spagnuolo on 2/17/26.
//


import { useMemo } from 'react';
import * as THREE from 'three';

// Simple deterministic pseudo-random number generator based on coordinates
const getSeededRandom = (x: number, z: number, offset: number = 0) => {
  const seed = x * 12.9898 + z * 78.233 + offset;
  return Math.abs((Math.sin(seed) * 43758.5453) % 1);
};

interface PropProps {
  x: number;
  z: number;
}

export const PineTree = ({ x, z }: PropProps) => {
  const { trunkGeo, leavesGeo } = useMemo(() => {
    // Height variation based on position
    const heightScale = 0.8 + getSeededRandom(x, z) * 0.6; 
    
    const trunk = new THREE.CylinderGeometry(0.2, 0.3, 1 * heightScale, 5);
    trunk.translate(0, (1 * heightScale) / 2, 0);

    // N64 trees were often just 2 or 3 stacked cones
    const leaves = new THREE.BufferGeometry();
    const leafMats = [
      new THREE.ConeGeometry(1.2, 2 * heightScale, 5).translate(0, 1.5 * heightScale, 0),
      new THREE.ConeGeometry(1.0, 1.5 * heightScale, 5).translate(0, 2.2 * heightScale, 0),
      new THREE.ConeGeometry(0.8, 1.2 * heightScale, 5).translate(0, 2.8 * heightScale, 0)
    ];

    // Merge the cones into a single geometry for performance
    const mergedLeaves = THREE.BufferGeometryUtils ? 
      THREE.BufferGeometryUtils.mergeBufferGeometries(leafMats) : leafMats[0]; 
      // Note: If you don't have BufferGeometryUtils imported, we can just use grouped meshes, 
      // but standard Three.js handles stacked meshes fine for now.

    return { trunkGeo: trunk, leavesGeo: leaves };
  }, [x, z]);

  return (
    <group>
      <mesh geometry={trunkGeo} castShadow receiveShadow>
        <meshStandardMaterial color="#4A3B22" flatShading={true} />
      </mesh>
      {/* 3 Stacked Cones for the Pine Needles */}
      <mesh position={[0, 1.5, 0]} castShadow receiveShadow>
        <coneGeometry args={[1.2, 2, 5]} />
        <meshStandardMaterial color="#1f3d1b" flatShading={true} />
      </mesh>
      <mesh position={[0, 2.2, 0]} castShadow receiveShadow>
        <coneGeometry args={[1.0, 1.5, 5]} />
        <meshStandardMaterial color="#264d21" flatShading={true} />
      </mesh>
      <mesh position={[0, 2.8, 0]} castShadow receiveShadow>
        <coneGeometry args={[0.8, 1.2, 5]} />
        <meshStandardMaterial color="#2d5a27" flatShading={true} />
      </mesh>
    </group>
  );
};

export const Rock = ({ x, z }: PropProps) => {
  const geometry = useMemo(() => {
    // 0 detail Dodecahedron gives a great chunky N64 boulder look
    const geo = new THREE.DodecahedronGeometry(0.6, 0);
    const positions = geo.attributes.position.array;

    // Displace each vertex slightly to make it asymmetrical
    for (let i = 0; i < positions.length; i += 3) {
      positions[i] += (getSeededRandom(x, z, i) - 0.5) * 0.3;
      positions[i+1] += (getSeededRandom(x, z, i+1) - 0.5) * 0.3;
      positions[i+2] += (getSeededRandom(x, z, i+2) - 0.5) * 0.3;
    }
    
    geo.computeVertexNormals();
    return geo;
  }, [x, z]);

  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color="#6b6b6b" flatShading={true} />
    </mesh>
  );
};

export const DeadTree = ({ x, z }: PropProps) => {
  const { trunk, branch1, branch2 } = useMemo(() => {
    const scale = 0.8 + getSeededRandom(x, z) * 0.5;
    const t = new THREE.CylinderGeometry(0.15, 0.25, 2 * scale, 5);
    t.translate(0, scale, 0);

    const b1 = new THREE.CylinderGeometry(0.05, 0.1, 1 * scale, 4);
    b1.rotateZ(Math.PI / 4);
    b1.translate(0.5, 1.2 * scale, 0);

    const b2 = new THREE.CylinderGeometry(0.05, 0.1, 0.8 * scale, 4);
    b2.rotateZ(-Math.PI / 3);
    b2.rotateY(Math.PI / 2);
    b2.translate(-0.3, 0.8 * scale, 0.3);

    return { trunk: t, branch1: b1, branch2: b2 };
  }, [x, z]);

  return (
    <group>
      <mesh geometry={trunk} castShadow receiveShadow>
        <meshStandardMaterial color="#2d2d2d" flatShading={true} />
      </mesh>
      <mesh geometry={branch1} castShadow receiveShadow>
        <meshStandardMaterial color="#2d2d2d" flatShading={true} />
      </mesh>
      <mesh geometry={branch2} castShadow receiveShadow>
        <meshStandardMaterial color="#2d2d2d" flatShading={true} />
      </mesh>
    </group>
  );
};

export const Bush = ({ x, z }: PropProps) => {
  const geometry = useMemo(() => {
    const scale = 0.5 + getSeededRandom(x, z) * 0.3;
    const geo = new THREE.DodecahedronGeometry(scale, 0);
    geo.translate(0, scale / 2, 0);
    
    const positions = geo.attributes.position.array;
    for (let i = 0; i < positions.length; i += 3) {
      positions[i] += (getSeededRandom(x, z, i) - 0.5) * 0.2;
      positions[i+1] += (getSeededRandom(x, z, i+1) - 0.5) * 0.2;
    }
    geo.computeVertexNormals();
    return geo;
  }, [x, z]);

  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color="#3a5f2b" flatShading={true} />
    </mesh>
  );
};

export const TreeStump = ({ x, z }: PropProps) => {
  const geometry = useMemo(() => {
    const geo = new THREE.CylinderGeometry(0.25, 0.35, 0.4, 6);
    geo.translate(0, 0.2, 0);
    // Tilt the stump slightly for an organic cut look
    geo.rotateZ((getSeededRandom(x, z) - 0.5) * 0.2);
    geo.rotateX((getSeededRandom(x, z, 1) - 0.5) * 0.2);
    return geo;
  }, [x, z]);

  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color="#5c4033" flatShading={true} />
    </mesh>
  );
};
