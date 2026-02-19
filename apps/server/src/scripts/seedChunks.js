import { PrismaClient } from '@prisma/client';
import { createNoise2D } from 'simplex-noise';

const prisma = new PrismaClient();
const noise2D = createNoise2D();

const MATERIALS = [
  { id: 1, name: 'Grass', color: '#2d5a27', isWalkable: true },
  { id: 2, name: 'Water', color: '#1E90FF', isWalkable: false },
  { id: 3, name: 'Sand',  color: '#c2b280', isWalkable: true },
  { id: 4, name: 'Dirt',  color: '#5b3e31', isWalkable: true },
  { id: 5, name: 'Rock',  color: '#808080', isWalkable: true }
];

const OBJECTS = [
  {
    id: 1, name: 'Pine Tree', proceduralType: 'PINE_TREE', isWalkable: false,
    interactableData: JSON.stringify({
      actions: {
        "Chop": {
          animation: "CHOP_AXE",
          depleteChance: 1.0,      // 100% chance to deplete (Runescape standard tree)
          depleteFloor: 1.0,       // Lowest chance it can reach at max level
          rewardItemId: 1511,      // Standard Logs ID
          rewardQty: 1,
          msgSuccess: "You get some logs.",
          msgDeplete: "The tree runs out of logs.",
          reqItemCategory: "AXE",
          reqSkills: { woodcutting: 1 }
        }
      }
    })
  },
  {
    id: 2, name: 'Rock', proceduralType: 'ROCK', isWalkable: false,
    interactableData: JSON.stringify({
      actions: {
        "Mine": {
          animation: "MINE_PICKAXE",
          depleteChance: 0.3,      // 30% chance to deplete (Yields multiple ores)
          depleteFloor: 0.05,      // 5% chance at max mining level
          rewardItemId: 436,       // Copper Ore ID
          rewardQty: 1,
          msgSuccess: "You manage to mine some ore.",
          msgDeplete: "There is no ore left in this rock.",
          reqItemCategory: "PICKAXE",
          reqSkills: { mining: 1 }
        }
      }
    })
  },
  { id: 3, name: 'Dead Tree', proceduralType: 'DEAD_TREE', isWalkable: false },
  { id: 4, name: 'Bush', proceduralType: 'BUSH', isWalkable: false },
  { id: 5, name: 'Tree Stump', proceduralType: 'STUMP', isWalkable: false }
];

const WORLD_SIZE_CHUNKS = 100;
const CHUNK_SIZE = 8;
const BATCH_SIZE = 500;

const seedDatabaseDictionaries = async () => {
  for (const mat of MATERIALS) {
    await prisma.terrainMaterial.upsert({ where: { id: mat.id }, update: mat, create: mat });
  }
    for (const obj of OBJECTS) {
        await prisma.objectDefinition.upsert({
          where: { id: obj.id },
          update: {
            name: obj.name,
            modelId: obj.modelId || null,
            proceduralType: obj.proceduralType || null,
            isWalkable: obj.isWalkable,
            interactableData: obj.interactableData || "{}" // <--- ADD THIS
          },
          create: {
            id: obj.id,
            name: obj.name,
            modelId: obj.modelId || null,
            proceduralType: obj.proceduralType || null,
            isWalkable: obj.isWalkable,
            interactableData: obj.interactableData || "{}" // <--- ADD THIS
          }
        });
      }
};

const getTileData = (globalX, globalZ) => {
  const e1 = noise2D(globalX * 0.0008, globalZ * 0.0008) * 1.0;
  const e2 = noise2D(globalX * 0.004, globalZ * 0.004) * 0.5;
  const e3 = noise2D(globalX * 0.02, globalZ * 0.02) * 0.25;

  const elevation = (e1 + e2 + e3) / 1.75;
  const moisture = noise2D(globalX * 0.003 + 1000, globalZ * 0.003 + 1000);
  
  // High frequency noise for object scattering
  const scatterNoise = noise2D(globalX * 0.5, globalZ * 0.5);

  let textureId = 1;
  let isWalkable = true;
  let height = 0;
  let spawnObjId = null;

  if (elevation < -0.3) {
    height = Math.floor((elevation + 0.3) * 15) * 0.5;
    textureId = 3;
    isWalkable = false;
  } else if (elevation < -0.2) {
    height = 0;
    textureId = 3;
    isWalkable = true;
  } else {
    const baseHeight = elevation + 0.2;
    height = Math.floor(Math.pow(baseHeight, 2.5) * 80) * 0.5;

    if (elevation > 0.4) {
      textureId = 5; // Rock
      if (scatterNoise > 0.6) spawnObjId = 2; // Spawn Rock Prop
    } else {
      if (moisture < -0.2) {
        textureId = 4; // Dirt
        if (scatterNoise > 0.7) spawnObjId = 3; // Dead Tree
        else if (scatterNoise > 0.5) spawnObjId = 4; // Bush
      } else {
        textureId = 1; // Grass
        // Create dense forests and clearings
        const forestNoise = noise2D(globalX * 0.05, globalZ * 0.05);
        if (forestNoise > 0.2 && scatterNoise > 0.3) {
          spawnObjId = 1; // Pine Tree
        } else if (scatterNoise > 0.8) {
          spawnObjId = 5; // Stump
        } else if (scatterNoise > 0.6) {
          spawnObjId = 4; // Bush
        }
      }
    }
  }

  return { height, textureId, isWalkable, spawnObjId };
};

