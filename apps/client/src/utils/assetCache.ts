const DB_NAME = 'GameAssetCache';
const STORE_MODELS = 'models';
const STORE_DATA = 'gameData';

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = (e: any) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_MODELS)) db.createObjectStore(STORE_MODELS);
      if (!db.objectStoreNames.contains(STORE_DATA)) db.createObjectStore(STORE_DATA);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

let memoryWorldState: any = null;

export const saveGameData = async (key: string, data: any): Promise<void> => {
  if (key === 'world_state') memoryWorldState = data;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DATA, 'readwrite');
    tx.objectStore(STORE_DATA).put(data, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

export const getGameData = async (key: string): Promise<any> => {
  if (key === 'world_state' && memoryWorldState) return memoryWorldState;
  
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DATA, 'readonly');
    const request = tx.objectStore(STORE_DATA).get(key);
    request.onsuccess = () => {
      if (key === 'world_state') memoryWorldState = request.result;
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
  });
};

export const saveModelToDisk = async (modelId: number, blob: Blob): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MODELS, 'readwrite');
    tx.objectStore(STORE_MODELS).put(blob, modelId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

export const getModelFromDisk = async (modelId: number): Promise<Blob | null> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MODELS, 'readonly');
    const request = tx.objectStore(STORE_MODELS).get(modelId);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
};

const sessionUrls = new Map<number, string>();

export const getModelUrl = async (modelId: number): Promise<string | null> => {
  if (sessionUrls.has(modelId)) return sessionUrls.get(modelId)!;
  const blob = await getModelFromDisk(modelId);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  sessionUrls.set(modelId, url);
  return url;
};