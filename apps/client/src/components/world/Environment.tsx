import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

const squareFogUniforms = {
  uFogCenter: { value: new THREE.Vector3(0, 0, 0) },
  uFogRadius: { value: 52.0 },
  uFogFade: { value: 4.0 },
  uFogColorGround: { value: new THREE.Color('#2d5a27') },
  uFogColorSky: { value: new THREE.Color('#87CEEB') },
  uFogGradientStart: { value: -2.0 },
  uFogGradientEnd: { value: 5.0 }
};

THREE.ShaderChunk.fog_pars_vertex = `
#ifdef USE_FOG
  varying vec3 vWorldPositionFog;
#endif
`;

THREE.ShaderChunk.fog_vertex = `
#ifdef USE_FOG
  vWorldPositionFog = worldPosition.xyz;
#endif
`;

THREE.ShaderChunk.fog_pars_fragment = `
#ifdef USE_FOG
  varying vec3 vWorldPositionFog;
  uniform vec3 uFogCenter;
  uniform float uFogRadius;
  uniform float uFogFade;
  uniform vec3 uFogColorGround;
  uniform vec3 uFogColorSky;
  uniform float uFogGradientStart;
  uniform float uFogGradientEnd;
#endif
`;

THREE.ShaderChunk.fog_fragment = `
#ifdef USE_FOG
  vec2 diff = abs(vWorldPositionFog.xz - uFogCenter.xz);
  float dist = max(diff.x, diff.y);
  float fogFactor = smoothstep(uFogRadius - uFogFade, uFogRadius, dist);

  float heightFactor = smoothstep(uFogGradientStart, uFogGradientEnd, vWorldPositionFog.y);
  vec3 currentFogColor = mix(uFogColorGround, uFogColorSky, heightFactor);

  gl_FragColor.rgb = mix(gl_FragColor.rgb, currentFogColor, clamp(fogFactor, 0.0, 1.0));
#endif
`;

if (!(THREE.Material.prototype as any)._fogPatched) {
  const originalCompile = THREE.Material.prototype.onBeforeCompile;
  THREE.Material.prototype.onBeforeCompile = function (shader, renderer) {
    shader.uniforms.uFogCenter = squareFogUniforms.uFogCenter;
    shader.uniforms.uFogRadius = squareFogUniforms.uFogRadius;
    shader.uniforms.uFogFade = squareFogUniforms.uFogFade;
    shader.uniforms.uFogColorGround = squareFogUniforms.uFogColorGround;
    shader.uniforms.uFogColorSky = squareFogUniforms.uFogColorSky;
    shader.uniforms.uFogGradientStart = squareFogUniforms.uFogGradientStart;
    shader.uniforms.uFogGradientEnd = squareFogUniforms.uFogGradientEnd;
    originalCompile.call(this, shader, renderer);
  };
  (THREE.Material.prototype as any)._fogPatched = true;
}

interface EnvironmentProps {
  fogCenter: [number, number, number];
  disableFog?: boolean;
  worldTime?: any;
}
const skyUniforms = {
  uColorSky: { value: new THREE.Color('#87CEEB') },
  uColorGround: { value: new THREE.Color('#2d5a27') }
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export const Environment = ({ fogCenter, disableFog = false, worldTime }: EnvironmentProps) => {
  const { scene } = useThree();
  const dirLightRef = useRef<THREE.DirectionalLight>(null);
  const ambientLightRef = useRef<THREE.AmbientLight>(null);
  const savedFogRef = useRef<THREE.Fog | null>(null);

  useEffect(() => {
    if (disableFog) {
      if (scene.fog) savedFogRef.current = scene.fog as THREE.Fog;
      scene.fog = null;
      return;
    }

    if (!scene.fog) {
      scene.fog = savedFogRef.current ?? new THREE.Fog('#050505', 0.1, 100);
    }
  }, [disableFog, scene]);

  useEffect(() => {
    if (fogCenter) {
      squareFogUniforms.uFogCenter.value.set(fogCenter[0], fogCenter[1], fogCenter[2]);
    }
  }, [fogCenter]);

  useFrame(({ clock }) => {
    let t = 0; 
    let settings = worldTime?.settings;

    if (worldTime && settings?.cycleLengthSec) {
      const dtSec = (performance.now() - worldTime.receivedAtMs) / 1000;
      t = (worldTime.timeOfDay + dtSec / settings.cycleLengthSec) % 1;
    } else {
      const time = clock.getElapsedTime() * 0.05;
      t = ((Math.sin(time) + 1) / 2);
    }

      // --- DEVELOPMENT OVERRIDE: Lock to High Noon ---
          // const dayFactor = clamp01(0.5 + 0.5 * Math.sin((t - 0.25) * Math.PI * 2));
          const dayFactor = 1.0;
          // -----------------------------------------------
    const nightFloor = settings?.nightIntensityFloor ?? 0.28;

    const dayAmbient = new THREE.Color(settings?.dayAmbientColor ?? '#ffffff');
    const dayDir = new THREE.Color(settings?.dayDirColor ?? '#ffffff');
    
    // Gradient Sky Colors
    const daySky = new THREE.Color(settings?.dayFogColor ?? '#87CEEB');
    const nightSky = new THREE.Color(settings?.nightFogColor ?? '#020205');

    // Gradient Ground Colors (Assuming Green for now)
    const dayGround = new THREE.Color('#2d5a27');
    const nightGround = new THREE.Color('#0b1a0a');

    const nightAmbient = new THREE.Color(settings?.nightAmbientColor ?? '#0b1020');
    const nightDir = new THREE.Color(settings?.nightDirColor ?? '#2b3a6b');

    const dirIntensity = nightFloor + (1 - nightFloor) * dayFactor;
    const ambIntensity = dirIntensity * 0.5;

    if (ambientLightRef.current) {
      ambientLightRef.current.intensity = ambIntensity;
      ambientLightRef.current.color.copy(
        new THREE.Color().lerpColors(nightAmbient, dayAmbient, dayFactor)
      );
    }

    if (dirLightRef.current) {
      dirLightRef.current.intensity = dirIntensity;
      dirLightRef.current.color.copy(
        new THREE.Color().lerpColors(nightDir, dayDir, dayFactor)
      );
    }

    // Update the custom shader colors
    squareFogUniforms.uFogColorGround.value.lerpColors(nightGround, dayGround, dayFactor);
    squareFogUniforms.uFogColorSky.value.lerpColors(nightSky, daySky, dayFactor);

    skyUniforms.uColorGround.value.copy(squareFogUniforms.uFogColorGround.value);
    skyUniforms.uColorSky.value.copy(squareFogUniforms.uFogColorSky.value);
    scene.background = null;
  });

return (
    <group>
      <ambientLight ref={ambientLightRef} />
      <directionalLight ref={dirLightRef} position={[50, 50, 20]} castShadow />

      <mesh scale={500} position={fogCenter}>
        <sphereGeometry args={[1, 32, 16]} />
        <shaderMaterial
          side={THREE.BackSide}
          uniforms={skyUniforms}
          depthWrite={false}
          vertexShader={`
            varying vec3 vLocalPosition;
            void main() {
              vLocalPosition = position;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `}
          fragmentShader={`
            uniform vec3 uColorSky;
            uniform vec3 uColorGround;
            varying vec3 vLocalPosition;
            void main() {
              float h = normalize(vLocalPosition).y;
              float factor = smoothstep(-0.05, 0.15, h);
              gl_FragColor = vec4(mix(uColorGround, uColorSky, factor), 1.0);
            }
          `}
        />
      </mesh>
    </group>
  );
};
