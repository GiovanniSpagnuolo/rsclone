import { useState, useEffect } from 'react';

interface CacheEditorProps {
  onClose: () => void;
}

export const CacheEditor = ({ onClose }: CacheEditorProps) => {
  const [objects, setObjects] = useState<any[]>([]);
  const [activeObj, setActiveObj] = useState<any>({
    id: 1, name: '', modelId: 1, depletedModelId: '', isWalkable: false, interactableData: '{}', lootTable: '[]'
  });

  const formatObjectForEditor = (obj: any) => ({
    ...obj,
    interactableData: typeof obj.interactableData === 'object' ? JSON.stringify(obj.interactableData, null, 2) : (obj.interactableData || '{}'),
    lootTable: typeof obj.lootTable === 'object' ? JSON.stringify(obj.lootTable, null, 2) : (obj.lootTable || '[]')
  });

  const fetchDatabaseTruth = async () => {
    try {
      const res = await fetch('http://localhost:3001/cache/full');
      const data = await res.json();
      
      const formattedObjects = Object.values(data.objects).map(formatObjectForEditor);
      setObjects(formattedObjects);
      
      localStorage.setItem('cache_objects', JSON.stringify(data.objects));
      localStorage.setItem('cache_version', data.version.toString());
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchDatabaseTruth();
  }, []);

  const handleSave = async () => {
    try {
      JSON.parse(activeObj.interactableData);
      JSON.parse(activeObj.lootTable);
    } catch (e) {
      alert("Invalid JSON format in Interactable Data or Loot Table.");
      return;
    }

    try {
      const payload = {
        ...activeObj,
        depletedModelId: activeObj.depletedModelId === '' ? null : Number(activeObj.depletedModelId)
      };

      const res = await fetch('http://localhost:3001/cache/admin/objects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (res.ok) {
        alert('Saved to SQLite Database!');
        await fetchDatabaseTruth();
      } else {
        const errorData = await res.json();
        alert(`Database Error: ${errorData.error}`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleBumpVersion = async () => {
    try {
      const res = await fetch('http://localhost:3001/cache/admin/cache/bump', { method: 'POST' });
      if (res.ok) {
        const { newVersion } = await res.json();
        alert(`Cache bumped to v${newVersion}`);
        await fetchDatabaseTruth();
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div style={{
      position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
      width: '800px', height: '600px', backgroundColor: 'rgba(20,20,20,0.95)', 
      color: 'white', border: '2px solid #555', borderRadius: '8px', zIndex: 300, display: 'flex'
    }}>
      <div style={{ width: '250px', borderRight: '1px solid #555', padding: '10px', overflowY: 'auto' }}>
        <div style={{ display: 'flex', gap: '5px', marginBottom: '10px' }}>
          <button onClick={() => setActiveObj({ id: objects.length + 1, name: 'New Object', modelId: 1, depletedModelId: '', isWalkable: false, interactableData: '{}', lootTable: '[]' })} style={{ flex: 1, padding: '8px', background: '#4CAF50', color: 'white', border: 'none', cursor: 'pointer' }}>+ New</button>
          <button onClick={handleBumpVersion} style={{ flex: 1, padding: '8px', background: '#FF9800', color: 'black', fontWeight: 'bold', border: 'none', cursor: 'pointer' }}>Bump Vrs</button>
        </div>
        {objects.map(obj => (
          <div key={obj.id} onClick={() => setActiveObj(obj)} style={{ padding: '8px', cursor: 'pointer', background: activeObj.id === obj.id ? '#333' : 'transparent', borderBottom: '1px solid #444' }}>
            [{obj.id}] {obj.name}
          </div>
        ))}
      </div>

      <div style={{ flex: 1, padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <h2>Edit Object Definition</h2>
          <button onClick={onClose} style={{ background: 'transparent', color: 'white', border: 'none', fontSize: '20px', cursor: 'pointer' }}>❌</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <label>ID <input type="number" value={activeObj.id} onChange={e => setActiveObj({...activeObj, id: Number(e.target.value)})} style={{ width: '100%', padding: '5px' }} /></label>
          <label>Name <input type="text" value={activeObj.name} onChange={e => setActiveObj({...activeObj, name: e.target.value})} style={{ width: '100%', padding: '5px' }} /></label>
          <label>Model ID <input type="number" value={activeObj.modelId} onChange={e => setActiveObj({...activeObj, modelId: Number(e.target.value)})} style={{ width: '100%', padding: '5px' }} /></label>
          <label>Depleted Model ID <input type="number" value={activeObj.depletedModelId || ''} onChange={e => setActiveObj({...activeObj, depletedModelId: e.target.value})} placeholder="Optional" style={{ width: '100%', padding: '5px' }} /></label>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <input type="checkbox" checked={activeObj.isWalkable} onChange={e => setActiveObj({...activeObj, isWalkable: e.target.checked})} />
          Is Walkable (No Collision)
        </label>

        <label>Interactable Data (JSON)<textarea value={activeObj.interactableData} onChange={e => setActiveObj({...activeObj, interactableData: e.target.value})} style={{ width: '100%', height: '80px', padding: '5px', fontFamily: 'monospace' }} /></label>
        
        <label>Loot Table (JSON)<textarea value={activeObj.lootTable} onChange={e => setActiveObj({...activeObj, lootTable: e.target.value})} style={{ width: '100%', height: '80px', padding: '5px', fontFamily: 'monospace' }} /></label>

        <button onClick={handleSave} style={{ padding: '10px', background: '#2196F3', color: 'white', border: 'none', fontWeight: 'bold', cursor: 'pointer', marginTop: 'auto' }}>💾 Save to Database</button>
      </div>
    </div>
  );
};