import { useMemo, useCallback } from 'react';
import { getSocket } from '../../network/socket';
import { ChunkMesh } from './ChunkMesh';
import { UniversalInstancer } from '../entities/UniversalInstancer';

interface GridMapProps {
  chunks: Record<string, any[]>;
  materials: Record<string, any>;
  playerPos: [number, number, number];
  spawns: any[];
  objects: Record<string, any>;
  onObjectClick?: (e: any, spawn: any, def: any) => void;
  onGroundClick?: () => void;
}

export const GridMap = ({
  chunks, materials, objects, playerPos, spawns, onGroundClick, onObjectClick
}: GridMapProps) => {
  
  const RENDER_DISTANCE = 5;
  const currentChunkX = Math.floor(playerPos[0] / 8);
  const currentChunkZ = Math.floor(playerPos[2] / 8);
  
  const getHeightFromState = useCallback((gx: number, gz: number) => {
    const tempCx = Math.floor(gx / 8);
    const tempCz = Math.floor(gz / 8);
    const cId = `${tempCx}_${tempCz}`;
    if (!chunks[cId]) return 0;
    return chunks[cId][(gz % 8 * 8) + (gx % 8)].height;
  }, [chunks]);

  const handleGroundClick = (e: any) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    
    const targetX = Math.round(e.point.x);
    const targetZ = Math.round(e.point.z);
    
    const socket = getSocket();
    if (socket) socket.emit('request_move', { x: targetX, y: targetZ });
    if (onGroundClick) onGroundClick();
  };

  const visibleChunks = useMemo(() => {
    return Object.entries(chunks).filter(([chunkId]) => {
      const [cx, cz] = chunkId.split('_').map(Number);
      return Math.abs(cx - currentChunkX) <= RENDER_DISTANCE && Math.abs(cz - currentChunkZ) <= RENDER_DISTANCE;
    });
  }, [chunks, currentChunkX, currentChunkZ]);

  const visibleSpawns = useMemo(() => {
    const visibleIds = new Set(visibleChunks.map(([id]) => id));
    return spawns.filter(spawn => {
      const cx = Math.floor(spawn.x / 8);
      const cz = Math.floor(spawn.y / 8);
      return visibleIds.has(`${cx}_${cz}`) && spawn.plane === 0;
    });
  }, [spawns, visibleChunks]);

  return (
    <group>
      <gridHelper args={[100, 100, '#000000', '#000000']} position={[(currentChunkX * 8) + 4, 0.01, (currentChunkZ * 8) + 4]} />

      {visibleChunks.map(([chunkId, tiles]) => (
        <ChunkMesh
          key={`chunk_${chunkId}`}
          chunkId={chunkId}
          tiles={tiles}
          chunks={chunks}
          materials={materials}
          onPointerDown={handleGroundClick}
        />
      ))}

      <UniversalInstancer
        objects={objects}
        spawns={visibleSpawns}
        getHeight={getHeightFromState}
        onObjectClick={onObjectClick}
      />
    </group>
  );
};
