//
//  UniversalInstancer.tsx
//
//
//  Created by Giovanni Spagnuolo on 2/17/26.
//


import { useRef, useMemo, useEffect } from 'react';
import * as THREE from 'three';

// 1. Procedural Geometries (Created ONCE in memory)
const geoPineTrunk = new THREE.CylinderGeometry(0.2, 0.3, 1, 5).translate(0, 0.5, 0);
const geoPineLeaf1 = new THREE.ConeGeometry(1.2, 2, 5).translate(0, 1.5, 0);
const geoPineLeaf2 = new THREE.ConeGeometry(1.0, 1.5, 5).translate(0, 2.2, 0);
const geoPineLeaf3 = new THREE.ConeGeometry(0.8, 1.2, 5).translate(0, 2.8, 0);

const geoDeadTrunk = new THREE.CylinderGeometry(0.15, 0.25, 2, 5).translate(0, 1, 0);
const geoBush = new THREE.DodecahedronGeometry(0.6, 0).translate(0, 0.4, 0);
const geoStump = new THREE.CylinderGeometry(0.25, 0.35, 0.4, 6).translate(0, 0.2, 0);

const geoRock = new THREE.DodecahedronGeometry(0.6, 0);
const rPos = geoRock.attributes.position.array;
for(let i = 0; i < rPos.length; i += 3) {
  rPos[i] += (Math.random() - 0.5) * 0.3;
  rPos[i+1] += (Math.random() - 0.5) * 0.3;
  rPos[i+2] += (Math.random() - 0.5) * 0.3;
}
geoRock.translate(0, 0.4, 0);
geoRock.computeVertexNormals();

// 2. Procedural Materials
const matWood = new THREE.MeshStandardMaterial({ color: '#4A3B22', flatShading: true });
const matPine = new THREE.MeshStandardMaterial({ color: '#264d21', flatShading: true });
const matRock = new THREE.MeshStandardMaterial({ color: '#6b6b6b', flatShading: true });
const matDead = new THREE.MeshStandardMaterial({ color: '#2d2d2d', flatShading: true });
const matBush = new THREE.MeshStandardMaterial({ color: '#3a5f2b', flatShading: true });

const getSeededRandom = (x: number, z: number) => {
  const seed = x * 12.9898 + z * 78.233;
  return Math.abs((Math.sin(seed) * 43758.5453) % 1);
};

interface UniversalInstancerProps {
  spawns: any[];
  objects: Record<string, any>;
  getHeight: (x: number, z: number) => number;
  onObjectClick?: (e: any, spawn: any, def: any) => void; // <--- ADD THIS
}

