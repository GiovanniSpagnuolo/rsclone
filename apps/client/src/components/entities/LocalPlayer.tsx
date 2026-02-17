import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getExactHeight } from '../../utils/terrainMath';

export const visualPlayerPos = new THREE.Vector3();

interface LocalPlayerProps {
  position: [number, number, number];
  chunks: Record<string, any[]>;
}

export const LocalPlayer = ({ position, chunks }: LocalPlayerProps) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const targetPos = useRef(new THREE.Vector3(position[0], 0, position[2]));
  const currentPos = useRef(new THREE.Vector3(position[0], 0, position[2]));

  useEffect(() => {
    const newPos = new THREE.Vector3(position[0], 0, position[2]);
    const dist = targetPos.current.distanceTo(newPos);
    
    // THE FIX: If the target is far away (like on login or teleport), snap instantly.
    if (dist > 10) {
      currentPos.current.copy(newPos);
    }
    
    targetPos.current.copy(newPos);
  }, [position]);

  useFrame((_, delta) => {
    if (!meshRef.current) return;

    const speed = 1.7; 
    
    const dx = targetPos.current.x - currentPos.current.x;
    const dz = targetPos.current.z - currentPos.current.z;
    const distance = Math.sqrt(dx * dx + dz * dz);

    if (distance > 0.01) {
      const moveDist = Math.min(speed * delta, distance);
      const ratio = moveDist / distance;
      currentPos.current.x += dx * ratio;
      currentPos.current.z += dz * ratio;
    } else {
      currentPos.current.x = targetPos.current.x;
      currentPos.current.z = targetPos.current.z;
    }

    const y = getExactHeight(currentPos.current.x, currentPos.current.z, chunks);
    
    meshRef.current.position.set(currentPos.current.x, y + 0.5, currentPos.current.z);
    visualPlayerPos.copy(meshRef.current.position);
  });

  return (
    <mesh ref={meshRef} castShadow>
      <boxGeometry args={[0.8, 1, 0.8]} />
      <meshStandardMaterial color="#ff0000" />
    </mesh>
  );
};