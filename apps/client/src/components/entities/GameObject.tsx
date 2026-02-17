import { Suspense, useEffect, useState } from 'react';
import { useGLTF, Clone } from '@react-three/drei';
import { getModelUrl, getGameData } from '../../utils/assetCache';

interface ModelNodeProps {
  url: string;
}

const ModelNode = ({ url }: ModelNodeProps) => {
  const { scene } = useGLTF(url);
  return <Clone object={scene} castShadow receiveShadow />;
};

interface GameObjectProps {
  objectDefId: number;
  position: [number, number, number];
  rotationY: number;
  onPointerDown?: (e: any) => void;
}

export const GameObject = ({ objectDefId, position, rotationY, onPointerDown }: GameObjectProps) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    const loadAsset = async () => {
      try {
        const data = await getGameData('world_state');
        const modelId = data?.objects?.[objectDefId]?.modelId;
        
        if (modelId) {
          const url = await getModelUrl(modelId);
          setBlobUrl(url);
        }
      } catch (e) {
        console.error(e);
      }
    };
    
    loadAsset();
  }, [objectDefId]);

  const fallbackBox = (
    <mesh castShadow>
      <boxGeometry args={[0.6, 1.2, 0.6]} />
      <meshStandardMaterial color="#8B4513" />
    </mesh>
  );

  return (
    <group position={position} rotation={[0, rotationY, 0]} onPointerDown={onPointerDown}>
      {blobUrl ? (
        <Suspense fallback={fallbackBox}>
          <ModelNode url={blobUrl} />
        </Suspense>
      ) : (
        fallbackBox
      )}
    </group>
  );
};