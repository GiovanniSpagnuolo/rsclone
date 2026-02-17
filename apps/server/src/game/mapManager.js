import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export const loadedChunks = new Map();

export const loadChunksIntoRAM = async () => {
  const chunks = await prisma.mapChunk.findMany();
  
  for (const chunk of chunks) {
    loadedChunks.set(chunk.id, JSON.parse(chunk.terrainData));
  }
  
  console.log(`🗺️  Loaded ${chunks.length} map chunks into RAM.`);
};

export const getTile = (globalX, globalY) => {
  const chunkX = Math.floor(globalX / 8);
  const chunkY = Math.floor(globalY / 8);
  const chunkId = `${chunkX}_${chunkY}`;

  const chunk = loadedChunks.get(chunkId);
  if (!chunk) return null;

  const localX = globalX % 8;
  const localY = globalY % 8;
  const tileIndex = (localY * 8) + localX;

  return chunk[tileIndex];
};

export const saveChunkToDb = async (chunkId, terrainData) => {
  await prisma.mapChunk.update({
    where: { id: chunkId },
    data: { terrainData: JSON.stringify(terrainData) }
  });
  // Update the RAM cache so pathfinding reflects the change immediately
  loadedChunks.set(chunkId, terrainData);
};