const generateChunks = async () => {
  console.log("Seeding materials and object definitions...");
  await seedDatabaseDictionaries();

  console.log("Calculating map chunks and spawns...");
  const allChunks = [];
  const allSpawns = [];

  for (let cx = 0; cx < WORLD_SIZE_CHUNKS; cx++) {
    for (let cz = 0; cz < WORLD_SIZE_CHUNKS; cz++) {
      const chunkId = `${cx}_${cz}`;
      const terrainData = [];

      for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          const globalX = cx * CHUNK_SIZE + x;
          const globalZ = cz * CHUNK_SIZE + z;
          
          const tile = getTileData(globalX, globalZ);
          terrainData.push({ height: tile.height, textureId: tile.textureId, isWalkable: tile.isWalkable });

          if (tile.spawnObjId) {
            allSpawns.push({
              chunkId: chunkId,
              x: globalX,
              y: globalZ,
              plane: 0,
              objectDefId: tile.spawnObjId,
              rotation: Math.floor(Math.random() * 360) // Random Y rotation
            });
          }
        }
      }

      allChunks.push({ id: chunkId, terrainData: JSON.stringify(terrainData) });
    }
  } // <--- CHUNK LOOPS END HERE

  // --- SAFE SPAWN LOGIC (MOVED OUTSIDE THE LOOP) ---
  console.log("Finding a safe spawn point...");
  let safeX = 400;
  let safeZ = 400;
  let found = false;

  // Scan from the center outward to find the first walkable grass tile
  for (let scan = 0; scan < 50 && !found; scan++) {
    const checkX = 400 + scan;
    const checkZ = 400 + scan;
    const tile = getTileData(checkX, checkZ);

    if (tile.isWalkable && tile.height >= 0 && !tile.spawnObjId) {
      safeX = checkX;
      safeZ = checkZ;
      found = true;
    }
  }

  await prisma.worldSettings.upsert({
    where: { id: 1 },
    update: { spawnX: safeX, spawnZ: safeZ },
    create: { id: 1, spawnX: safeX, spawnZ: safeZ }
  });

  console.log(`✅ Safe Spawn Point established at: X: ${safeX}, Z: ${safeZ}`);
  // --------------------------------------------------

  let createdChunks = 0;
  for (let i = 0; i < allChunks.length; i += BATCH_SIZE) {
    const chunkBatch = allChunks.slice(i, i + BATCH_SIZE);
    const batchIds = chunkBatch.map(c => c.id);
    
    // Filter spawns that belong to this chunk batch
    const spawnBatch = allSpawns.filter(s => batchIds.includes(s.chunkId));

    await prisma.mapSpawn.deleteMany({ where: { chunkId: { in: batchIds } } });
    await prisma.mapChunk.deleteMany({ where: { id: { in: batchIds } } });
    
    await prisma.mapChunk.createMany({ data: chunkBatch });
    if (spawnBatch.length > 0) {
      await prisma.mapSpawn.createMany({ data: spawnBatch });
    }
    
    createdChunks += chunkBatch.length;
    console.log(`Saved ${createdChunks} / ${allChunks.length} chunks (and props) to SQLite...`);
  }

  const meta = await prisma.cacheMeta.upsert({
    where: { id: 1 },
    update: { version: { increment: 1 } },
    create: { id: 1, version: 1 }
  });
  console.log(`📦 Global Cache bumped to v${meta.version}`);
};

generateChunks()
  .then(() => console.log('World generation complete!'))
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
