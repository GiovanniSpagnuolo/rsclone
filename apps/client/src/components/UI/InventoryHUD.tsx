//
//  InventoryHUD.tsx
//  
//
//  Created by Giovanni Spagnuolo on 2/18/26.
//


import { useState, useEffect, useRef } from 'react';
import { getSocket } from '../../network/socket';

const COLS = 4;
const ROWS = 7;
const SLOT_SIZE = 42;

// Must match the server's database/dictionary
const ITEM_SIZES: Record<number, { cols: number, rows: number, color: string, label: string }> = {
  1511: { cols: 1, rows: 3, color: '#6b4c2a', label: 'Logs' },
  436:  { cols: 1, rows: 1, color: '#b86633', label: 'Ore' }
};

export const InventoryHUD = () => {
  const [inventory, setInventory] = useState({ grid: new Array(COLS * ROWS).fill(null), items: {} as any });
  
  // Drag State
  const [dragInfo, setDragInfo] = useState<{ guid: string, x: number, y: number, rotated: boolean, valid: boolean } | null>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const dragState = useRef({ active: false, guid: '', startCol: 0, startRow: 0, offsetX: 0, offsetY: 0, rotated: false });

  // 1. Sync with Server
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const handleSync = (inv: any) => setInventory(inv);
    socket.on('sync_inventory', handleSync);
    return () => { socket.off('sync_inventory', handleSync); };
  }, []);

  // 2. Client-Side Collision Prediction
  const checkSlots = (targetCol: number, targetRow: number, itemCols: number, itemRows: number, ignoreGuid: string) => {
    if (targetCol < 0 || targetRow < 0 || targetCol + itemCols > COLS || targetRow + itemRows > ROWS) return false;
    for (let r = 0; r < itemRows; r++) {
      for (let c = 0; c < itemCols; c++) {
        const existing = inventory.grid[(targetRow + r) * COLS + (targetCol + c)];
        if (existing && existing !== ignoreGuid) return false;
      }
    }
    return true;
  };

  // 3. Drag Handlers
  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!dragState.current.active || !containerRef.current) return;
      
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left - dragState.current.offsetX;
      const y = e.clientY - rect.top - dragState.current.offsetY;

      const targetCol = Math.round(x / SLOT_SIZE);
      const targetRow = Math.round(y / SLOT_SIZE);
      
      const item = inventory.items[dragState.current.guid];
      const size = ITEM_SIZES[item.id];
      const checkCols = dragState.current.rotated ? size.rows : size.cols;
      const checkRows = dragState.current.rotated ? size.cols : size.rows;

      const valid = checkSlots(targetCol, targetRow, checkCols, checkRows, dragState.current.guid);

      setDragInfo({ guid: dragState.current.guid, x, y, rotated: dragState.current.rotated, valid });
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (!dragState.current.active || !containerRef.current) return;
      dragState.current.active = false;

      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left - dragState.current.offsetX;
      const y = e.clientY - rect.top - dragState.current.offsetY;

      const targetCol = Math.round(x / SLOT_SIZE);
      const targetRow = Math.round(y / SLOT_SIZE);
      const targetIndex = targetRow * COLS + targetCol;

      // Ask server to validate the drop
      const socket = getSocket();
      if (socket) {
        socket.emit('move_item', { 
          guid: dragState.current.guid, 
          targetIndex, 
          rotated: dragState.current.rotated 
        });
      }
      
      setDragInfo(null);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && dragState.current.active) {
        e.preventDefault();
        dragState.current.rotated = !dragState.current.rotated;
        
        // Swap offsets to pivot from the center
        const temp = dragState.current.offsetX;
        dragState.current.offsetX = dragState.current.offsetY;
        dragState.current.offsetY = temp;
        
        // Force an update
        setDragInfo(prev => prev ? { ...prev, rotated: dragState.current.rotated } : null);
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [inventory]);

  const startDrag = (e: React.PointerEvent, guid: string, startCol: number, startRow: number) => {
    e.preventDefault();
    const item = inventory.items[guid];
    
    // Calculate where inside the item the user clicked
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    dragState.current = {
      active: true, guid, startCol, startRow,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      rotated: item.rotated
    };
    
    setDragInfo({ 
      guid, rotated: item.rotated, valid: true,
      x: startCol * SLOT_SIZE, y: startRow * SLOT_SIZE 
    });
  };

  // 4. Render Engine
  const renderItems = () => {
    const renderedGuids = new Set();
    const elements: JSX.Element[] = [];

    inventory.grid.forEach((guid, index) => {
      if (!guid || renderedGuids.has(guid)) return;
      renderedGuids.add(guid);

      const item = inventory.items[guid];
      if (!item || !ITEM_SIZES[item.id]) return;

      const size = ITEM_SIZES[item.id];
      const isDragging = dragInfo?.guid === guid;
      
      // Determine Dimensions
      const rotated = isDragging ? dragInfo.rotated : item.rotated;
      const w = rotated ? size.rows : size.cols;
      const h = rotated ? size.cols : size.rows;

      // Determine Coordinates
      const col = index % COLS;
      const row = Math.floor(index / COLS);
      const left = isDragging ? dragInfo.x : col * SLOT_SIZE;
      const top = isDragging ? dragInfo.y : row * SLOT_SIZE;

      elements.push(
        <div
          key={guid}
          onPointerDown={(e) => startDrag(e, guid, col, row)}
          style={{
            position: 'absolute', left, top,
            width: w * SLOT_SIZE, height: h * SLOT_SIZE,
            backgroundColor: ITEM_SIZES[item.id].color,
            border: `1px solid ${isDragging ? (dragInfo.valid ? '#2ecc71' : '#e74c3c') : '#1a1101'}`,
            zIndex: isDragging ? 100 : 10,
            opacity: isDragging ? 0.8 : 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', fontSize: '12px', fontWeight: 'bold', textShadow: '1px 1px 0 #000',
            cursor: isDragging ? 'grabbing' : 'grab',
            boxShadow: isDragging ? '2px 5px 10px rgba(0,0,0,0.5)' : 'none',
            touchAction: 'none' // Crucial for dragging
          }}
        >
          {ITEM_SIZES[item.id].label}
        </div>
      );
    });
    return elements;
  };

  return (
    <div style={{
      position: 'absolute', bottom: 20, right: 20, width: (COLS * SLOT_SIZE) + 8,
      backgroundColor: '#4a3b22', border: '3px solid #2a1b02', borderRadius: '4px',
      display: 'flex', flexDirection: 'column', pointerEvents: 'auto',
      boxShadow: '4px 4px 10px rgba(0,0,0,0.5)', userSelect: 'none'
    }}>
      <div style={{
        height: '24px', backgroundColor: 'rgba(42, 27, 2, 0.8)',
        color: '#f0e68c', fontFamily: 'monospace', fontSize: '12px',
        display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '2px solid #1a1101'
      }}>
        Backpack
      </div>

      <div ref={containerRef} style={{ position: 'relative', width: COLS * SLOT_SIZE, height: ROWS * SLOT_SIZE, margin: '4px' }}>
        {/* Draw Background Grid Lines */}
        {Array.from({ length: COLS * ROWS }).map((_, i) => (
          <div key={i} style={{
            position: 'absolute',
            left: (i % COLS) * SLOT_SIZE, top: Math.floor(i / COLS) * SLOT_SIZE,
            width: SLOT_SIZE, height: SLOT_SIZE,
            backgroundColor: '#382b17', border: '1px inset #2a1b02', boxSizing: 'border-box',
              zIndex: 10
          }} />
        ))}
        {/* Draw Items */}
        {inventory.items && renderItems()}
      </div>
    </div>
  );
};
