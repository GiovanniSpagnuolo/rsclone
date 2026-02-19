import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const WATER_VERTEX_SHADER = `
  varying vec3 vWorldPos;
  void main() {
    // Calculate global position for the fragment shader to use
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const WATER_FRAGMENT_SHADER = `
  uniform float uTime;
  uniform vec3 uColorShallow;
  uniform vec3 uColorDeep;
  
  varying vec3 vWorldPos;

  // Simple pseudo-random noise
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }

  // smooth value noise
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }

  void main() {
    // 1. Create large, slow rolling waves
    float largeWave = noise(vWorldPos.xz * 0.05 + uTime * 0.2);

    // 2. Create small, fast ripples moving in a different direction
    float smallRipple = noise(vWorldPos.xz * 0.15 - uTime * 0.5);

    // Combine them
    float combined = (largeWave * 0.6 + smallRipple * 0.4);

    // Mix colors based on the wave height for depth illusion
    vec3 finalColor = mix(uColorDeep, uColorShallow, combined);

    // Add a "highlight" threshold for fake specular sparkles
    float sparkle = step(0.9, combined) * 0.5;
    
    // Output: Color + Transparency (0.8 alpha so we can see the sand below)
    gl_FragColor = vec4(finalColor + sparkle, 0.85);
  }
`;

interface WaterPlaneProps {
  centerPosition: [number, number, number];
}

export const WaterPlane = ({ centerPosition }: WaterPlaneProps) => {
  const meshRef = useRef<THREE.Mesh>(null);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uColorShallow: { value: new THREE.Color('#5dade2') },
    uColorDeep: { value: new THREE.Color('#1f618d') }
  }), []);

  // We only need useFrame for the time/wave animation now!
  useFrame(({ clock }) => {
    uniforms.uTime.value = clock.getElapsedTime();
  });

  return (
    <mesh
      ref={meshRef}
      rotation={[-Math.PI / 2, 0, 0]}
      // Lock exactly to the chunk center passed from GameWorld
      position={[centerPosition[0], -0.2, centerPosition[2]]}
      raycast={() => null}
    >
      <planeGeometry args={[104, 104]} />
      <shaderMaterial
        vertexShader={WATER_VERTEX_SHADER}
        fragmentShader={WATER_FRAGMENT_SHADER}
        uniforms={uniforms}
        transparent={true}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
};
