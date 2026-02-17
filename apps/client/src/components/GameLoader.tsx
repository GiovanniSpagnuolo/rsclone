import { useState, useEffect } from 'react';
import { GameWorld } from './world/GameWorld';
import { getModelFromDisk, saveModelToDisk, saveGameData, getGameData } from '../utils/assetCache';

export const GameLoader = () => {
  const [worldData, setWorldData] = useState<any>(null);
  const [status, setStatus] = useState("Checking cache version...");
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const initCache = async () => {
	
      try {
        const localVersion = localStorage.getItem('cache_version');
        const verRes = await fetch('http://localhost:3001/cache/version');
        const { version: serverVersion } = await verRes.json();

        let data;


        if (localVersion !== serverVersion.toString()) {
          setStatus(`Downloading Monolithic Cache v${serverVersion}...`);
          const cacheRes = await fetch('http://localhost:3001/cache/full');
          data = await cacheRes.json();
		  
		  
          
          await saveGameData('world_state', data);
          localStorage.setItem('cache_version', serverVersion.toString());
        } else {
          setStatus("Loading world from local disk...");
          data = await getGameData('world_state');
        }

        const requiredModels = new Set<number>();
        Object.values(data.objects).forEach((obj: any) => {
          if (obj.modelId) requiredModels.add(obj.modelId);
          if (obj.depletedModelId) requiredModels.add(obj.depletedModelId);
        });

        const modelsArray = Array.from(requiredModels);
        let downloaded = 0;

        for (const modelId of modelsArray) {
          const exists = await getModelFromDisk(modelId);
          if (!exists) {
            setStatus(`Downloading binary model: ${modelId}.glb`);
            const res = await fetch(`/models/${modelId}.glb`);
            if (res.ok) {
              const blob = await res.blob();
              await saveModelToDisk(modelId, blob);
            }
          }
          downloaded++;
          setProgress(Math.floor((downloaded / modelsArray.length) * 100));
        }

        setStatus("Cache fully verified. Entering world...");
        setTimeout(() => setWorldData(data), 500);

      } catch (err) {
        setStatus("Failed to connect to game server.");
        console.error(err);
      }
    };

    initCache();
  }, []);

  if (!worldData) {
    return (
      <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#111', color: 'white', fontFamily: 'monospace' }}>
        <h2 style={{ marginBottom: '20px' }}>Loading OSRS Clone</h2>
        <p style={{ color: '#FF9800', marginBottom: '10px' }}>{status}</p>
        <div style={{ width: '300px', height: '20px', backgroundColor: '#333', border: '1px solid #555' }}>
          <div style={{ width: `${progress}%`, height: '100%', backgroundColor: '#4CAF50', transition: 'width 0.2s' }} />
        </div>
      </div>
    );
  }

  return <GameWorld initialData={worldData} />;
};