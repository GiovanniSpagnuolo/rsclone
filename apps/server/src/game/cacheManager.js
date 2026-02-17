import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const gameCache = {
  version: 0,
  objects: new Map()
};

export const loadCacheIntoRAM = async () => {
  let meta = await prisma.cacheMeta.findUnique({ where: { id: 1 } });
  
  if (!meta) {
    meta = await prisma.cacheMeta.create({ data: { id: 1, version: 1 } });
  }
  
  gameCache.version = meta.version;

  const objects = await prisma.objectDefinition.findMany();
  gameCache.objects.clear();
  
  for (const obj of objects) {
    gameCache.objects.set(obj.id, {
      ...obj,
      interactableData: JSON.parse(obj.interactableData || "{}"),
      lootTable: JSON.parse(obj.lootTable || "[]")
    });
  }
  
  console.log(`📦 Game Cache v${gameCache.version} loaded: ${objects.length} Object Definitions.`);
};

export const bumpCacheVersion = async () => {
  const meta = await prisma.cacheMeta.update({
    where: { id: 1 },
    data: { version: { increment: 1 } }
  });
  gameCache.version = meta.version;
  return meta.version;
};