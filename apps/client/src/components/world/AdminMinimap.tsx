import { useMemo, useState, useEffect, useRef } from 'react';

interface AdminMinimapProps {
  chunks: Record<string, any[]>;
  materials: Record<string, any>;
  activeChunkIds: string[];
  setActiveChunkIds: React.Dispatch<React.SetStateAction<string[]>>;
  onGenerateChunk: (id: string) => void;
  onClose: () => void;
}

export const AdminMinimap = ({ chunks, materials, activeChunkIds, setActiveChunkIds, onGenerateChunk, onClose }: AdminMinimapProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [zoom, setZoom] = useState(2);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<{ x: number, y: number } | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<{ x: number, y: number } | null>(null);

  const { minX, maxX, minY, maxY } = useMemo(() => {
    let minX = 0, maxX = 0, minY = 0, maxY = 0;
    const keys = Object.keys(chunks);
    
    if (keys.length > 0) {
      minX = Infinity; maxX = -Infinity; minY = Infinity; maxY = -Infinity;
      keys.forEach(id => {
        const [x, y] = id.split('_').map(Number);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      });
    }
    
    return { minX: minX - 2, maxX: maxX + 2, minY: minY - 2, maxY: maxY + 2 };
  }, [chunks]);

  const mapWidthChunks = maxX - minX + 1;
  const mapHeightChunks = maxY - minY + 1;
  
  const canvasWidth = mapWidthChunks * 8;
  const canvasHeight = mapHeightChunks * 8;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    Object.entries(chunks).forEach(([id, tiles]) => {
      const [cx, cz] = id.split('_').map(Number);
      const offsetX = (cx - minX) * 8;
      const offsetZ = (cz - minY) * 8;

      tiles.forEach((tile, index) => {
        const tx = index % 8;
        const tz = Math.floor(index / 8);
        const mat = materials[tile.textureId] || materials[1];
        
        ctx.fillStyle = mat ? mat.color : '#FF00FF';
        ctx.fillRect(offsetX + tx, offsetZ + tz, 1, 1);
      });

      if (activeChunkIds.includes(id)) {
        ctx.fillStyle = 'rgba(255, 255, 0, 0.4)';
        ctx.fillRect(offsetX, offsetZ, 8, 8);
        ctx.strokeStyle = 'yellow';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(offsetX, offsetZ, 8, 8);
      }
    });

    if (isSelecting && selectionStart && selectionEnd) {
      const x = Math.min(selectionStart.x, selectionEnd.x);
      const y = Math.min(selectionStart.y, selectionEnd.y);
      const w = Math.abs(selectionStart.x - selectionEnd.x);
      const h = Math.abs(selectionStart.y - selectionEnd.y);

      ctx.fillStyle = 'rgba(0, 150, 255, 0.3)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'cyan';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, w, h);
    }
  }, [chunks, materials, activeChunkIds, minX, minY, canvasWidth, canvasHeight, isSelecting, selectionStart, selectionEnd]);

  const getMousePos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / zoom,
      y: (e.clientY - rect.top) / zoom
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsSelecting(true);
    const pos = getMousePos(e);
    setSelectionStart(pos);
    setSelectionEnd(pos);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isSelecting) return;
    setSelectionEnd(getMousePos(e));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    if (!isSelecting || !selectionStart || !selectionEnd) {
      setIsSelecting(false);
      return;
    }
    
    setIsSelecting(false);

    const x1 = Math.min(selectionStart.x, selectionEnd.x);
    const y1 = Math.min(selectionStart.y, selectionEnd.y);
    const x2 = Math.max(selectionStart.x, selectionEnd.x);
    const y2 = Math.max(selectionStart.y, selectionEnd.y);

    const startCX = Math.floor(x1 / 8) + minX;
    const startCY = Math.floor(y1 / 8) + minY;
    const endCX = Math.floor(x2 / 8) + minX;
    const endCY = Math.floor(y2 / 8) + minY;

    const newSelection: string[] = [];
    for (let x = startCX; x <= endCX; x++) {
      for (let y = startCY; y <= endCY; y++) {
        newSelection.push(`${x}_${y}`);
      }
    }

    if (e.shiftKey) {
      setActiveChunkIds(prev => Array.from(new Set([...prev, ...newSelection])));
    } else {
      setActiveChunkIds(newSelection);
    }
  };

  const generateMissingChunks = async () => {
    const missing = activeChunkIds.filter(id => !chunks[id]);
    for (const id of missing) {
      await onGenerateChunk(id);
    }
  };

  return (
    <div style={{
      position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
      backgroundColor: 'rgba(20,20,20,0.95)', padding: '20px', borderRadius: '8px',
      zIndex: 200, color: 'white', border: '2px solid #555', 
      width: '80vw', height: '80vh', display: 'flex', flexDirection: 'column'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>World Map</h3>
          <label style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
            Zoom: {zoom}x
            <input type="range" min="1" max="10" step="0.5" value={zoom} onChange={e => setZoom(Number(e.target.value))} />
          </label>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => setActiveChunkIds([])} style={{ background: '#333', color: 'white', border: 'none', padding: '6px 12px', cursor: 'pointer' }}>Clear Selection</button>
          <button onClick={generateMissingChunks} style={{ background: '#4CAF50', color: 'white', border: 'none', padding: '6px 12px', cursor: 'pointer' }}>Generate Missing Chunks</button>
          <button onClick={onClose} style={{ background: 'transparent', color: 'white', border: 'none', fontSize: '18px', cursor: 'pointer' }}>❌</button>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', border: '1px solid #444', backgroundColor: '#000', position: 'relative' }}>
        <p style={{ position: 'sticky', top: 5, left: 10, color: '#aaa', fontSize: '12px', margin: 0, pointerEvents: 'none', zIndex: 10 }}>
          Drag to select chunks. Hold SHIFT to add to selection.
        </p>
        <div style={{ 
          width: canvasWidth * zoom, 
          height: canvasHeight * zoom,
          transformOrigin: '0 0' 
        }}>
          <canvas
            ref={canvasRef}
            width={canvasWidth}
            height={canvasHeight}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onContextMenu={(e) => e.preventDefault()}
            style={{ 
              width: '100%', 
              height: '100%', 
              cursor: 'crosshair',
              imageRendering: 'pixelated'
            }}
          />
        </div>
      </div>
    </div>
  );
};