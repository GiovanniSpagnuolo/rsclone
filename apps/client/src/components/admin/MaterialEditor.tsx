import { useState, useEffect } from 'react';

interface MaterialEditorProps {
  onClose: () => void;
}

export const MaterialEditor = ({ onClose }: MaterialEditorProps) => {
  const [materials, setMaterials] = useState<any[]>([]);
  const [activeMat, setActiveMat] = useState<any>({
    id: 1, name: 'Grass', color: '#2d5a27', textureUrl: '', physicsProfile: 'DIRT', isWalkable: true
  });

  const fetchDatabaseTruth = async () => {
    try {
      const res = await fetch('http://localhost:3001/cache/full');
      const data = await res.json();
      setMaterials(Object.values(data.materials || {}));
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchDatabaseTruth();
  }, []);

  const handleSave = async () => {
    try {
      const res = await fetch('http://localhost:3001/cache/admin/materials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(activeMat)
      });
      
      if (res.ok) {
        alert('Material Saved to SQLite Database!');
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
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div style={{
      position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
      width: '600px', height: '520px', backgroundColor: 'rgba(20,20,20,0.95)',
      color: 'white', border: '2px solid #555', borderRadius: '8px', zIndex: 300, display: 'flex'
    }}>
      <div style={{ width: '200px', borderRight: '1px solid #555', padding: '10px', overflowY: 'auto' }}>
        <div style={{ display: 'flex', gap: '5px', marginBottom: '10px' }}>
          <button onClick={() => setActiveMat({ id: materials.length + 1, name: 'New Material', color: '#ffffff', textureUrl: '', physicsProfile: 'DIRT', isWalkable: true })} style={{ flex: 1, padding: '8px', background: '#4CAF50', color: 'white', border: 'none', cursor: 'pointer' }}>+ New</button>
          <button onClick={handleBumpVersion} style={{ flex: 1, padding: '8px', background: '#FF9800', color: 'black', fontWeight: 'bold', border: 'none', cursor: 'pointer' }}>Bump</button>
        </div>
        {materials.map(mat => (
          <div key={mat.id} onClick={() => setActiveMat({ ...mat, textureUrl: mat.textureUrl || '', physicsProfile: mat.physicsProfile || 'DIRT' })} style={{ padding: '8px', cursor: 'pointer', background: activeMat.id === mat.id ? '#333' : 'transparent', borderBottom: '1px solid #444', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '12px', height: '12px', backgroundColor: mat.color, border: '1px solid #000' }} />
            [{mat.id}] {mat.name}
          </div>
        ))}
      </div>

      <div style={{ flex: 1, padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <h2>Edit Terrain Material</h2>
          <button onClick={onClose} style={{ background: 'transparent', color: 'white', border: 'none', fontSize: '20px', cursor: 'pointer' }}>❌</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '15px' }}>
          <label>ID <input type="number" value={activeMat.id} onChange={e => setActiveMat({...activeMat, id: Number(e.target.value)})} style={{ width: '100%', padding: '5px' }} /></label>
          <label>Name <input type="text" value={activeMat.name} onChange={e => setActiveMat({...activeMat, name: e.target.value})} style={{ width: '100%', padding: '5px' }} /></label>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <label>Color (Hex)
              <div style={{ display: 'flex', gap: '10px', marginTop: '5px' }}>
                <input type="color" value={activeMat.color} onChange={e => setActiveMat({...activeMat, color: e.target.value})} style={{ width: '50px', height: '30px', padding: '0', border: 'none' }} />
                <input type="text" value={activeMat.color} onChange={e => setActiveMat({...activeMat, color: e.target.value})} style={{ flex: 1, padding: '5px' }} />
              </div>
            </label>
            <label>Physics Profile
              <select value={activeMat.physicsProfile} onChange={e => setActiveMat({...activeMat, physicsProfile: e.target.value})} style={{ width: '100%', padding: '5px', marginTop: '5px', background: '#333', color: 'white', border: '1px solid #555' }}>
                <option value="DIRT">DIRT</option>
                <option value="STONE">STONE</option>
                <option value="WOOD">WOOD</option>
                <option value="WATER">WATER</option>
                <option value="SAND">SAND</option>
                <option value="MUD">MUD</option>
                <option value="SNOW">SNOW</option>
              </select>
            </label>
          </div>

          <label>Texture URL (Optional) <input type="text" placeholder="/textures/grass.png" value={activeMat.textureUrl} onChange={e => setActiveMat({...activeMat, textureUrl: e.target.value})} style={{ width: '100%', padding: '5px', marginTop: '5px' }} /></label>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px' }}>
          <input type="checkbox" checked={activeMat.isWalkable} onChange={e => setActiveMat({...activeMat, isWalkable: e.target.checked})} />
          Is Walkable
        </label>

        <button onClick={handleSave} style={{ padding: '10px', background: '#2196F3', color: 'white', border: 'none', fontWeight: 'bold', cursor: 'pointer', marginTop: 'auto' }}>💾 Save Material</button>
      </div>
    </div>
  );
};
