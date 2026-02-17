import { useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { visualPlayerPos } from '../entities/LocalPlayer';

interface CameraManagerProps {
  targetPosition: [number, number, number];
  isFlyMode: boolean;
  isLocked: boolean;
}

export const CameraManager = ({ targetPosition, isFlyMode, isLocked }: CameraManagerProps) => {
  const controlsRef = useRef<any>(null);
  const prevTarget = useRef(new THREE.Vector3());

  // Resync the camera when exiting Editor Mode to prevent a wild jump
  useEffect(() => {
    if (!isFlyMode && controlsRef.current) {
      prevTarget.current.copy(visualPlayerPos);
      
      // Default offset behind and above the player
      const offset = new THREE.Vector3(0, 10, 15);
      controlsRef.current.object.position.copy(visualPlayerPos).add(offset);
      controlsRef.current.target.copy(visualPlayerPos);
      controlsRef.current.update();
    }
  }, [isFlyMode]);

  useFrame(() => {
    if (controlsRef.current && !isFlyMode) {
      // Calculate how far the player moved this exact frame
      const deltaTarget = new THREE.Vector3().subVectors(visualPlayerPos, prevTarget.current);
      
      // THE FIX: Shift the camera's physical position by that exact same distance
      controlsRef.current.object.position.add(deltaTarget);
      
      // Lock the focus target to the player
      controlsRef.current.target.copy(visualPlayerPos);
      controlsRef.current.update();
      
      // Save this position for the next frame's math
      prevTarget.current.copy(visualPlayerPos);
    }
  });

  return (
    <OrbitControls 
      ref={controlsRef}
      enabled={!isLocked}
      maxPolarAngle={Math.PI / 2.1} // Prevent going below ground
      minDistance={2} 
      maxDistance={50} 
    />
  );
};