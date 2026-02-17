import { useState, useEffect } from 'react';
import { getSocket } from '../../network/socket';
import { Tile } from './Tile';
import { DumbChunk } from './DumbChunk';
import { GameObject } from '../entities/GameObject';

interface GridMapProps {
  chunks: Record<string, any[]>;
  setChunks: React.Dispatch<React.SetStateAction<Record<string, any[]>>>;
  materials: Record<string, any>; // NEW PROP
  activeTool: string;
  activeMaterial: number;
  brushSize: number;
  isCtrlPressed: boolean;
  playerPos: [number, number, number];
  isEditorMode: boolean;
  activeChunkIds: string[];
  showSurrounding: boolean;
  dimSurrounding: boolean;
  spawns: any[];
  setSpawns: React.Dispatch<React.SetStateAction<any[]>>;
  spawnObjectId: number;
  spawnRotation: number;
}

export const GridMap = ({ 
  chunks, setChunks, materials, activeTool, activeMaterial, brushSize, 
  isCtrlPressed, playerPos, isEditorMode, activeChunkIds,
  showSurrounding, dimSurrounding,
  spawns, setSpawns, spawnObjectId, spawnRotation
}: GridMapProps) => {
  const [isMouseDown, setIsMouseDown] = useState(false);
  
  const RENDER_DISTANCE = 6;
  const currentChunkX = Math.floor(playerPos[0] / 8);
  const currentChunkZ = Math.floor(playerPos[2] / 8);
  
  const [showMaterialEditor, setShowMaterialEditor] = useState(false);

  const getHeightFromState = (gx: number, gz: number) => {
    const tempCx = Math.floor(gx / 8);
    const tempCz = Math.floor(gz / 8);
    const cId = `${tempCx}_${tempCz}`;
    if (!chunks[cId]) return 0;
    return chunks[cId][(gz % 8 * 8) + (gx % 8)].height;
  };

  useEffect(() => {
    const handleMouseUp = () => setIsMouseDown(false);
    window.addEventListener('pointerup', handleMouseUp);
    return () => window.removeEventListener('pointerup', handleMouseUp);
  }, []);

  const handleSpawnClick = async (x: number, z: number) => {
    try {
      const res = await fetch('http://localhost:3001/spawns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x, z, objectDefId: spawnObjectId, rotation: spawnRotation, plane: 0 })
      });
      if (res.ok) {
        const { spawn } = await res.json();
        setSpawns(prev => {
          const filtered = prev.filter(s => !(s.x === x && s.y === z && s.plane === 0));
          return [...filtered, spawn];
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteSpawn = async (x: number, z: number) => {
    try {
      const plane = 0;
      const res = await fetch(`http://localhost:3001/spawns/${x}/${z}/${plane}`, { method: 'DELETE' });
      if (res.ok) {
        setSpawns(prev => prev.filter(s => !(s.x === x && s.y === z && s.plane === plane)));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const applyTool = (centerX: number, centerZ: number) => {
    setChunks(prevChunks => {
      const nextChunks = { ...prevChunks };
      const radius = brushSize - 1;

      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          if (dx * dx + dz * dz > radius * radius) continue;

          const tx = centerX + dx;
          const tz = centerZ + dz;
          const cx = Math.floor(tx / 8);
          const cz = Math.floor(tz / 8);
          const chunkId = `${cx}_${cz}`;

          if (!nextChunks[chunkId]) continue;

          if (nextChunks[chunkId] === prevChunks[chunkId]) {
            nextChunks[chunkId] = [...prevChunks[chunkId]];
          }

          const lx = tx % 8;
          const lz = tz % 8;
          const index = (lz * 8) + lx;
          const tile = { ...nextChunks[chunkId][index] };

          switch (activeTool) {
            case 'paint':
              tile.textureId = activeMaterial;
              tile.isWalkable = materials[activeMaterial] ? materials[activeMaterial].isWalkable : true;
              break;
            case 'raise':
              tile.height += 0.5;
              break;
            case 'lower':
              tile.height -= 0.5;
              break;
            case 'flatten':
              tile.height = 0;
              break;
            case 'smooth':
              const avg = (tile.height + getHeightFromState(tx, tz-1) + getHeightFromState(tx, tz+1) + getHeightFromState(tx-1, tz) + getHeightFromState(tx+1, tz)) / 5;
              tile.height = Number(avg.toFixed(2));
              break;
          }

          nextChunks[chunkId][index] = tile;
        }
      }
      return nextChunks;
    });
  };

  const handlePointerDown = (e: any, x: number, z: number) => {
    if (e.button !== 0) return;

    if (activeTool === 'none' || activeTool === 'fly') {
      const socket = getSocket();
      if (socket) socket.emit('request_move', { x, y: z });
      return;
    }

    if (activeTool === 'spawn') {
      e.stopPropagation();
      handleSpawnClick(x, z);
      return;
    }

    if (activeTool === 'deleteSpawn') {
      e.stopPropagation();
      handleDeleteSpawn(x, z);
      return;
    }
    
    if (isCtrlPressed) {
      e.stopPropagation();
      setIsMouseDown(true);
      applyTool(x, z);
    }
  };

  const handlePointerEnter = (e: any, x: number, z: number) => {
    if (isMouseDown && isCtrlPressed && activeTool !== 'none' && activeTool !== 'fly' && activeTool !== 'spawn' && activeTool !== 'deleteSpawn') {
      e.stopPropagation();
      applyTool(x, z);
    }
  };

  const handleDumbChunkClick = (e: any) => {
    if (e.button !== 0) return;
    if (isEditorMode) return; 
    
    e.stopPropagation();
    const targetX = Math.round(e.point.x);
    const targetZ = Math.round(e.point.z);
    
    const socket = getSocket();
    if (socket) socket.emit('request_move', { x: targetX, y: targetZ });
  };

  const visibleChunks = Object.entries(chunks).filter(([chunkId]) => {
    const isActive = activeChunkIds.includes(chunkId);
    
    if (isEditorMode) {
      if (isActive) return true;
      if (!showSurrounding) return false;

      const [cx, cz] = chunkId.split('_').map(Number);
      return activeChunkIds.some(activeId => {
        const [acx, acz] = activeId.split('_').map(Number);
        return Math.abs(cx - acx) <= RENDER_DISTANCE && Math.abs(cz - acz) <= RENDER_DISTANCE;
      });
    }
    
    const [cx, cz] = chunkId.split('_').map(Number);
    return Math.abs(cx - currentChunkX) <= RENDER_DISTANCE && Math.abs(cz - currentChunkZ) <= RENDER_DISTANCE;
  });

  return (
    <group>
      <gridHelper 
        args={[100, 100, '#000000', '#000000']} 
        position={[(currentChunkX * 8) + 4, 0.01, (currentChunkZ * 8) + 4]} 
      />

      {visibleChunks.map(([chunkId, tiles]) => {
        const isInteractive = isEditorMode && activeChunkIds.includes(chunkId);

        if (!isInteractive) {
          return (
            <DumbChunk 
              key={`dumb_${chunkId}`} 
              chunkId={chunkId} 
              tiles={tiles} 
              chunks={chunks} 
              isDimmed={isEditorMode && dimSurrounding} 
              onPointerDown={handleDumbChunkClick}
            />
          );
        }

        const [cx, cy] = chunkId.split('_').map(Number);
        
        return tiles.map((tile, index) => {
          const x = (cx * 8) + (index % 8);
          const z = (cy * 8) + Math.floor(index / 8);
          
          const mat = materials[tile.textureId] || materials[1];
          const color = mat ? mat.color : '#FF00FF'; 
          
          const heights: [number, number, number, number] = [
            tile.height,
            getHeightFromState(x + 1, z),
            getHeightFromState(x, z + 1),
            getHeightFromState(x + 1, z + 1)
          ];

          return (
            <Tile 
              key={`${x}_${z}`}
              x={x}
              z={z}
              heights={heights}
              color={color}
              onPointerDown={(e) => handlePointerDown(e, x, z)}
              onPointerEnter={(e) => handlePointerEnter(e, x, z)}
            />
          );
        });
      })}

      {spawns.map(spawn => {
        const cx = Math.floor(spawn.x / 8);
        const cz = Math.floor(spawn.y / 8);
        const chunkId = `${cx}_${cz}`;
        
        const isVisible = visibleChunks.some(([id]) => id === chunkId);
        if (!isVisible || spawn.plane !== 0) return null;

        const height = getHeightFromState(spawn.x, spawn.y);
        const rotationY = spawn.rotation * (Math.PI / 180);

        return (
          <GameObject 
            key={`spawn_${spawn.x}_${spawn.y}_${spawn.plane}`}
            objectDefId={spawn.objectDefId}
            position={[spawn.x, height, spawn.y]}
            rotationY={rotationY}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              if (activeTool === 'deleteSpawn' && isEditorMode) {
                e.stopPropagation();
                handleDeleteSpawn(spawn.x, spawn.y);
              }
            }}
          />
        );
      })}
    </group>
  );
};