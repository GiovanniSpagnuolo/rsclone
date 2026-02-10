export const WORLD_W = 40;
export const WORLD_H = 24;

// 0 = walkable, 1 = blocked
export function makeCollision(): number[][] {
  const grid = Array.from({ length: WORLD_H }, () => Array(WORLD_W).fill(0));

  // Border walls
  for (let x = 0; x < WORLD_W; x++) {
    grid[0][x] = 1;
    grid[WORLD_H - 1][x] = 1;
  }
  for (let y = 0; y < WORLD_H; y++) {
    grid[y][0] = 1;
    grid[y][WORLD_W - 1] = 1;
  }

  // A river (water) - unwalkable
  for (let x = 2; x < WORLD_W - 2; x++) {
    grid[12][x] = 1;
    if (x % 4 === 0) grid[11][x] = 1; // little jagged edges
  }

  // Some obstacles
  for (let y = 6; y < 18; y++) grid[y][12] = 1;
  for (let x = 18; x < 30; x++) grid[10][x] = 1;

  return grid;
}

export function inBounds(x: number, y: number) {
  return x >= 0 && y >= 0 && x < WORLD_W && y < WORLD_H;
}

export function isWalkable(grid: number[][], x: number, y: number) {
  return inBounds(x, y) && grid[y][x] === 0;
}
