import express from 'express';
import { PrismaClient } from '@prisma/client';
import { gameCache, bumpCacheVersion, loadCacheIntoRAM } from '../game/cacheManager.js';

const router = express.Router();
const prisma = new PrismaClient();

router.get('/version', (req, res) => {
  res.json({ version: gameCache.version });
});

router.get('/full', async (req, res) => {
  try {
    const chunks = await prisma.mapChunk.findMany();
    const spawns = await prisma.mapSpawn.findMany();
    const materials = await prisma.terrainMaterial.findMany();
    
    const chunkDict = {};
    chunks.forEach(c => {
      chunkDict[c.id] = JSON.parse(c.terrainData);
    });

    const materialDict = {};
    materials.forEach(m => {
      materialDict[m.id] = m;
    });

    res.json({
      version: gameCache.version,
      objects: Object.fromEntries(gameCache.objects),
      chunks: chunkDict,
      spawns: spawns,
      materials: materialDict
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
router.post('/admin/materials', async (req, res) => {
  const { id, name, color, textureUrl, physicsProfile, isWalkable } = req.body;
  try {
    await prisma.terrainMaterial.upsert({
      where: { id: Number(id) },
      update: {
        name,
        color,
        textureUrl: textureUrl || null,
        physicsProfile: physicsProfile || 'DIRT',
        isWalkable
      },
      create: {
        id: Number(id),
        name,
        color,
        textureUrl: textureUrl || null,
        physicsProfile: physicsProfile || 'DIRT',
        isWalkable
      }
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/admin/objects', async (req, res) => {
  // Added proceduralType to the destructuring
  const { id, name, modelId, depletedModelId, proceduralType, isWalkable, interactableData, lootTable } = req.body;
  
  const safeInteractable = typeof interactableData === 'object' ? JSON.stringify(interactableData) : String(interactableData || '{}');
  const safeLootTable = typeof lootTable === 'object' ? JSON.stringify(lootTable) : String(lootTable || '[]');

  try {
    await prisma.objectDefinition.upsert({
      where: { id: Number(id) },
      update: {
        name,
        modelId: modelId ? Number(modelId) : null,
        depletedModelId: depletedModelId ? Number(depletedModelId) : null,
        proceduralType: proceduralType || null, // NEW
        isWalkable,
        interactableData: safeInteractable,
        lootTable: safeLootTable
      },
      create: {
        id: Number(id),
        name,
        modelId: modelId ? Number(modelId) : null,
        depletedModelId: depletedModelId ? Number(depletedModelId) : null,
        proceduralType: proceduralType || null, // NEW
        isWalkable,
        interactableData: safeInteractable,
        lootTable: safeLootTable
      }
    });

    await loadCacheIntoRAM();
    res.json({ success: true, version: gameCache.version });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


router.post('/admin/cache/bump', async (req, res) => {
  try {
    const newVersion = await bumpCacheVersion();
    res.json({ success: true, newVersion });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});                                          

export default router;
