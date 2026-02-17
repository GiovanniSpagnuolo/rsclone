import { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface TileProps {
  x: number;
  z: number;
  heights: [number, number, number, number];
  color: string;
  onPointerDown: (e: any) => void;
  onPointerEnter: (e: any) => void;
}

export const Tile = ({ x, z, heights, color, onPointerDown, onPointerEnter }: TileProps) => {
  const geoRef = useRef<THREE.BufferGeometry>(null);

  useEffect(() => {
    if (geoRef.current) {
      const positions = geoRef.current.attributes.position.array as Float32Array;
      positions[1] = heights[0];
      positions[4] = heights[1];
      positions[7] = heights[2];
      positions[10] = heights[3];
      
      geoRef.current.attributes.position.needsUpdate = true;
      geoRef.current.computeVertexNormals();
    }
  }, [heights]);

  return (
    <mesh 
      position={[x, 0, z]} 
      onPointerDown={onPointerDown} 
      onPointerEnter={onPointerEnter}
      receiveShadow
    >
      <bufferGeometry ref={geoRef}>
        <bufferAttribute
          attach="attributes-position"
          count={4}
          array={new Float32Array([
            -0.5, heights[0], -0.5,
             0.5, heights[1], -0.5,
            -0.5, heights[2],  0.5,
             0.5, heights[3],  0.5,
          ])}
          itemSize={3}
        />
        <bufferAttribute
          attach="index"
          count={6}
          array={new Uint16Array([0, 2, 1, 2, 3, 1])}
          itemSize={1}
        />
      </bufferGeometry>
      <meshStandardMaterial color={color} side={THREE.DoubleSide} />
    </mesh>
  );
};