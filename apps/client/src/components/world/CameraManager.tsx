import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface CameraManagerProps {
  targetPosition: [number, number, number];
  isFlyMode?: boolean;
  isLocked?: boolean;
}

export const CameraManager = ({ targetPosition, isFlyMode, isLocked }: CameraManagerProps) => {
  const angleRef = useRef(Math.PI / 4);
  const pitchRef = useRef(Math.PI / 4);
  const distanceRef = useRef(15);
  const keys = useRef<{ [key: string]: boolean }>({});

  // Fallback target for Editor Mode panning
  const fallbackTarget = useRef(new THREE.Vector3(...targetPosition));

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { keys.current[e.key] = true; };
    const handleKeyUp = (e: KeyboardEvent) => { keys.current[e.key] = false; };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  useFrame(({ scene, camera }) => {
    if (isLocked) return;

    if (keys.current['ArrowLeft']) angleRef.current += 0.05;
    if (keys.current['ArrowRight']) angleRef.current -= 0.05;
    if (keys.current['ArrowUp']) pitchRef.current = Math.max(0.1, pitchRef.current - 0.05);
    if (keys.current['ArrowDown']) pitchRef.current = Math.min(Math.PI / 2.5, pitchRef.current + 0.05);

    let focusPoint = new THREE.Vector3();

    // 1. Find the continuously interpolating player mesh
    const playerMesh = scene.getObjectByName('localPlayer');
    
    if (playerMesh && !isFlyMode) {
      // PLAY MODE: Read the exact visual coordinates frame-by-frame
      playerMesh.getWorldPosition(focusPoint);
    } else {
      // EDITOR MODE: Smoothly pan to the selected chunk
      fallbackTarget.current.lerp(new THREE.Vector3(...targetPosition), 0.1);
      focusPoint.copy(fallbackTarget.current);
    }

    const offsetX = Math.cos(angleRef.current) * distanceRef.current;
    const offsetZ = Math.sin(angleRef.current) * distanceRef.current;
    const offsetY = Math.cos(pitchRef.current) * distanceRef.current;

    // 2. HARD SET the camera position to maintain a perfect orbit (No elastic rubber-banding!)
    camera.position.set(
      focusPoint.x + offsetX,
      focusPoint.y + offsetY,
      focusPoint.z + offsetZ
    );
    
    camera.lookAt(focusPoint);
  });

  return null;
};
