import { PrismaClient } from '@prisma/client';

export const loadedChunks = new Map();
const prisma = new PrismaClient();

export const loadChunksIntoRAM = async () => {
  console.log("Loading pathfinding grid into RAM...");
  
  const chunks = await prisma.mapChunk.findMany();
  // Only load ground-level objects for collision right now
  const spawns = await prisma.mapSpawn.findMany({ where: { plane: 0 } });
  const objectDefs = await prisma.objectDefinition.findMany();

  // 1. Create a fast lookup dictionary for Object Walkability
  const walkabilityDict = {};
  objectDefs.forEach(def => {
    walkabilityDict[def.id] = def.isWalkable;
  });

  // 2. Load the base terrain tiles
  chunks.forEach(chunk => {
    try {
      const tiles = JSON.parse(chunk.terrainData);
      loadedChunks.set(chunk.id, tiles);
    } catch (e) {
      console.error(`Failed to parse chunk ${chunk.id}`);
    }
  });

  // 3. Overlay the Objects: Flag tiles as unwalkable if a blocking object is there
  let blockedCount = 0;
  spawns.forEach(spawn => {
    // Check our dictionary to see if this specific object blocks movement
    if (walkabilityDict[spawn.objectDefId] === false) {
      const chunkTiles = loadedChunks.get(spawn.chunkId);
      
      if (chunkTiles) {
        // Calculate the local tile index inside the 8x8 chunk
        const localX = spawn.x % 8;
        const localZ = spawn.y % 8; // Database 'y' represents our 3D 'Z' axis
        const index = (localZ * 8) + localX;
        
        // Flip the ground tile to act as a wall
        if (chunkTiles[index]) {
          chunkTiles[index].isWalkable = false;
          blockedCount++;
        }
      }
    }
  });

  console.log(`Loaded ${loadedChunks.size} chunks. Overlaid ${blockedCount} collision blocks.`);
};

// ... keep your existing saveChunkToDb function down here

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