export const UniversalInstancer = ({ spawns, objects, getHeight, onObjectClick }: UniversalInstancerProps) => {
  
  // Route spawns to their correct procedural buckets based on the Dictionary definition
  const proceduralSpawns = useMemo(() => {
    const buckets = { pines: [] as any[], rocks: [] as any[], dead: [] as any[], bushes: [] as any[], stumps: [] as any[] };
    
    spawns.forEach(spawn => {
      const def = objects[spawn.objectDefId];
      if (!def) return;

      switch (def.proceduralType) {
        case 'PINE_TREE': buckets.pines.push(spawn); break;
        case 'ROCK': buckets.rocks.push(spawn); break;
        case 'DEAD_TREE': buckets.dead.push(spawn); break;
        case 'BUSH': buckets.bushes.push(spawn); break;
        case 'STUMP': buckets.stumps.push(spawn); break;
      }
    });
    return buckets;
  }, [spawns, objects]);

  // Route GLTF models to their own bucket, grouped by modelId
  const gltfSpawns = useMemo(() => {
    const groups: Record<number, any[]> = {};
    spawns.forEach(spawn => {
      const def = objects[spawn.objectDefId];
      if (def && def.modelId && !def.proceduralType) {
        if (!groups[def.modelId]) groups[def.modelId] = [];
        groups[def.modelId].push(spawn);
      }
    });
    return groups;
  }, [spawns, objects]);

  const refs = {
    pineTrunk: useRef<THREE.InstancedMesh>(null), pineL1: useRef<THREE.InstancedMesh>(null),
    pineL2: useRef<THREE.InstancedMesh>(null), pineL3: useRef<THREE.InstancedMesh>(null),
    rock: useRef<THREE.InstancedMesh>(null), dead: useRef<THREE.InstancedMesh>(null),
    bush: useRef<THREE.InstancedMesh>(null), stump: useRef<THREE.InstancedMesh>(null),
  };

  useEffect(() => {
    const dummy = new THREE.Object3D();

      const updateMeshes = (items: any[], meshRefs: React.RefObject<THREE.InstancedMesh>[]) => {
            items.forEach((item, i) => {
              const h = getHeight(item.x, item.y);
              const scale = 0.8 + getSeededRandom(item.x, item.y) * 0.5;

              dummy.position.set(item.x, h, item.y);
              dummy.rotation.set(0, item.rotation * (Math.PI / 180), 0);
              
              if (objects[item.objectDefId]?.proceduralType === 'ROCK' || objects[item.objectDefId]?.proceduralType === 'BUSH') {
                dummy.scale.set(scale, scale * 0.8, scale * 1.2);
              } else {
                dummy.scale.set(scale, scale, scale);
              }

              dummy.updateMatrix();

              meshRefs.forEach(ref => {
                if (ref.current) ref.current.setMatrixAt(i, dummy.matrix);
              });
            });

            meshRefs.forEach(ref => {
              if (ref.current) {
                ref.current.instanceMatrix.needsUpdate = true;
                // Override the default bounding sphere to encompass the entire map
                ref.current.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 999999);
              }
            });
          };


    updateMeshes(proceduralSpawns.pines, [refs.pineTrunk, refs.pineL1, refs.pineL2, refs.pineL3]);
    updateMeshes(proceduralSpawns.rocks, [refs.rock]);
    updateMeshes(proceduralSpawns.dead, [refs.dead]);
    updateMeshes(proceduralSpawns.bushes, [refs.bush]);
    updateMeshes(proceduralSpawns.stumps, [refs.stump]);

  }, [proceduralSpawns, getHeight, objects]);
    
    const handleMeshClick = (e: any, bucket: any[]) => {
        e.stopPropagation();
        
        if (e.button !== 0 && e.button !== 2) return;

        if (!onObjectClick) {
          console.warn("[DEBUG 1 - Instancer] ❌ onObjectClick prop is missing!");
          return;
        }
        
        const instanceId = e.instanceId;
        if (instanceId !== undefined && bucket[instanceId]) {
          const spawn = bucket[instanceId];
          const def = objects[spawn.objectDefId];
          onObjectClick(e, spawn, def);
        }
      };

            return (
                <group>
                  {proceduralSpawns.pines.length > 0 && (
                    <group>
                      <instancedMesh frustumCulled={false} key={`pT_${proceduralSpawns.pines.length}`} onPointerDown={(e) => handleMeshClick(e, proceduralSpawns.pines)} ref={refs.pineTrunk} args={[geoPineTrunk, matWood, proceduralSpawns.pines.length]} />
                      <instancedMesh frustumCulled={false} key={`pL1_${proceduralSpawns.pines.length}`} onPointerDown={(e) => handleMeshClick(e, proceduralSpawns.pines)} ref={refs.pineL1} args={[geoPineLeaf1, matPine, proceduralSpawns.pines.length]} />
                      <instancedMesh frustumCulled={false} key={`pL2_${proceduralSpawns.pines.length}`} onPointerDown={(e) => handleMeshClick(e, proceduralSpawns.pines)} ref={refs.pineL2} args={[geoPineLeaf2, matPine, proceduralSpawns.pines.length]} />
                      <instancedMesh frustumCulled={false} key={`pL3_${proceduralSpawns.pines.length}`} onPointerDown={(e) => handleMeshClick(e, proceduralSpawns.pines)} ref={refs.pineL3} args={[geoPineLeaf3, matPine, proceduralSpawns.pines.length]} />
                    </group>
                  )}
                  
                  {proceduralSpawns.rocks.length > 0 && <instancedMesh frustumCulled={false} key={`r_${proceduralSpawns.rocks.length}`} onPointerDown={(e) => handleMeshClick(e, proceduralSpawns.rocks)} ref={refs.rock} args={[geoRock, matRock, proceduralSpawns.rocks.length]} />}
                  {proceduralSpawns.dead.length > 0 && <instancedMesh frustumCulled={false} key={`d_${proceduralSpawns.dead.length}`} onPointerDown={(e) => handleMeshClick(e, proceduralSpawns.dead)} ref={refs.dead} args={[geoDeadTrunk, matDead, proceduralSpawns.dead.length]} />}
                  {proceduralSpawns.bushes.length > 0 && <instancedMesh frustumCulled={false} key={`b_${proceduralSpawns.bushes.length}`} onPointerDown={(e) => handleMeshClick(e, proceduralSpawns.bushes)} ref={refs.bush} args={[geoBush, matBush, proceduralSpawns.bushes.length]} />}
                  {proceduralSpawns.stumps.length > 0 && <instancedMesh frustumCulled={false} key={`s_${proceduralSpawns.stumps.length}`} onPointerDown={(e) => handleMeshClick(e, proceduralSpawns.stumps)} ref={refs.stump} args={[geoStump, matWood, proceduralSpawns.stumps.length]} />}
                    
                  {Object.entries(gltfSpawns).map(([modelId, groupSpawns]) => (
                    <GLTFInstancer key={`gltf_${modelId}`} modelId={Number(modelId)} spawns={groupSpawns} getHeight={getHeight} />
                  ))}
                </group>
              );
};

// --- GLTF INSTANCER PLACEHOLDER ---
const GLTFInstancer = ({ modelId, spawns, getHeight }: { modelId: number, spawns: any[], getHeight: any }) => {
  // In the future, you will use @react-three/drei's useGLTF hook here:
  // const { nodes, materials } = useGLTF(`http://localhost:3001/models/${modelId}.gltf`)
  return null;
};
