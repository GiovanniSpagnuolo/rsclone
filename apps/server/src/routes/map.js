import express from 'express';
import { PrismaClient } from '@prisma/client';
import { loadedChunks, saveChunkToDb } from '../game/mapManager.js';

const router = express.Router();
const prisma = new PrismaClient();

router.get('/', (req, res) => {
  const chunksObj = Object.fromEntries(loadedChunks);
  res.json(chunksObj);
});

router.post('/save', async (req, res) => {
  const { chunkId, terrainData } = req.body;
  try {
    await saveChunkToDb(chunkId, terrainData);
    res.json({ success: true });
  } catch (e) {
    console.error("Save error:", e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/generate', async (req, res) => {
  const { chunkId } = req.body;
  
  if (loadedChunks.has(chunkId)) {
    return res.status(400).json({ error: "Chunk already exists" });
  }

  const terrainData = [];
  for (let i = 0; i < 64; i++) {
    terrainData.push({ height: 0, textureId: 1, isWalkable: true });
  }

  try {
    await prisma.mapChunk.create({
      data: {
        id: chunkId,
        terrainData: JSON.stringify(terrainData)
      }
    });
    
    loadedChunks.set(chunkId, terrainData);
    res.json({ success: true, chunkId, terrainData });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;