import { useState, useMemo } from 'react';

interface EditorToolbarProps {
  objects: Record<string, any>;
  materials: Record<string, any>; // NEW PROP
  isEditorMode: boolean;
  setIsEditorMode: (val: boolean) => void;
  setShowMinimap: (val: boolean) => void;
  setShowCacheEditor: (val: boolean) => void;
  setShowMaterialEditor: (val: boolean) => void; // NEW PROP
  activeTool: string;
  setActiveTool: (tool: string) => void;
  brushSize: number;
  setBrushSize: (size: number) => void;
  activeMaterial: number;
  setActiveMaterial: (mat: number) => void;
  showSurrounding: boolean;
  setShowSurrounding: (val: boolean) => void;
  dimSurrounding: boolean;
  setDimSurrounding: (val: boolean) => void;
  spawnObjectId: number;
  setSpawnObjectId: (id: number) => void;
  spawnRotation: number;
  setSpawnRotation: (rot: number) => void;
  onSave: () => void;
  onReload: () => void;
}

export const EditorToolbar = ({ 
  objects, materials, isEditorMode, setIsEditorMode, setShowMinimap, setShowCacheEditor, setShowMaterialEditor,
  activeTool, setActiveTool, brushSize, setBrushSize, 
  activeMaterial, setActiveMaterial, 
  showSurrounding, setShowSurrounding, dimSurrounding, setDimSurrounding,
  spawnObjectId, setSpawnObjectId, spawnRotation, setSpawnRotation,
  onSave, onReload 
}: EditorToolbarProps) => {

  const [searchTerm, setSearchTerm] = useState('');
  const [showObjectList, setShowObjectList] = useState(false);


  const cacheObjects = useMemo(() => Object.values(objects), [objects]);
  const cacheMaterials = useMemo(() => Object.values(materials), [materials]);

  const filteredObjects = useMemo(() => {
    return cacheObjects.filter((obj: any) => 
      obj.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      obj.id.toString().includes(searchTerm)
    );
  }, [cacheObjects, searchTerm]);

  const activeObjectName = objects[spawnObjectId]?.name || 'Unknown Object';

  if (!isEditorMode) {
    return (
      <button 
        onClick={() => setIsEditorMode(true)}
        style={{ position: 'absolute', top: 10, right: 10, padding: '10px', zIndex: 100, background: '#FF9800', color: 'black', fontWeight: 'bold', cursor: 'pointer' }}
      >
        🛠️ Enable Editor Mode
      </button>
    );
  }

  const tools = [
    { id: 'paint', label: '🎨 Paint' },
    { id: 'raise', label: '⬆️ Raise' },
    { id: 'lower', label: '⬇️ Lower' },
    { id: 'smooth', label: '🌊 Smooth' },
    { id: 'flatten', label: '📏 Flatten' },
    { id: 'spawn', label: '🌳 Object' },
    { id: 'deleteSpawn', label: '🪓 Remove Object' },
  ];

  return (
    <div style={{
      position: 'absolute', bottom: '20px', left: '50%', transform: 'translateX(-50%)',
      display: 'flex', flexDirection: 'column', gap: '10px', background: 'rgba(20, 20, 20, 0.9)', 
      padding: '12px', borderRadius: '8px', zIndex: 100, border: '1px solid #444', color: 'white'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #555', paddingBottom: '8px' }}>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => setShowMinimap(true)} style={{ background: '#9C27B0', color: 'white', padding: '6px 12px', cursor: 'pointer', border: 'none' }}>🗺️ Minimap</button>
          <button onClick={() => setShowCacheEditor(true)} style={{ background: '#607D8B', color: 'white', padding: '6px 12px', cursor: 'pointer', border: 'none' }}>🗄️ Object DB</button>
          <button onClick={() => setShowMaterialEditor(true)} style={{ background: '#795548', color: 'white', padding: '6px 12px', cursor: 'pointer', border: 'none' }}>🎨 Material DB</button>
        </div>
        
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
          <label style={{ display: 'flex', gap: '5px', cursor: 'pointer' }}>
            <input type="checkbox" checked={showSurrounding} onChange={(e) => setShowSurrounding(e.target.checked)} /> Show Surrounding
          </label>
          <label style={{ display: 'flex', gap: '5px', cursor: 'pointer', opacity: showSurrounding ? 1 : 0.5 }}>
            <input type="checkbox" checked={dimSurrounding} onChange={(e) => setDimSurrounding(e.target.checked)} disabled={!showSurrounding} /> Dim Surrounding
          </label>
        </div>

        <button onClick={() => setIsEditorMode(false)} style={{ background: '#f44336', color: 'white', padding: '6px 12px', cursor: 'pointer', border: 'none' }}>Exit Editor Mode</button>
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        {tools.map(t => (
          <button 
            key={t.id}
            onClick={() => setActiveTool(t.id)}
            style={{ 
              background: activeTool === t.id ? '#4CAF50' : '#333',
              border: '1px solid #555', padding: '6px 12px', color: 'white', cursor: 'pointer'
            }}
          >
            {t.label}
          </button>
        ))}

        <div style={{ width: '1px', background: '#666', margin: '0 8px' }} />

        <button onClick={onReload} style={{ background: '#2196F3', color: 'white', border: 'none', padding: '6px 12px', cursor: 'pointer' }}>🔄 Reload</button>
        <button onClick={onSave} style={{ background: '#4CAF50', color: 'white', border: 'none', padding: '6px 12px', fontWeight: 'bold', cursor: 'pointer' }}>💾 Save Chunk</button>
      </div>

      <div style={{ display: 'flex', gap: '20px', alignItems: 'center', padding: '4px 8px' }}>
        
        {activeTool !== 'spawn' && activeTool !== 'deleteSpawn' && (
          <label style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            Brush Size: {brushSize}
            <input type="range" min="1" max="5" value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} />
          </label>
        )}

        {activeTool === 'paint' && (
          <label style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            Material:
            <select value={activeMaterial} onChange={(e) => setActiveMaterial(Number(e.target.value))} style={{ background: '#333', color: 'white', padding: '4px' }}>
              {cacheMaterials.map((mat: any) => (
                <option key={mat.id} value={mat.id}>
                  {mat.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {activeTool === 'spawn' && (
          <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
            
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', position: 'relative' }}>
              <span>Object:</span>
              <button 
                onClick={() => setShowObjectList(!showObjectList)}
                style={{ background: '#333', color: 'white', border: '1px solid #555', padding: '6px 12px', cursor: 'pointer', minWidth: '200px', textAlign: 'left', display: 'flex', justifyContent: 'space-between' }}
              >
                <span>[{spawnObjectId}] {activeObjectName}</span>
                <span>▼</span>
              </button>

              {showObjectList && (
                <div style={{ 
                  position: 'absolute', bottom: '100%', left: '55px', marginBottom: '5px', 
                  width: '300px', background: '#222', border: '1px solid #555', borderRadius: '4px', 
                  display: 'flex', flexDirection: 'column', maxHeight: '250px', zIndex: 200,
                  boxShadow: '0 -4px 10px rgba(0,0,0,0.5)'
                }}>
                  <input 
                    type="text" 
                    placeholder="Search by name or ID..." 
                    value={searchTerm} 
                    onChange={e => setSearchTerm(e.target.value)} 
                    style={{ background: '#111', color: 'white', border: 'none', borderBottom: '1px solid #444', padding: '10px', outline: 'none' }}
                    autoFocus
                  />
                  <div style={{ overflowY: 'auto', flex: 1 }}>
                    {filteredObjects.length > 0 ? filteredObjects.map((obj: any) => (
                      <div 
                        key={obj.id} 
                        onClick={() => {
                          setSpawnObjectId(obj.id);
                          setShowObjectList(false);
                          setSearchTerm('');
                        }}
                        style={{ padding: '8px 10px', cursor: 'pointer', background: spawnObjectId === obj.id ? '#4CAF50' : 'transparent', borderBottom: '1px solid #333' }}
                      >
                        [{obj.id}] {obj.name} <span style={{ color: '#888', fontSize: '0.85em', float: 'right' }}>Model: {obj.modelId}</span>
                      </div>
                    )) : (
                      <div style={{ padding: '10px', color: '#888', textAlign: 'center' }}>No objects found.</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '5px' }}>
              {[0, 90, 180, 270].map(rot => (
                <button 
                  key={rot} 
                  onClick={() => setSpawnRotation(rot)} 
                  style={{ background: spawnRotation === rot ? '#FF9800' : '#444', color: 'white', border: 'none', padding: '4px 8px', cursor: 'pointer' }}
                >
                  {rot}°
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};