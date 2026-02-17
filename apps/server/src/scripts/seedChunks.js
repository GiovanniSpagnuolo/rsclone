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

const WORLD_SIZE_CHUNKS = 100;
const CHUNK_SIZE = 8;
const BATCH_SIZE = 500;

const seedMaterials = async () => {
  for (const mat of MATERIALS) {
    await prisma.terrainMaterial.upsert({
      where: { id: mat.id },
      update: mat,
      create: mat
    });
  }
};

const getTileData = (globalX, globalZ) => {
  // Stretched frequencies for much larger landmasses
  const e1 = noise2D(globalX * 0.0008, globalZ * 0.0008) * 1.0;
  const e2 = noise2D(globalX * 0.004, globalZ * 0.004) * 0.5;
  const e3 = noise2D(globalX * 0.02, globalZ * 0.02) * 0.25;

  const elevation = (e1 + e2 + e3) / 1.75;
  const moisture = noise2D(globalX * 0.003 + 1000, globalZ * 0.003 + 1000);

  let textureId = 1; 
  let isWalkable = true;
  let height = 0;

  if (elevation < -0.3) {
    // Pushed the threshold down to drastically reduce water
    height = 0;
    textureId = 2; 
    isWalkable = false;
  } else if (elevation < -0.2) {
    // Beaches
    height = 0.5;
    textureId = 3; 
  } else {
    // Exponential height scaling for massive mountains
    const baseHeight = elevation + 0.2; 
    height = Math.floor(Math.pow(baseHeight, 2.5) * 80) * 0.5;

    if (elevation > 0.4) {
      textureId = 5; 
    } else {
      if (moisture < -0.2) {
        textureId = 4; 
      } else {
        textureId = 1; 
      }
    }
  }

  return { height, textureId, isWalkable };
};

const generateChunks = async () => {
  console.log("Seeding materials...");
  await seedMaterials();

  console.log("Calculating map chunks...");
  const allChunks = [];

  for (let cx = 0; cx < WORLD_SIZE_CHUNKS; cx++) {
    for (let cz = 0; cz < WORLD_SIZE_CHUNKS; cz++) {
      const chunkId = `${cx}_${cz}`;

      const terrainData = [];
      for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          terrainData.push(getTileData(cx * CHUNK_SIZE + x, cz * CHUNK_SIZE + z));
        }
      }

      allChunks.push({
        id: chunkId,
        terrainData: JSON.stringify(terrainData)
      });
    }
  }

  let created = 0;
  for (let i = 0; i < allChunks.length; i += BATCH_SIZE) {
    const batch = allChunks.slice(i, i + BATCH_SIZE);
    const batchIds = batch.map(c => c.id);

    await prisma.mapSpawn.deleteMany({ where: { chunkId: { in: batchIds } } });
    await prisma.mapChunk.deleteMany({ where: { id: { in: batchIds } } });
    
    await prisma.mapChunk.createMany({ data: batch });
    
    created += batch.length;
    console.log(`Overwrote and saved ${created} / ${allChunks.length} chunks to SQLite...`);
  }

  if (created > 0) {
    const meta = await prisma.cacheMeta.upsert({
      where: { id: 1 },
      update: { version: { increment: 1 } },
      create: { id: 1, version: 1 }
    });
    console.log(`📦 Global Cache bumped to v${meta.version}`);
  }
};

generateChunks()
  .then(() => console.log('World generation complete!'))
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());