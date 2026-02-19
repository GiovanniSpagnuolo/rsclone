import { PineTree, Rock, DeadTree, Bush, TreeStump } from './ProceduralProps';

interface GameObjectProps {
  objectDefId: number;
  position: [number, number, number];
  rotationY: number;
  onPointerDown?: (e: any) => void;
}

export const GameObject = ({ objectDefId, position, rotationY, onPointerDown }: GameObjectProps) => {
  const renderMesh = () => {
    switch (objectDefId) {
      case 1: return <PineTree x={position[0]} z={position[2]} />;
      case 2: return <Rock x={position[0]} z={position[2]} />;
      case 3: return <DeadTree x={position[0]} z={position[2]} />;
      case 4: return <Bush x={position[0]} z={position[2]} />;
      case 5: return <TreeStump x={position[0]} z={position[2]} />;
      default:
        return (
          <mesh position={[0, 0.5, 0]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color="red" />
          </mesh>
        );
    }
  };

  return (
    <group position={position} rotation={[0, rotationY, 0]} onPointerDown={onPointerDown}>
      {renderMesh()}
    </group>
  );
};
