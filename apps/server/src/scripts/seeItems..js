//
//  seeItems..js
//  
//
//  Created by Giovanni Spagnuolo on 2/19/26.
//


const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Seeding Item Dictionary...');

  const items = [
    { id: 1511, name: 'Logs', cols: 1, rows: 3, color: '#6b4c2a' },
    { id: 436, name: 'Ore', cols: 1, rows: 1, color: '#b86633' },
    { id: 1351, name: 'Bronze Axe', cols: 2, rows: 3, color: '#cd7f32' },
    { id: 315, name: 'Shrimps', cols: 1, rows: 1, color: '#ffb6c1' }
  ];

  for (const item of items) {
    await prisma.itemDefinition.upsert({
      where: { id: item.id },
      update: item,
      create: item,
    });
  }

  console.log('✅ Item Dictionary Seeded!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });