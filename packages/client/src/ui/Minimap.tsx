//
//  Minimap.tsx
//  
//
//  Created by Giovanni Spagnuolo on 2/10/26.
//


// packages/client/src/ui/Minimap.tsx
import React, { useEffect, useRef } from "react";
import { WORLD_W, WORLD_H } from "@rsclone/shared/world";
import type { PlayerState, ResourceState } from "@rsclone/shared/protocol";
import { clamp, findClosestWalkable } from "./utils";

export type MinimapState = {
  youId: string | null;
  players: PlayerState[];
  resources: ResourceState[];
};

export function Minimap(props: {
  state: MinimapState;
  collision: number[][];
  flag: { x: number; y: number; placedAt: number } | null;
  onSetFlag: (f: { x: number; y: number; placedAt: number } | null) => void;
  onMoveTo: (t: { x: number; y: number }) => void;
}) {
  const { state, collision, flag, onSetFlag, onMoveTo } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const size = canvas.width;
    const radius = size / 2;
    const viewTiles = 28;
    const pxPerTile = size / viewTiles;

    let cx = WORLD_W / 2;
    let cy = WORLD_H / 2;

    if (state.youId) {
      const me = state.players.find((p) => p.id === state.youId);
      if (me) {
        cx = me.pos.x + 0.5;
        cy = me.pos.y + 0.5;
      }
    }

    function toMini(tx: number, ty: number) {
      const dx = (tx + 0.5 - cx) * pxPerTile;
      const dy = (ty + 0.5 - cy) * pxPerTile;
      return { x: radius + dx, y: radius + dy };
    }

    ctx.clearRect(0, 0, size, size);

    ctx.save();
    ctx.beginPath();
    ctx.arc(radius, radius, radius - 1, 0, Math.PI * 2);
    ctx.clip();

    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, size, size);

    const half = Math.floor(viewTiles / 2);
    const minX = clamp(Math.floor(cx) - half, 0, WORLD_W - 1);
    const maxX = clamp(Math.floor(cx) + half, 0, WORLD_W - 1);
    const minY = clamp(Math.floor(cy) - half, 0, WORLD_H - 1);
    const maxY = clamp(Math.floor(cy) + half, 0, WORLD_H - 1);

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const p = toMini(x, y);
        const left = p.x - pxPerTile / 2;
        const top = p.y - pxPerTile / 2;

        ctx.fillStyle = collision[y][x] === 1 ? "rgba(32,64,128,0.85)" : "rgba(20,20,20,0.55)";
        ctx.fillRect(left, top, pxPerTile, pxPerTile);
      }
    }

    for (const r of state.resources) {
      if (!r.alive) continue;
      const p = toMini(r.pos.x, r.pos.y);
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(2, pxPerTile * 0.18), 0, Math.PI * 2);
      ctx.fillStyle =
        r.type === "tree"
          ? "rgba(46,204,113,0.95)"
          : r.type === "rock"
          ? "rgba(180,180,180,0.95)"
          : "rgba(241,196,15,0.95)";
      ctx.fill();
    }

    for (const pl of state.players) {
      const p = toMini(pl.pos.x, pl.pos.y);
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(2.5, pxPerTile * 0.22), 0, Math.PI * 2);
      const isMe = state.youId && pl.id === state.youId;
      ctx.fillStyle = isMe ? "rgba(102,255,102,1)" : "rgba(102,153,255,0.95)";
      ctx.fill();
    }

    if (flag) {
      const p = toMini(flag.x, flag.y);
      ctx.save();
      ctx.translate(p.x, p.y);

      ctx.fillStyle = "rgba(255,60,60,0.95)";
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.lineTo(0, 10);
      ctx.lineTo(10, 0);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = "rgba(0,0,0,0.6)";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.restore();
    }

    ctx.restore();

    ctx.beginPath();
    ctx.arc(radius, radius, radius - 1, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }, [state, collision, flag]);

  function onClick(e: React.MouseEvent<HTMLDivElement>) {
    const wrap = e.currentTarget;
    const rect = wrap.getBoundingClientRect();

    const size = rect.width;
    const r = size / 2;

    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    const dx = px - r;
    const dy = py - r;
    if (dx * dx + dy * dy > (r - 2) * (r - 2)) return;

    const viewTiles = 28;
    const pxPerTile = size / viewTiles;

    let cx = WORLD_W / 2;
    let cy = WORLD_H / 2;

    if (state.youId) {
      const me = state.players.find((p) => p.id === state.youId);
      if (me) {
        cx = me.pos.x + 0.5;
        cy = me.pos.y + 0.5;
      }
    }

    const offTilesX = dx / pxPerTile;
    const offTilesY = dy / pxPerTile;

    const desiredX = Math.floor(cx + offTilesX);
    const desiredY = Math.floor(cy + offTilesY);

    const clamped = {
      x: clamp(desiredX, 0, WORLD_W - 1),
      y: clamp(desiredY, 0, WORLD_H - 1)
    };

    const target = findClosestWalkable(collision, clamped, 16);
    if (!target) return;

    onSetFlag({ ...target, placedAt: Date.now() });
    onMoveTo(target);
  }

  return (
    <div
      onClick={onClick}
      style={{
        position: "absolute",
        top: 12,
        right: 12,
        width: 180,
        height: 180,
        borderRadius: "50%",
        overflow: "hidden",
        background: "rgba(0,0,0,0.22)",
        border: "2px solid rgba(255,255,255,0.12)",
        boxShadow: "0 12px 28px rgba(0,0,0,0.45)",
        pointerEvents: "auto",
        cursor: "pointer",
        userSelect: "none"
      }}
      title="Click to move"
    >
      <canvas ref={canvasRef} width={180} height={180} style={{ width: "100%", height: "100%", display: "block" }} />
      <div
        style={{
          position: "absolute",
          inset: 0,
          color: "rgba(255,255,255,0.80)",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          fontSize: 12,
          letterSpacing: 0.5,
          pointerEvents: "none",
          textShadow: "0 1px 3px rgba(0,0,0,0.6)"
        }}
      >
        <div style={{ position: "absolute", top: 6, left: "50%", transform: "translateX(-50%)" }}>N</div>
        <div style={{ position: "absolute", bottom: 6, left: "50%", transform: "translateX(-50%)" }}>S</div>
        <div style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)" }}>E</div>
        <div style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)" }}>W</div>
      </div>
    </div>
  );
}
