import { useState, useEffect, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { GridMap } from './GridMap';
import { EditorToolbar } from './EditorToolbar';
import { CameraManager } from './CameraManager';
import { LocalPlayer } from '../entities/LocalPlayer';
import { AdminMinimap } from './AdminMinimap';
import { CacheEditor } from '../admin/CacheEditor';
import { useGameEngine } from '../../network/useGameEngine';
import { Environment } from './Environment';
import { MaterialEditor } from '../admin/MaterialEditor'
import { WaterPlane } from './WaterPlane';
import { Stats } from '@react-three/drei';
import { PlayerHUD } from '../ui/PlayerHUD';
import { InventoryHUD } from '../ui/InventoryHUD';
import { ContextMenu } from '../ui/ContextMenu';
import { getSocket } from '../../network/socket';

interface GameWorldProps {
  initialData: {
    chunks: Record<string, any[]>;
    spawns: any[];
    objects: Record<string, any>;
  };
}

export const GameWorld = ({ initialData }: GameWorldProps) => {

  if (!initialData) {
    return (
      <div style={{ width: '100vw', height: '100vh', background: 'black', color: 'red', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <h2>Fatal Error: GameWorld was rendered without passing through the GameLoader cache.</h2>
      </div>
    );
  }

  const { position, serverMsg, rights, worldTime, setWorldSettings, setTimeOfDay } = useGameEngine();

  const [chunks, setChunks] = useState<Record<string, any[]>>(initialData.chunks);
  const [spawns, setSpawns] = useState<any[]>(initialData.spawns);
  
  const [isEditorMode, setIsEditorMode] = useState(false);
  const [showMinimap, setShowMinimap] = useState(false);
const [showCacheEditor, setShowCacheEditor] = useState(false);
  const [showMaterialEditor, setShowMaterialEditor] = useState(false); // NEW
  const [activeChunkIds, setActiveChunkIds] = useState<string[]>([]);
  
  const [activeTool, setActiveTool] = useState('paint');
  const [brushSize, setBrushSize] = useState(1);
  const [activeMaterial, setActiveMaterial] = useState(1);
  const [isCtrlPressed, setIsCtrlPressed] = useState(false);
  const [showSurrounding, setShowSurrounding] = useState(true);
  const [dimSurrounding, setDimSurrounding] = useState(true);
  
    const [menuState, setMenuState] = useState<{x: number, y: number, spawn: any, def: any} | null>(null);
    const [pendingAction, setPendingAction] = useState<{ action: string, objectDefId: number, x: number, z: number } | null>(null);
  
   
    
  const [spawnObjectId, setSpawnObjectId] = useState<number>(1);
  const [spawnRotation, setSpawnRotation] = useState<number>(0);
    
    

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Control') setIsCtrlPressed(true); };
    const handleKeyUp = (e: KeyboardEvent) => { if (e.key === 'Control') setIsCtrlPressed(false); };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
  }, []);

    useEffect(() => {
        const cx = Math.floor(position[0] / 8);
        const cz = Math.floor(position[2] / 8);
        const currentChunkId = `${cx}_${cz}`;

        if (!activeChunkIds.includes(currentChunkId)) {
          setActiveChunkIds([currentChunkId]);
        }
      }, [position, activeChunkIds]);

  const handleGenerateChunk = async (chunkId: string) => {
    const res = await fetch('http://localhost:3001/map/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chunkId })
    });
    if (res.ok) {
      const data = await res.json();
      setChunks(prev => ({ ...prev, [chunkId]: data.terrainData }));
      setActiveChunkIds(prev => [...prev, chunkId]);
    }
  };

  const saveSelectedChunks = async () => {
    if (activeChunkIds.length === 0) return;
    try {
      for (const chunkId of activeChunkIds) {
        if (!chunks[chunkId]) continue;
        await fetch('http://localhost:3001/map/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chunkId, terrainData: chunks[chunkId] })
        });
      }
      alert(`${activeChunkIds.length} chunk(s) saved! Cache version will bump on next server restart.`);
    } catch (err) {
      console.error(err);
    }
  };
    
    // 2. THE DISTANCE TRACKER LOOP
    useEffect(() => {
        if (pendingAction) {
          const dist = Math.abs(position[0] - pendingAction.x) + Math.abs(position[2] - pendingAction.z);
          if (dist <= 1) {
            // We arrived! Fire the action to the server.
            const socket = getSocket();
            if (socket) socket.emit('interact_object', pendingAction);
            setPendingAction(null); // Clear the queue
          }
        }
      }, [position, pendingAction]);

      const handleMenuActionSelect = (actionKey: string, spawn: any, def: any) => {
        if (actionKey === 'Examine') {
          console.log(`It's a ${def.name}.`);
          return;
        }
          
          
        // Right-Click Action Chosen: Walk there, then execute.
        const socket = getSocket();
        if (socket) {
          socket.emit('request_move', { x: spawn.x, y: spawn.y });
          setPendingAction({ action: actionKey, objectDefId: def.id, x: spawn.x, z: spawn.y });
        }
      };
    
    const handleCloseMenu = useCallback(() => {
      setMenuState(null);
    }, []);
    
    const handleObjectClick = (e: any, spawn: any, def: any) => {
        if (isEditorMode) return;
        
        e.stopPropagation(); // Stops R3F 3D piercing
        if (e.nativeEvent) e.nativeEvent.stopPropagation(); // Kills the native HTML bubble

        if (e.button === 2 || e.type === 'contextmenu') {
          setMenuState({ x: e.clientX, y: e.clientY, spawn, def });
        } else if (e.button === 0 || e.type === 'click') {
          const socket = getSocket();
          if (socket) socket.emit('request_move', { x: spawn.x, y: spawn.y });

          let defaultAction = null;
          if (def.interactableData) {
            try {
              const data = typeof def.interactableData === 'string' ? JSON.parse(def.interactableData) : def.interactableData;
              if (data && data.actions) defaultAction = Object.keys(data.actions)[0];
            } catch (err) {}
          }

          if (defaultAction) {
            setPendingAction({ action: defaultAction, objectDefId: def.id, x: spawn.x, z: spawn.y });
          }
          setMenuState(null);
        }
      };

  // --- NEW FOG TARGET LOGIC ---
  // Editor Mode Target Calculation
  let sumX = 0, sumZ = 0;
  activeChunkIds.forEach(id => {
    const [cx, cz] = id.split('_').map(Number);
    sumX += cx; sumZ += cz;
  });
  
  const avgX = activeChunkIds.length ? sumX / activeChunkIds.length : 0;
  const avgZ = activeChunkIds.length ? sumZ / activeChunkIds.length : 0;
  const editorFogCenter: [number, number, number] = [(avgX * 8) + 4, 0, (avgZ * 8) + 4];

  // Play Mode Target Calculation (Snaps to 8x8 Grid)
  const currentChunkX = Math.floor(position[0] / 8);
  const currentChunkZ = Math.floor(position[2] / 8);
  const playFogCenter: [number, number, number] = [(currentChunkX * 8) + 4, 0, (currentChunkZ * 8) + 4];

  // Final Targets
  const fogCenterTarget = isEditorMode ? editorFogCenter : playFogCenter;
  const cameraTarget = isEditorMode ? editorFogCenter : position;
  // ----------------------------
    useEffect(() => {
        console.log(`[DEBUG 2 - GameWorld] 🔄 Menu State Changed: ${menuState ? 'OPENING' : 'CLOSED'}`);
      }, [menuState]);

      useEffect(() => {
        console.log(`[DEBUG 2 - GameWorld] 🏃 Pending Action Changed:`, pendingAction);
      }, [pendingAction]);
    
  return (
          <div style={{ width: '100vw', height: '100vh', position: 'absolute', top: 0, left: 0 }} onContextMenu={(e) => e.preventDefault()}>
          {/* Render Context Menu if State exists */}
          {!isEditorMode && (
                  <ContextMenu
                    menuState={menuState}
                    onClose={handleCloseMenu}
                    onActionSelect={handleMenuActionSelect}
                  />
                )}
          {/* 1. Add the HUD outside the Canvas */}
          {!isEditorMode && <PlayerHUD position={position} />}
          
          
      {rights >= 2 && (
        <EditorToolbar
          objects={initialData.objects}
          isEditorMode={isEditorMode}
          setIsEditorMode={setIsEditorMode}
          setShowMinimap={setShowMinimap}
          setShowCacheEditor={setShowCacheEditor}
          activeTool={activeTool}
          setActiveTool={setActiveTool}
          brushSize={brushSize}
          setBrushSize={setBrushSize}
          activeMaterial={activeMaterial}
          setActiveMaterial={setActiveMaterial}
          showSurrounding={showSurrounding}
          setShowSurrounding={setShowSurrounding}
          dimSurrounding={dimSurrounding}
          setDimSurrounding={setDimSurrounding}
          spawnObjectId={spawnObjectId}
          setSpawnObjectId={setSpawnObjectId}
          spawnRotation={spawnRotation}
          setSpawnRotation={setSpawnRotation}
          onSave={saveSelectedChunks}
          onReload={() => window.location.reload()}
          materials={initialData.materials}
          setShowMaterialEditor={setShowMaterialEditor}
        />
      )}

      {showMinimap && (
        <AdminMinimap
          chunks={chunks}
          materials={initialData.materials || {}} // <-- Add this line
          activeChunkIds={activeChunkIds}
          setActiveChunkIds={setActiveChunkIds}
          onGenerateChunk={handleGenerateChunk}
          onClose={() => setShowMinimap(false)}
        />
      )}

      {showCacheEditor && (
        <CacheEditor onClose={() => setShowCacheEditor(false)} />
      )}
      
      {showMaterialEditor && (
        <MaterialEditor onClose={() => setShowMaterialEditor(false)} />
      )}
          
          <InventoryHUD />

      <Canvas shadows>
          <Stats />
        <Environment
          fogCenter={fogCenterTarget}
          disableFog={isEditorMode}
          worldTime={worldTime}
        />
        
        <GridMap
          chunks={chunks}
          setChunks={setChunks}
          activeTool={isEditorMode ? activeTool : 'none'}
          activeMaterial={activeMaterial}
          brushSize={brushSize}
          isCtrlPressed={isCtrlPressed}
          playerPos={position}
          isEditorMode={isEditorMode}
          activeChunkIds={activeChunkIds}
          showSurrounding={showSurrounding}
          dimSurrounding={dimSurrounding}
          spawns={spawns}
          objects={initialData.objects}
          setSpawns={setSpawns}
          spawnObjectId={spawnObjectId}
          spawnRotation={spawnRotation}
          materials={initialData.materials}
          onObjectClick={handleObjectClick}
          onGroundClick={() => setPendingAction(null)}
        />
          
          <WaterPlane centerPosition={fogCenterTarget} />
        
        {!isEditorMode && <LocalPlayer position={position} chunks={chunks} />}
    
                  
                  <CameraManager
                    targetPosition={cameraTarget}
                    isFlyMode={isEditorMode}
                    isLocked={isCtrlPressed}
                  />

      </Canvas>
    </div>
  );
};
