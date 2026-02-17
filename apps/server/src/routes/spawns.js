import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

router.get('/', async (req, res) => {
  try {
    const spawns = await prisma.mapSpawn.findMany();
    res.json(spawns);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', async (req, res) => {
  const { x, z, objectDefId, rotation, plane = 0 } = req.body;
  const chunkId = `${Math.floor(x / 8)}_${Math.floor(z / 8)}`;
  
  try {
    const spawn = await prisma.mapSpawn.upsert({
      where: { x_y_plane: { x, y: z, plane } },
      update: { objectDefId, rotation, chunkId },
      create: { x, y: z, plane, objectDefId, rotation, chunkId }
    });
    res.json({ success: true, spawn });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:x/:z/:plane', async (req, res) => {
  const { x, z, plane } = req.params;
  try {
    await prisma.mapSpawn.delete({
      where: { x_y_plane: { x: Number(x), y: Number(z), plane: Number(plane) } }
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;