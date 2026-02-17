import { getTile } from './mapManager.js';

class Node {
  constructor(x, y, g, h, parent) {
    this.x = x;
    this.y = y;
    this.g = g;
    this.h = h;
    this.f = g + h;
    this.parent = parent;
  }
}

const getHeuristic = (x1, y1, x2, y2) => {
  return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2));
};

const isWalkable = (x, y) => {
  const tile = getTile(x, y);
  return tile ? tile.isWalkable : false;
};

const getNeighbors = (node, targetX, targetY) => {
  const neighbors = [];
  
  // Define orthogonal (straight) and diagonal directions separately
  const orthogonals = [
    { x: 0, y: 1 }, { x: 1, y: 0 }, { x: 0, y: -1 }, { x: -1, y: 0 }
  ];
  
  const diagonals = [
    { x: 1, y: 1,  check: [{x: 1, y: 0}, {x: 0, y: 1}] },   // NE needs E and N
    { x: 1, y: -1, check: [{x: 1, y: 0}, {x: 0, y: -1}] },  // SE needs E and S
    { x: -1, y: 1, check: [{x: -1, y: 0}, {x: 0, y: 1}] },  // NW needs W and N
    { x: -1, y: -1,check: [{x: -1, y: 0}, {x: 0, y: -1}] }  // SW needs W and S
  ];

  // 1. Check straight moves
  for (const dir of orthogonals) {
    const nx = node.x + dir.x;
    const ny = node.y + dir.y;
    if (isWalkable(nx, ny)) {
      neighbors.push(new Node(nx, ny, node.g + 1, getHeuristic(nx, ny, targetX, targetY), node));
    }
  }

  // 2. Check diagonal moves with corner-blocking logic
  for (const dir of diagonals) {
    const nx = node.x + dir.x;
    const ny = node.y + dir.y;

    if (isWalkable(nx, ny)) {
      // THE FIX: Check if both adjacent tiles are walkable to prevent clipping
      const isBlockedByCorner = dir.check.some(adj => !isWalkable(node.x + adj.x, node.y + adj.y));
      
      if (!isBlockedByCorner) {
        neighbors.push(new Node(nx, ny, node.g + 1, getHeuristic(nx, ny, targetX, targetY), node));
      }
    }
  }
  
  return neighbors;
};

export const calculatePath = (startX, startY, targetX, targetY) => {
  const startNode = new Node(startX, startY, 0, getHeuristic(startX, startY, targetX, targetY), null);
  const openList = [startNode];
  const closedSet = new Set();

  let iterations = 0;
  const maxIterations = 1000; 

  while (openList.length > 0 && iterations < maxIterations) {
    iterations++;
    
    openList.sort((a, b) => a.f - b.f);
    const currentNode = openList.shift();

    if (currentNode.x === targetX && currentNode.y === targetY) {
      const path = [];
      let current = currentNode;
      while (current.parent) {
        path.push({ x: current.x, y: current.y });
        current = current.parent;
      }
      return path.reverse();
    }

    const nodeKey = `${currentNode.x},${currentNode.y}`;
    closedSet.add(nodeKey);

    const neighbors = getNeighbors(currentNode, targetX, targetY);

    for (const neighbor of neighbors) {
      const neighborKey = `${neighbor.x},${neighbor.y}`;
      if (closedSet.has(neighborKey)) continue;

      const existingOpenIndex = openList.findIndex(n => n.x === neighbor.x && n.y === neighbor.y);
      
      if (existingOpenIndex !== -1) {
        if (openList[existingOpenIndex].g <= neighbor.g) continue;
        openList.splice(existingOpenIndex, 1);
      }

      openList.push(neighbor);
    }
  }

  return [];
};