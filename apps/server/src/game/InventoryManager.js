//
//  InventoryManager.js
//  
//
//  Created by Giovanni Spagnuolo on 2/18/26.
//


import crypto from 'crypto';

export const INVENTORY_COLS = 4;
export const INVENTORY_ROWS = 7;

// Temporary DB for item dimensions (Width x Height)
export const ITEM_SIZES = {
  1511: { cols: 1, rows: 3 }, // Logs (Tall)
  436:  { cols: 1, rows: 1 }  // Copper Ore (Small)
};

export const createEmptyInventory = () => ({
  grid: new Array(INVENTORY_COLS * INVENTORY_ROWS).fill(null),
  items: {} // Map of { guid: { id, rotated } }
});

// Ported from your prototype: Checks if a shape fits at a specific index
const checkSlots = (grid, startIndex, itemCols, itemRows, ignoreGuid = null) => {
  const startCol = startIndex % INVENTORY_COLS;
  const startRow = Math.floor(startIndex / INVENTORY_COLS);

  // Bounds check
  if (startCol + itemCols > INVENTORY_COLS || startRow + itemRows > INVENTORY_ROWS) {
    return false;
  }

  // Overlap check
  for (let r = 0; r < itemRows; r++) {
    for (let c = 0; c < itemCols; c++) {
      const index = (startRow + r) * INVENTORY_COLS + (startCol + c);
      const existing = grid[index];
      if (existing !== null && existing !== ignoreGuid) {
        return false;
      }
    }
  }
  return true;
};

const placeItemOnGrid = (grid, startIndex, itemCols, itemRows, guid) => {
  const startCol = startIndex % INVENTORY_COLS;
  const startRow = Math.floor(startIndex / INVENTORY_COLS);
  for (let r = 0; r < itemRows; r++) {
    for (let c = 0; c < itemCols; c++) {
      grid[(startRow + r) * INVENTORY_COLS + (startCol + c)] = guid;
    }
  }
};

const clearItemFromGrid = (grid, guid) => {
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === guid) grid[i] = null;
  }
};

// Used when gathering from the world: Auto-finds the first available space
export const attemptAddItem = (inventory, itemId) => {
  const size = ITEM_SIZES[itemId] || { cols: 1, rows: 1 };
  const guid = crypto.randomUUID();

  // Try fitting it normally
  for (let i = 0; i < inventory.grid.length; i++) {
    if (checkSlots(inventory.grid, i, size.cols, size.rows)) {
      inventory.items[guid] = { id: itemId, rotated: false };
      placeItemOnGrid(inventory.grid, i, size.cols, size.rows, guid);
      return true;
    }
  }

  // If normal fails, try rotating it
  if (size.cols !== size.rows) {
    for (let i = 0; i < inventory.grid.length; i++) {
      if (checkSlots(inventory.grid, i, size.rows, size.cols)) { // Swapped dimensions
        inventory.items[guid] = { id: itemId, rotated: true };
        placeItemOnGrid(inventory.grid, i, size.rows, size.cols, guid);
        return true;
      }
    }
  }

  return false; // Bag is totally full!
};

// Used when dragging/dropping in the UI
export const validateAndMoveItem = (inventory, guid, targetIndex, rotated) => {
  const item = inventory.items[guid];
  if (!item) return false;

  const size = ITEM_SIZES[item.id] || { cols: 1, rows: 1 };
  const checkCols = rotated ? size.rows : size.cols;
  const checkRows = rotated ? size.cols : size.rows;

  if (checkSlots(inventory.grid, targetIndex, checkCols, checkRows, guid)) {
    // Valid move!
    clearItemFromGrid(inventory.grid, guid);
    inventory.items[guid].rotated = rotated;
    placeItemOnGrid(inventory.grid, targetIndex, checkCols, checkRows, guid);
    return true;
  }

  return false;
};
