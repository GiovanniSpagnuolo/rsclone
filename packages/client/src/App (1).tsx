// packages/client/src/App.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createGame } from "./game/createGame";
import { createGame3d } from "./game3d/createGame3d";
import type {
  ChatLine,
  PlayerState,
  ResourceState,
  Inventory,
  ItemId,
  AdminItemRow,
  AdminPlayerRow,
  AdminResourceDefRow,
  AdminResourceLootRow,
  AdminResourceSpawnRow,
  ResourceType,
  SkillName
} from "@rsclone/shared/protocol";
import { WORLD_W, WORLD_H, makeCollision } from "@rsclone/shared/world";

const API = "http://localhost:8081";

function fmtTime(ts: number) {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

type Skills = { woodcutting: number; mining: number; fishing: number };

type MinimapState = {
  youId: string | null;
  players: PlayerState[];
  resources: ResourceState[];
  cameraYawRad?: number;
};

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function findClosestWalkable(
  collision: number[][],
  start: { x: number; y: number },
  maxRadius = 12
) {
  const H = collision.length;
  const W = collision[0]?.length ?? 0;

  const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
  const walkable = (x: number, y: number) => inBounds(x, y) && collision[y][x] === 0;

  if (walkable(start.x, start.y)) return start;

  const q: Array<{ x: number; y: number }> = [];
  const seen = new Set<string>();
  const push = (x: number, y: number) => {
    const k = `${x},${y}`;
    if (seen.has(k)) return;
    seen.add(k);
    q.push({ x, y });
  };

  push(start.x, start.y);

  while (q.length) {
    const cur = q.shift()!;
    const dist = Math.abs(cur.x - start.x) + Math.abs(cur.y - start.y);
    if (dist > maxRadius) continue;

    if (walkable(cur.x, cur.y)) return cur;

    push(cur.x + 1, cur.y);
    push(cur.x - 1, cur.y);
    push(cur.x, cur.y + 1);
    push(cur.x, cur.y - 1);
  }

  return null;
}

const ITEM_NAME: Record<string, string> = {
  logs: "Logs",
  ore: "Ore",
  raw_fish: "Raw fish"
};

function itemName(id: ItemId | string) {
  return ITEM_NAME[id] ?? id;
}

type AdminSnapshot = {
  items: AdminItemRow[];
  resourceDefs: AdminResourceDefRow[];
  resourceLoot: AdminResourceLootRow[];
  resourceSpawns: AdminResourceSpawnRow[];
  players: AdminPlayerRow[];
};

type AdminTool =
  | { mode: "off" }
  | { mode: "place"; defId: string }
  | { mode: "remove" };

type AdminSend = (msg: any) => void;

function asInt(s: string, def = 0) {
  const n = Math.floor(Number(s));
  return Number.isFinite(n) ? n : def;
}

function boolFromAny(v: any) {
  return !!v;
}

function safeJsonString(v: string) {
  const t = (v ?? "").trim();
  if (!t) return "{}";
  // Accept raw text; validate lightly
  try {
    JSON.parse(t);
    return t;
  } catch {
    return "{}";
  }
}

function pillStyle(active: boolean) {
  return {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: active ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.04)",
    color: "rgba(255,255,255,0.92)",
    cursor: "pointer",
    fontWeight: 800 as const
  };
}

function smallBtnStyle(kind: "neutral" | "blue" | "red" = "neutral") {
  const bg =
    kind === "blue"
      ? "rgba(80,140,255,0.22)"
      : kind === "red"
      ? "rgba(255,80,80,0.18)"
      : "rgba(255,255,255,0.06)";
  return {
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.12)",
    background: bg,
    color: "rgba(255,255,255,0.92)",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 800 as const
  };
}

function inputStyle() {
  return {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.12)",
    outline: "none",
    background: "rgba(255,255,255,0.04)",
    color: "rgba(255,255,255,0.92)"
  } as const;
}

export default function App() {
  const hostRef = useRef<HTMLDivElement>(null);

  const [status, setStatus] = useState("connecting…");

  const [rendererMode] = useState<"2d" | "3d">("3d");
  const [token, setToken] = useState<string>(() => localStorage.getItem("token") ?? "");

  // auth form
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState("");

  const [emailOrUsername, setEmailOrUsername] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // chat
  const WORLD_LIMIT = 250;
  const PLAYER_LIMIT = 250;

  const [chatTab, setChatTab] = useState<"world" | "player">("player");
  const [worldLines, setWorldLines] = useState<ChatLine[]>([]);
  const [playerLines, setPlayerLines] = useState<ChatLine[]>([]);
  const [chatInput, setChatInput] = useState("");
  const chatBoxRef = useRef<HTMLDivElement>(null);

  function cap<T>(arr: T[], limit: number) {
    return arr.length > limit ? arr.slice(arr.length - limit) : arr;
  }

  // skills + inventory
  const [skills, setSkills] = useState<Skills | null>(null);
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [invFullFlash, setInvFullFlash] = useState(false);

  // minimap
  const [minimap, setMinimap] = useState<MinimapState>({
    youId: null,
    players: [],
    resources: []
  });
  const [minimapFlag, setMinimapFlag] = useState<{ x: number; y: number; placedAt: number } | null>(
    null
  );
  const minimapCanvasRef = useRef<HTMLCanvasElement>(null);
  const collision = useMemo(() => makeCollision(), []);

  // -------------------- Admin UI state --------------------
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminRights, setAdminRights] = useState(0);

  const [adminTab, setAdminTab] = useState<"map" | "items" | "resources" | "loot" | "players">("map");
    const [adminMinimized, setAdminMinimized] = useState(false);

  const [adminSnapshot, setAdminSnapshot] = useState<AdminSnapshot | null>(null);
  const [adminTool, setAdminTool] = useState<AdminTool>({ mode: "off" });

  const [selectedDefId, setSelectedDefId] = useState<string>("tree_basic");
  const [adminSearch, setAdminSearch] = useState("");

  // Editable copies + dirty tracking
  const [itemsDraft, setItemsDraft] = useState<AdminItemRow[]>([]);
  const [defsDraft, setDefsDraft] = useState<AdminResourceDefRow[]>([]);
  const [playersDraft, setPlayersDraft] = useState<AdminPlayerRow[]>([]);
  const [lootDraftByRes, setLootDraftByRes] = useState<Record<string, AdminResourceLootRow[]>>({});

  const [dirtyItems, setDirtyItems] = useState<Set<string>>(new Set());
  const [dirtyDefs, setDirtyDefs] = useState<Set<string>>(new Set());
  const [dirtyPlayers, setDirtyPlayers] = useState<Set<string>>(new Set());
  const [dirtyLoot, setDirtyLoot] = useState<Set<string>>(new Set());

  const adminSend: AdminSend | null = (window as any).__adminSend ?? null;

  function adminSendOrError(msg: any) {
    const sendFn = (window as any).__adminSend as AdminSend | undefined;
    if (!sendFn) {
      (window as any).__chatPush?.({
        id: crypto.randomUUID(),
        ts: Date.now(),
        from: { id: "system", name: "System" },
        text: "Admin send not wired yet. Next step: update createGame3d.ts to expose window.__adminSend."
      } satisfies ChatLine);
      return;
    }
    sendFn(msg);
  }

  function refreshSnapshot() {
    (window as any).__adminGetSnapshot?.();
  }

  // When snapshot arrives, seed drafts
  function seedFromSnapshot(snap: AdminSnapshot) {
    setItemsDraft(snap.items.map((x) => ({ ...x })));
    setDefsDraft(snap.resourceDefs.map((x) => ({ ...x })));
    setPlayersDraft(snap.players.map((x) => ({ ...x })));

    const byRes: Record<string, AdminResourceLootRow[]> = {};
    for (const def of snap.resourceDefs) byRes[def.id] = [];
    for (const row of snap.resourceLoot) {
      (byRes[row.resourceId] ??= []).push({ ...row });
    }
    for (const k of Object.keys(byRes)) {
      byRes[k].sort((a, b) => (a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0));
    }
    setLootDraftByRes(byRes);

    setDirtyItems(new Set());
    setDirtyDefs(new Set());
    setDirtyPlayers(new Set());
    setDirtyLoot(new Set());

    // keep selected defId valid
    if (snap.resourceDefs.length && !snap.resourceDefs.some((d) => d.id === selectedDefId)) {
      setSelectedDefId(snap.resourceDefs[0].id);
    }
  }

  // Bridge: game -> React
  useEffect(() => {
    (window as any).__chatPush = (line: ChatLine | ChatLine[]) => {
      const add = Array.isArray(line) ? line : [line];
      const sys = add.filter((l) => l.from.id === "system");
      const ply = add.filter((l) => l.from.id !== "system");

      if (sys.length) setWorldLines((prev) => cap([...prev, ...sys], WORLD_LIMIT));
      if (ply.length) setPlayerLines((prev) => cap([...prev, ...ply], PLAYER_LIMIT));
    };

    // React owns these — game layer should never null them out.
    (window as any).__skillsSet = (s: Skills) => setSkills(s);
    (window as any).__invSet = (inv: Inventory) => setInventory(inv);
    (window as any).__invFull = () => {
      setInvFullFlash(true);
      window.setTimeout(() => setInvFullFlash(false), 1400);
    };

    (window as any).__minimapUpdate = (state: MinimapState) => setMinimap(state);

    // ---- Admin bridges ----
      (window as any).__adminOpen = (rights: number) => {
        setAdminRights(Math.max(0, rights | 0));
        setAdminOpen(true);
        setAdminMinimized(false); // ✅ add this
        setAdminTab("map");
        setAdminSearch("");
        (window as any).__adminGetSnapshot?.();
      };

    (window as any).__adminSnapshot = (snap: AdminSnapshot) => {
      setAdminSnapshot(snap);
      seedFromSnapshot(snap);
    };

    (window as any).__adminError = (err: string) => {
      (window as any).__chatPush?.({
        id: crypto.randomUUID(),
        ts: Date.now(),
        from: { id: "system", name: "System" },
        text: `Admin error: ${err}`
      } satisfies ChatLine);
    };

    return () => {
      (window as any).__chatPush = null;
      (window as any).__skillsSet = null;
      (window as any).__invSet = null;
      (window as any).__invFull = null;
      (window as any).__minimapUpdate = null;

      (window as any).__adminOpen = null;
      (window as any).__adminSnapshot = null;
      (window as any).__adminError = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep admin tool mirrored to 3D layer
  useEffect(() => {
    (window as any).__adminTool = adminTool;
  }, [adminTool]);

  const activeLines = chatTab === "world" ? worldLines : playerLines;

  useEffect(() => {
    const el = chatBoxRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [activeLines, chatTab]);

  // Create/destroy main game renderer
  useEffect(() => {
    if (!hostRef.current) return;
    if (!token) return;

    setWorldLines([]);
    setPlayerLines([]);
    setSkills(null);
    setInventory(null);
    setInvFullFlash(false);
    setMinimap({ youId: null, players: [], resources: [] });
    setMinimapFlag(null);

    setAdminOpen(false);
    setAdminRights(0);
    setAdminSnapshot(null);
    setAdminTool({ mode: "off" });

    setItemsDraft([]);
    setDefsDraft([]);
    setPlayersDraft([]);
    setLootDraftByRes({});
    setDirtyItems(new Set());
    setDirtyDefs(new Set());
    setDirtyPlayers(new Set());
    setDirtyLoot(new Set());

    const game =
      rendererMode === "3d"
        ? createGame3d(hostRef.current, token)
        : createGame(hostRef.current, token);

    game.setStatusText(setStatus);

    return () => game.destroy();
  }, [token, rendererMode]);

  // Draw minimap whenever state changes
  useEffect(() => {
    const canvas = minimapCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const size = canvas.width;
    const radius = size / 2;

    const viewTiles = 28;
    const pxPerTile = size / viewTiles;

    let cx = WORLD_W / 2;
    let cy = WORLD_H / 2;

    if (minimap.youId) {
      const me = minimap.players.find((p) => p.id === minimap.youId);
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

        if (collision[y][x] === 1) ctx.fillStyle = "rgba(32,64,128,0.85)";
        else ctx.fillStyle = "rgba(20,20,20,0.55)";

        ctx.fillRect(left, top, pxPerTile, pxPerTile);
      }
    }

    for (const r of minimap.resources) {
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

    for (const pl of minimap.players) {
      const p = toMini(pl.pos.x, pl.pos.y);
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(2.5, pxPerTile * 0.22), 0, Math.PI * 2);
      const isMe = minimap.youId && pl.id === minimap.youId;
      ctx.fillStyle = isMe ? "rgba(102,255,102,1)" : "rgba(102,153,255,0.95)";
      ctx.fill();
    }

    if (minimapFlag) {
      const p = toMini(minimapFlag.x, minimapFlag.y);
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
  }, [minimap, collision, minimapFlag]);

  // Clear flag when you arrive or after timeout
  useEffect(() => {
    if (!minimapFlag) return;

    const me = minimap.youId ? minimap.players.find((p) => p.id === minimap.youId) : null;
    if (me && me.pos.x === minimapFlag.x && me.pos.y === minimapFlag.y) {
      setMinimapFlag(null);
      return;
    }

    const t = window.setTimeout(() => setMinimapFlag(null), 10000);
    return () => window.clearTimeout(t);
  }, [minimap, minimapFlag]);

  function onMinimapClick(e: React.MouseEvent<HTMLDivElement>) {
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

    if (minimap.youId) {
      const me = minimap.players.find((p) => p.id === minimap.youId);
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

    setMinimapFlag({ ...target, placedAt: Date.now() });

    const fn = (window as any).__moveTo as ((t: { x: number; y: number }) => void) | null;
    fn?.(target);
  }

  async function submit() {
    setError("");
    try {
      const res = await fetch(`${API}/auth/${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body:
          mode === "login"
            ? JSON.stringify({ emailOrUsername, password })
            : JSON.stringify({ email, username, password })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Request failed");

      localStorage.setItem("token", data.token);
      setToken(data.token);
    } catch (e: any) {
      setError(e?.message ?? "Failed");
    }
  }

  function logout() {
    localStorage.removeItem("token");
    setToken("");
    setSkills(null);
    setInventory(null);
    setWorldLines([]);
    setPlayerLines([]);
    setMinimap({ youId: null, players: [], resources: [] });
    setMinimapFlag(null);

    setAdminOpen(false);
    setAdminRights(0);
    setAdminSnapshot(null);
    setAdminTool({ mode: "off" });
  }

  const canSend = useMemo(() => chatInput.trim().length > 0, [chatInput]);

  function sendChat() {
    const text = chatInput.trim();
    if (!text) return;

    const fn = (window as any).__chatSend as ((t: string) => void) | null;
    fn?.(text);
    setChatInput("");
  }

  // -------------------- LOGIN / REGISTER --------------------
  if (!token) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background:
            "radial-gradient(1200px 800px at 30% 20%, rgba(80,140,255,0.14), transparent 60%), #07090f",
          color: "#e6e8ef",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
        }}
      >
        <div
          style={{
            width: 420,
            minWidth: 320,
            maxWidth: "min(420px, calc(100vw - 24px))",
            background: "rgba(10,12,18,0.85)",
            border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: 14,
            padding: 18,
            boxShadow: "0 20px 70px rgba(0,0,0,0.55)"
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>RS Clone</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Welcome back</div>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button onClick={() => setMode("login")} style={pillStyle(mode === "login")}>
              Login
            </button>
            <button onClick={() => setMode("register")} style={pillStyle(mode === "register")}>
              Register
            </button>
          </div>

          <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
            {mode === "register" && (
              <>
                <div>
                  <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Email</div>
                  <input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" style={inputStyle()} />
                </div>

                <div>
                  <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Username</div>
                  <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" style={inputStyle()} />
                </div>
              </>
            )}

            {mode === "login" && (
              <div>
                <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Email or Username</div>
                <input value={emailOrUsername} onChange={(e) => setEmailOrUsername(e.target.value)} autoComplete="username" style={inputStyle()} />
              </div>
            )}

            <div>
              <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Password</div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                style={inputStyle()}
              />
            </div>

            <button
              onClick={submit}
              style={{
                marginTop: 2,
                width: "100%",
                padding: "11px 12px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(80,140,255,0.22)",
                color: "#e6e8ef",
                cursor: "pointer",
                fontWeight: 700
              }}
            >
              {mode === "login" ? "Login" : "Create account"}
            </button>

            {error && (
              <div
                style={{
                  marginTop: 4,
                  padding: "10px 12px",
                  borderRadius: 10,
                  background: "rgba(255,60,60,0.12)",
                  border: "1px solid rgba(255,60,60,0.25)",
                  color: "rgba(255,220,220,0.95)",
                  fontSize: 13
                }}
              >
                {error}
              </div>
            )}

            <div style={{ marginTop: 4, fontSize: 12, opacity: 0.65 }}>
              Token stored in localStorage (dev).
            </div>
          </div>
        </div>
      </div>
    );
  }

  // -------------------- IN-GAME --------------------
  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", background: "#000", position: "relative" }}>
      {/* Fullscreen game */}
      <div ref={hostRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "hidden" }} />

      {/* Status + skills */}
      <div
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          padding: "8px 10px",
          borderRadius: 10,
          background: "rgba(0,0,0,0.45)",
          border: "1px solid rgba(255,255,255,0.10)",
          color: "rgba(255,255,255,0.88)",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          fontSize: 12,
          pointerEvents: "none"
        }}
      >
        <div style={{ opacity: 0.85 }}>{status}</div>
        <div style={{ marginTop: 2, opacity: 0.8 }}>
          {skills ? `XP  WC:${skills.woodcutting}  MIN:${skills.mining}  FSH:${skills.fishing}` : "XP —"}
        </div>
      </div>

      {/* Minimap */}
      <div
        onClick={onMinimapClick}
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
        <canvas ref={minimapCanvasRef} width={180} height={180} style={{ width: "100%", height: "100%", display: "block" }} />
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

      {/* Inventory */}
      <div
        style={{
          position: "absolute",
          right: 12,
          bottom: 64,
          width: 300,
          background: "rgba(0,0,0,0.55)",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 12,
          padding: 10,
          boxShadow: "0 12px 28px rgba(0,0,0,0.45)",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          color: "rgba(255,255,255,0.92)"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 13, fontWeight: 700, opacity: 0.95 }}>Inventory</div>
          <div style={{ fontSize: 11, opacity: 0.7 }}>30 slots</div>
        </div>

        {invFullFlash && (
          <div
            style={{
              marginTop: 8,
              padding: "8px 10px",
              borderRadius: 10,
              background: "rgba(255,60,60,0.14)",
              border: "1px solid rgba(255,60,60,0.25)",
              color: "rgba(255,220,220,0.95)",
              fontSize: 12
            }}
          >
            Inventory is full
          </div>
        )}

        <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
          {Array.from({ length: 30 }, (_, i) => {
            const slot = inventory?.[i] ?? null;

            return (
              <div
                key={i}
                title={slot ? `${itemName(slot.itemId)} x${slot.qty}` : "Empty"}
                style={{
                  height: 48,
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: slot ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.03)",
                  display: "grid",
                  placeItems: "center",
                  position: "relative",
                  userSelect: "none"
                }}
              >
                <div style={{ position: "absolute", left: 6, top: 4, fontSize: 10, opacity: 0.35 }}>
                  {i + 1}
                </div>

                {slot ? (
                  <>
                    <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.95 }}>{itemName(slot.itemId)}</div>
                    <div
                      style={{
                        position: "absolute",
                        right: 6,
                        bottom: 4,
                        fontSize: 11,
                        opacity: 0.85,
                        fontVariantNumeric: "tabular-nums"
                      }}
                    >
                      {slot.qty}
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 11, opacity: 0.35 }}>—</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Chat */}
      <div
        style={{
          position: "absolute",
          left: 12,
          bottom: 12,
          width: 420,
          minWidth: 320,
          maxWidth: "min(420px, calc(100vw - 24px))",
          background: "rgba(0,0,0,0.55)",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 12,
          padding: 10,
          fontFamily: `"RuneScape UF","RuneScape","Verdana",system-ui,sans-serif`,
          color: "white",
          boxSizing: "border-box"
        }}
      >
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 2,
            paddingBottom: 8,
            marginBottom: 8,
            background: "rgba(0,0,0,0.35)",
            backdropFilter: "blur(6px)"
          }}
        >
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setChatTab("world")}
              style={{
                flex: 1,
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.12)",
                background: chatTab === "world" ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.04)",
                color: "rgba(255,255,255,0.90)",
                cursor: "pointer"
              }}
            >
              World <span style={{ opacity: 0.7 }}>({worldLines.length})</span>
            </button>

            <button
              onClick={() => setChatTab("player")}
              style={{
                flex: 1,
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.12)",
                background: chatTab === "player" ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.04)",
                color: "rgba(255,255,255,0.90)",
                cursor: "pointer"
              }}
            >
              Player <span style={{ opacity: 0.7 }}>({playerLines.length})</span>
            </button>
          </div>
        </div>

        <div ref={chatBoxRef} style={{ height: 140, overflowY: "auto", paddingRight: 6, fontSize: 12 }}>
          {(chatTab === "world" ? worldLines : playerLines).map((l) => (
            <div key={l.id} style={{ marginBottom: 4, opacity: l.from.id === "system" ? 0.92 : 1 }}>
              <span style={{ opacity: 0.65 }}>[{fmtTime(l.ts)}] </span>
              <span style={{ fontWeight: 650 }}>{l.from.name}: </span>
              <span style={{ opacity: 0.95 }}>{l.text}</span>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSend) sendChat();
            }}
            placeholder="Type message…"
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.12)",
              outline: "none",
              background: "rgba(255,255,255,0.04)",
              color: "#e6e8ef"
            }}
          />
          <button
            onClick={sendChat}
            disabled={!canSend}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.12)",
              background: canSend ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.04)",
              color: "rgba(255,255,255,0.90)",
              cursor: canSend ? "pointer" : "default",
              opacity: canSend ? 1 : 0.7
            }}
          >
            Send
          </button>
        </div>
      </div>

      {/* Logout */}
      <button
        onClick={logout}
        style={{
          position: "absolute",
          right: 12,
          bottom: 12,
          padding: "10px 12px",
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(0,0,0,0.45)",
          color: "rgba(255,255,255,0.9)",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          fontSize: 12,
          cursor: "pointer",
          boxShadow: "0 12px 28px rgba(0,0,0,0.45)"
        }}
      >
        Logout
      </button>


          
          
          {/* -------------------- ADMIN MODAL + MINIDOCK -------------------- */}
          {adminOpen && !adminMinimized && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "rgba(0,0,0,0.55)",
                display: "grid",
                placeItems: "center",
                zIndex: 50
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  width: 980,
                  maxWidth: "min(980px, calc(100vw - 24px))",
                  height: 620,
                  maxHeight: "min(620px, calc(100vh - 24px))",
                  background: "rgba(12,14,20,0.96)",
                  border: "1px solid rgba(255,255,255,0.14)",
                  borderRadius: 14,
                  boxShadow: "0 30px 90px rgba(0,0,0,0.70)",
                  color: "rgba(255,255,255,0.92)",
                  fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
                  display: "grid",
                  gridTemplateRows: "auto 1fr"
                }}
              >
                {/* Header */}
                <div
                  style={{
                    padding: 12,
                    borderBottom: "1px solid rgba(255,255,255,0.10)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10
                  }}
                >
                  <div style={{ display: "grid" }}>
                    <div style={{ fontWeight: 900, letterSpacing: 0.2 }}>Admin</div>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>rights: {adminRights}</div>
                  </div>

                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button onClick={refreshSnapshot} style={smallBtnStyle("neutral")}>
                      Refresh
                    </button>

                    <button
                      onClick={() => setAdminMinimized(true)}
                      style={smallBtnStyle("neutral")}
                      title="Minimize so you can click the world to place/remove"
                    >
                      Minimize
                    </button>

                    <button
                      onClick={() => {
                        setAdminOpen(false);
                        setAdminMinimized(false);
                        setAdminTool({ mode: "off" });
                      }}
                      style={smallBtnStyle("red")}
                    >
                      Close
                    </button>
                  </div>
                </div>

                {/* Body */}
                <div style={{ display: "grid", gridTemplateColumns: "250px 1fr", height: "100%" }}>
                  {/* Left nav */}
                  <div
                    style={{
                      padding: 12,
                      borderRight: "1px solid rgba(255,255,255,0.10)",
                      display: "grid",
                      gap: 10,
                      alignContent: "start"
                    }}
                  >
                    <button onClick={() => setAdminTab("map")} style={pillStyle(adminTab === "map")}>
                      Map editor
                      {adminTool.mode !== "off" && <span style={{ marginLeft: 8, opacity: 0.65 }}>●</span>}
                    </button>

                    <button onClick={() => setAdminTab("items")} style={pillStyle(adminTab === "items")}>
                      Items
                      {dirtyItems.size > 0 && <span style={{ marginLeft: 8, opacity: 0.65 }}>●</span>}
                    </button>

                    <button onClick={() => setAdminTab("resources")} style={pillStyle(adminTab === "resources")}>
                      Resource defs
                      {dirtyDefs.size > 0 && <span style={{ marginLeft: 8, opacity: 0.65 }}>●</span>}
                    </button>

                    <button onClick={() => setAdminTab("loot")} style={pillStyle(adminTab === "loot")}>
                      Loot tables
                      {dirtyLoot.size > 0 && <span style={{ marginLeft: 8, opacity: 0.65 }}>●</span>}
                    </button>

                    <button onClick={() => setAdminTab("players")} style={pillStyle(adminTab === "players")}>
                      Players
                      {dirtyPlayers.size > 0 && <span style={{ marginLeft: 8, opacity: 0.65 }}>●</span>}
                    </button>

                    <div
                      style={{
                        padding: 10,
                        borderRadius: 12,
                        border: "1px solid rgba(255,255,255,0.10)",
                        background: "rgba(255,255,255,0.04)",
                        fontSize: 12,
                        opacity: 0.92,
                        lineHeight: 1.35
                      }}
                    >
                      <div style={{ fontWeight: 900, marginBottom: 6 }}>Tip</div>
                      <div>
                        Open with <code>::admin</code> in chat.
                      </div>
                      <div style={{ marginTop: 6, opacity: 0.8 }}>
                        While minimized, click the <b>3D world</b> to place/remove.
                      </div>
                    </div>

                    <div
                      style={{
                        padding: 10,
                        borderRadius: 12,
                        border: "1px solid rgba(255,255,255,0.10)",
                        background: "rgba(255,255,255,0.03)",
                        fontSize: 12
                      }}
                    >
                      <div style={{ opacity: 0.75 }}>Snapshot</div>
                      <div style={{ display: "grid", gap: 2, marginTop: 6 }}>
                        <div>
                          Items: <b>{adminSnapshot?.items?.length ?? 0}</b>
                        </div>
                        <div>
                          Resource defs: <b>{adminSnapshot?.resourceDefs?.length ?? 0}</b>
                        </div>
                        <div>
                          Loot rows: <b>{adminSnapshot?.resourceLoot?.length ?? 0}</b>
                        </div>
                        <div>
                          Spawns: <b>{adminSnapshot?.resourceSpawns?.length ?? 0}</b>
                        </div>
                        <div>
                          Players: <b>{adminSnapshot?.players?.length ?? 0}</b>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right panel */}
                  <div style={{ padding: 12, overflow: "auto" }}>
                    {/* MAP */}
                    {adminTab === "map" && (
                      <div style={{ display: "grid", gap: 12 }}>
                        <div style={{ fontSize: 18, fontWeight: 900 }}>Map editor</div>

                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr auto",
                            gap: 10,
                            alignItems: "end"
                          }}
                        >
                          <div>
                            <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Resource def</div>
                            <select
                              value={selectedDefId}
                              onChange={(e) => setSelectedDefId(e.target.value)}
                              style={inputStyle()}
                            >
                              {(defsDraft.length ? defsDraft : [{ id: "tree_basic" } as any]).map((d: any) => (
                                <option key={d.id} value={d.id}>
                                  {d.id}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                            <button
                              onClick={() => setAdminTool({ mode: "place", defId: selectedDefId })}
                              style={smallBtnStyle("blue")}
                            >
                              Place
                            </button>
                            <button onClick={() => setAdminTool({ mode: "remove" })} style={smallBtnStyle("red")}>
                              Remove
                            </button>
                            <button onClick={() => setAdminTool({ mode: "off" })} style={smallBtnStyle("neutral")}>
                              Off
                            </button>
                          </div>
                        </div>

                        <div
                          style={{
                            padding: 12,
                            borderRadius: 12,
                            border: "1px solid rgba(255,255,255,0.10)",
                            background: "rgba(255,255,255,0.04)",
                            fontSize: 12,
                            lineHeight: 1.35
                          }}
                        >
                          With a tool active, <b>Minimize</b> and click the 3D world:
                          <ul style={{ marginTop: 6, marginBottom: 0, paddingLeft: 18 }}>
                            <li>
                              <b>Place</b>: sends <code>adminPlaceSpawn</code> for that tile
                            </li>
                            <li>
                              <b>Remove</b>: sends <code>adminRemoveSpawn</code> for that tile
                            </li>
                          </ul>
                        </div>

                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                          <div
                            style={{
                              padding: 12,
                              borderRadius: 12,
                              border: "1px solid rgba(255,255,255,0.10)",
                              background: "rgba(255,255,255,0.03)",
                              minWidth: 220
                            }}
                          >
                            <div style={{ fontSize: 12, opacity: 0.75 }}>Placed spawns</div>
                            <div style={{ fontSize: 22, fontWeight: 900 }}>{adminSnapshot?.resourceSpawns?.length ?? 0}</div>
                          </div>

                          <div
                            style={{
                              padding: 12,
                              borderRadius: 12,
                              border: "1px solid rgba(255,255,255,0.10)",
                              background: "rgba(255,255,255,0.03)",
                              minWidth: 220
                            }}
                          >
                            <div style={{ fontSize: 12, opacity: 0.75 }}>Active tool</div>
                            <div style={{ fontSize: 16, fontWeight: 900 }}>
                              {adminTool.mode === "off"
                                ? "Off"
                                : adminTool.mode === "remove"
                                ? "Remove"
                                : `Place (${adminTool.defId})`}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                            {/* ITEMS */}
                            {adminTab === "items" && (
                              <div style={{ display: "grid", gap: 10 }}>
                                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                                  <div style={{ fontSize: 18, fontWeight: 900 }}>Items</div>
                                  <div style={{ display: "flex", gap: 8 }}>
                                    <button
                                      onClick={() => {
                                        const id = `new_item_${crypto.randomUUID().slice(0, 6)}`;
                                        setItemsDraft((prev) => [
                                          { id, name: "New Item", itemType: "misc", equipSlot: null, stackable: true, stackLimit: 999, splittable: true, consumable: false, metaJson: "{}" },
                                          ...prev
                                        ]);
                                        setDirtyItems((s) => new Set([...s, id]));
                                      }}
                                      style={smallBtnStyle("blue")}
                                    >
                                      + Add
                                    </button>

                                    <button
                                      onClick={() => {
                                        const ids = Array.from(dirtyItems);
                                        for (const id of ids) {
                                          const row = itemsDraft.find((x) => x.id === id);
                                          if (!row) continue;
                                          adminSendOrError({ t: "adminUpsertItem", item: row });
                                        }
                                      }}
                                      style={smallBtnStyle("neutral")}
                                    >
                                      Save ({dirtyItems.size})
                                    </button>
                                  </div>
                                </div>

                                <div style={{ fontSize: 12, opacity: 0.75 }}>
                                  Edit cells. Dirty rows are marked with ● and will be saved.
                                </div>

                                <div style={{ border: "1px solid rgba(255,255,255,0.10)", borderRadius: 12, overflow: "hidden" }}>
                                  <div
                                    style={{
                                      display: "grid",
                                      gridTemplateColumns: "180px 180px 120px 120px 80px 90px 90px 90px 1fr",
                                      gap: 0,
                                      background: "rgba(255,255,255,0.06)",
                                      fontSize: 12,
                                      fontWeight: 900,
                                      padding: "10px 10px"
                                    }}
                                  >
                                    <div>ID</div>
                                    <div>Name</div>
                                    <div>Type</div>
                                    <div>Equip</div>
                                    <div>Stack?</div>
                                    <div>Limit</div>
                                    <div>Split?</div>
                                    <div>Cons?</div>
                                    <div>Meta JSON</div>
                                  </div>

                                  <div style={{ maxHeight: 420, overflow: "auto" }}>
                                    {itemsDraft
                                      .filter((r) => {
                                        const q = adminSearch.trim().toLowerCase();
                                        if (!q) return true;
                                        return (
                                          r.id.toLowerCase().includes(q) ||
                                          r.name.toLowerCase().includes(q) ||
                                          r.itemType.toLowerCase().includes(q)
                                        );
                                      })
                                      .map((r) => {
                                        const isDirty = dirtyItems.has(r.id);
                                        const markDirty = () => setDirtyItems((s) => new Set([...s, r.id]));

                                        const set = (patch: Partial<AdminItemRow>) => {
                                          setItemsDraft((prev) => prev.map((x) => (x.id === r.id ? { ...x, ...patch } : x)));
                                          markDirty();
                                        };

                                        return (
                                          <div
                                            key={r.id}
                                            style={{
                                              display: "grid",
                                              gridTemplateColumns: "180px 180px 120px 120px 80px 90px 90px 90px 1fr",
                                              padding: "8px 10px",
                                              borderTop: "1px solid rgba(255,255,255,0.08)",
                                              fontSize: 12,
                                              alignItems: "center",
                                              background: isDirty ? "rgba(80,140,255,0.08)" : "transparent"
                                            }}
                                          >
                                            <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                                              {r.id} {isDirty && <span style={{ opacity: 0.7 }}>●</span>}
                                            </div>
                                            <input value={r.name} onChange={(e) => set({ name: e.target.value })} style={inputStyle()} />
                                            <input value={r.itemType} onChange={(e) => set({ itemType: e.target.value })} style={inputStyle()} />
                                            <input value={r.equipSlot ?? ""} onChange={(e) => set({ equipSlot: e.target.value.trim() ? e.target.value.trim() : null })} style={inputStyle()} />
                                            <input type="checkbox" checked={!!r.stackable} onChange={(e) => set({ stackable: e.target.checked })} />
                                            <input value={String(r.stackLimit)} onChange={(e) => set({ stackLimit: asInt(e.target.value, r.stackLimit) })} style={inputStyle()} />
                                            <input type="checkbox" checked={!!r.splittable} onChange={(e) => set({ splittable: e.target.checked })} />
                                            <input type="checkbox" checked={!!r.consumable} onChange={(e) => set({ consumable: e.target.checked })} />
                                            <input value={r.metaJson ?? "{}"} onChange={(e) => set({ metaJson: e.target.value })} style={inputStyle()} />
                                          </div>
                                        );
                                      })}
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* RESOURCE DEFS */}
                            {adminTab === "resources" && (
                              <div style={{ display: "grid", gap: 10 }}>
                                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                                  <div style={{ fontSize: 18, fontWeight: 900 }}>Resource defs</div>
                                  <div style={{ display: "flex", gap: 8 }}>
                                    <button
                                      onClick={() => {
                                        const id = `new_res_${crypto.randomUUID().slice(0, 6)}`;
                                        setDefsDraft((prev) => [
                                          {
                                            id,
                                            resourceType: "tree" as ResourceType,
                                            name: "New Resource",
                                            skill: "woodcutting" as SkillName,
                                            xpGain: 25,
                                            ticksMin: 8,
                                            ticksMax: 12,
                                            respawnMs: 5000,
                                            metaJson: "{}"
                                          },
                                          ...prev
                                        ]);
                                        setDirtyDefs((s) => new Set([...s, id]));
                                      }}
                                      style={smallBtnStyle("blue")}
                                    >
                                      + Add
                                    </button>

                                    <button
                                      onClick={() => {
                                        const ids = Array.from(dirtyDefs);
                                        for (const id of ids) {
                                          const row = defsDraft.find((x) => x.id === id);
                                          if (!row) continue;
                                          adminSendOrError({ t: "adminUpsertResourceDef", def: { ...row, metaJson: safeJsonString(row.metaJson) } });
                                        }
                                      }}
                                      style={smallBtnStyle("neutral")}
                                    >
                                      Save ({dirtyDefs.size})
                                    </button>
                                  </div>
                                </div>

                                <div style={{ border: "1px solid rgba(255,255,255,0.10)", borderRadius: 12, overflow: "hidden" }}>
                                  <div
                                    style={{
                                      display: "grid",
                                      gridTemplateColumns: "180px 160px 160px 130px 90px 90px 90px 110px 1fr",
                                      gap: 0,
                                      background: "rgba(255,255,255,0.06)",
                                      fontSize: 12,
                                      fontWeight: 900,
                                      padding: "10px 10px"
                                    }}
                                  >
                                    <div>ID</div>
                                    <div>Name</div>
                                    <div>Type</div>
                                    <div>Skill</div>
                                    <div>XP</div>
                                    <div>TicksMin</div>
                                    <div>TicksMax</div>
                                    <div>RespawnMs</div>
                                    <div>Meta JSON</div>
                                  </div>

                                  <div style={{ maxHeight: 440, overflow: "auto" }}>
                                    {defsDraft
                                      .filter((r) => {
                                        const q = adminSearch.trim().toLowerCase();
                                        if (!q) return true;
                                        return (
                                          r.id.toLowerCase().includes(q) ||
                                          r.name.toLowerCase().includes(q) ||
                                          String(r.resourceType).toLowerCase().includes(q) ||
                                          String(r.skill).toLowerCase().includes(q)
                                        );
                                      })
                                      .map((r) => {
                                        const isDirty = dirtyDefs.has(r.id);
                                        const markDirty = () => setDirtyDefs((s) => new Set([...s, r.id]));

                                        const set = (patch: Partial<AdminResourceDefRow>) => {
                                          setDefsDraft((prev) => prev.map((x) => (x.id === r.id ? { ...x, ...patch } : x)));
                                          markDirty();
                                        };

                                        return (
                                          <div
                                            key={r.id}
                                            style={{
                                              display: "grid",
                                              gridTemplateColumns: "180px 160px 160px 130px 90px 90px 90px 110px 1fr",
                                              padding: "8px 10px",
                                              borderTop: "1px solid rgba(255,255,255,0.08)",
                                              fontSize: 12,
                                              alignItems: "center",
                                              background: isDirty ? "rgba(80,140,255,0.08)" : "transparent"
                                            }}
                                          >
                                            <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                                              {r.id} {isDirty && <span style={{ opacity: 0.7 }}>●</span>}
                                            </div>
                                            <input value={r.name} onChange={(e) => set({ name: e.target.value })} style={inputStyle()} />
                                            <select value={r.resourceType} onChange={(e) => set({ resourceType: e.target.value as any })} style={inputStyle()}>
                                              <option value="tree">tree</option>
                                              <option value="rock">rock</option>
                                              <option value="fishing_spot">fishing_spot</option>
                                            </select>
                                            <select value={r.skill} onChange={(e) => set({ skill: e.target.value as any })} style={inputStyle()}>
                                              <option value="woodcutting">woodcutting</option>
                                              <option value="mining">mining</option>
                                              <option value="fishing">fishing</option>
                                            </select>
                                            <input value={String(r.xpGain)} onChange={(e) => set({ xpGain: asInt(e.target.value, r.xpGain) })} style={inputStyle()} />
                                            <input value={String(r.ticksMin)} onChange={(e) => set({ ticksMin: asInt(e.target.value, r.ticksMin) })} style={inputStyle()} />
                                            <input value={String(r.ticksMax)} onChange={(e) => set({ ticksMax: asInt(e.target.value, r.ticksMax) })} style={inputStyle()} />
                                            <input value={String(r.respawnMs)} onChange={(e) => set({ respawnMs: asInt(e.target.value, r.respawnMs) })} style={inputStyle()} />
                                            <input value={r.metaJson ?? "{}"} onChange={(e) => set({ metaJson: e.target.value })} style={inputStyle()} />
                                          </div>
                                        );
                                      })}
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* LOOT */}
                            {adminTab === "loot" && (
                              <div style={{ display: "grid", gap: 12 }}>
                                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                                  <div style={{ fontSize: 18, fontWeight: 900 }}>Loot tables</div>
                                  <div style={{ display: "flex", gap: 8 }}>
                                    <button
                                      onClick={() => {
                                        const resId = selectedDefId;
                                        setLootDraftByRes((prev) => {
                                          const next = { ...prev };
                                          const cur = (next[resId] ?? []).slice();
                                          cur.unshift({ resourceId: resId, itemId: "logs" as any, minQty: 1, maxQty: 1, weight: 100 });
                                          next[resId] = cur;
                                          return next;
                                        });
                                        setDirtyLoot((s) => new Set([...s, selectedDefId]));
                                      }}
                                      style={smallBtnStyle("blue")}
                                    >
                                      + Add row
                                    </button>

                                    <button
                                      onClick={() => {
                                        const resId = selectedDefId;
                                        const rows = lootDraftByRes[resId] ?? [];
                                        adminSendOrError({ t: "adminSetResourceLoot", resourceId: resId, loot: rows });
                                        setDirtyLoot((s) => {
                                          const n = new Set(s);
                                          n.delete(resId);
                                          return n;
                                        });
                                      }}
                                      style={smallBtnStyle("neutral")}
                                    >
                                      Save ({dirtyLoot.has(selectedDefId) ? 1 : 0})
                                    </button>
                                  </div>
                                </div>

                                <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 12 }}>
                                  <div
                                    style={{
                                      border: "1px solid rgba(255,255,255,0.10)",
                                      borderRadius: 12,
                                      overflow: "hidden",
                                      background: "rgba(255,255,255,0.03)"
                                    }}
                                  >
                                    <div style={{ padding: 10, borderBottom: "1px solid rgba(255,255,255,0.08)", fontSize: 12, fontWeight: 900 }}>
                                      Resource
                                    </div>
                                    <div style={{ maxHeight: 460, overflow: "auto" }}>
                                      {defsDraft
                                        .filter((d) => {
                                          const q = adminSearch.trim().toLowerCase();
                                          if (!q) return true;
                                          return d.id.toLowerCase().includes(q) || d.name.toLowerCase().includes(q);
                                        })
                                        .map((d) => {
                                          const active = d.id === selectedDefId;
                                          return (
                                            <button
                                              key={d.id}
                                              onClick={() => setSelectedDefId(d.id)}
                                              style={{
                                                width: "100%",
                                                textAlign: "left",
                                                padding: "10px 10px",
                                                border: "none",
                                                background: active ? "rgba(80,140,255,0.18)" : "transparent",
                                                color: "rgba(255,255,255,0.92)",
                                                cursor: "pointer",
                                                borderBottom: "1px solid rgba(255,255,255,0.06)"
                                              }}
                                            >
                                              <div style={{ fontWeight: 900 }}>
                                                {d.id} {dirtyLoot.has(d.id) && <span style={{ opacity: 0.7 }}>●</span>}
                                              </div>
                                              <div style={{ fontSize: 12, opacity: 0.75 }}>{d.name}</div>
                                            </button>
                                          );
                                        })}
                                    </div>
                                  </div>

                                  <div
                                    style={{
                                      border: "1px solid rgba(255,255,255,0.10)",
                                      borderRadius: 12,
                                      overflow: "hidden"
                                    }}
                                  >
                                    <div
                                      style={{
                                        display: "flex",
                                        alignItems: "baseline",
                                        justifyContent: "space-between",
                                        padding: 10,
                                        background: "rgba(255,255,255,0.06)",
                                        borderBottom: "1px solid rgba(255,255,255,0.08)"
                                      }}
                                    >
                                      <div style={{ fontWeight: 900 }}>
                                        {selectedDefId} loot {dirtyLoot.has(selectedDefId) && <span style={{ opacity: 0.7 }}>●</span>}
                                      </div>
                                      <div style={{ fontSize: 12, opacity: 0.75 }}>
                                        Total rows: {(lootDraftByRes[selectedDefId] ?? []).length}
                                      </div>
                                    </div>

                                    <div
                                      style={{
                                        display: "grid",
                                        gridTemplateColumns: "220px 90px 90px 90px 90px",
                                        padding: "10px 10px",
                                        fontSize: 12,
                                        fontWeight: 900,
                                        background: "rgba(255,255,255,0.03)",
                                        borderBottom: "1px solid rgba(255,255,255,0.08)"
                                      }}
                                    >
                                      <div>ItemId</div>
                                      <div>Min</div>
                                      <div>Max</div>
                                      <div>Weight</div>
                                      <div>Remove</div>
                                    </div>

                                    <div style={{ maxHeight: 420, overflow: "auto" }}>
                                      {(lootDraftByRes[selectedDefId] ?? []).map((row, idx) => {
                                        const setRow = (patch: Partial<AdminResourceLootRow>) => {
                                          setLootDraftByRes((prev) => {
                                            const next = { ...prev };
                                            const cur = (next[selectedDefId] ?? []).slice();
                                            cur[idx] = { ...cur[idx], ...patch };
                                            next[selectedDefId] = cur;
                                            return next;
                                          });
                                          setDirtyLoot((s) => new Set([...s, selectedDefId]));
                                        };

                                        return (
                                          <div
                                            key={`${row.resourceId}:${idx}`}
                                            style={{
                                              display: "grid",
                                              gridTemplateColumns: "220px 90px 90px 90px 90px",
                                              padding: "8px 10px",
                                              borderBottom: "1px solid rgba(255,255,255,0.06)",
                                              alignItems: "center"
                                            }}
                                          >
                                            <input value={row.itemId} onChange={(e) => setRow({ itemId: e.target.value as any })} style={inputStyle()} />
                                            <input value={String(row.minQty)} onChange={(e) => setRow({ minQty: asInt(e.target.value, row.minQty) })} style={inputStyle()} />
                                            <input value={String(row.maxQty)} onChange={(e) => setRow({ maxQty: asInt(e.target.value, row.maxQty) })} style={inputStyle()} />
                                            <input value={String(row.weight)} onChange={(e) => setRow({ weight: asInt(e.target.value, row.weight) })} style={inputStyle()} />
                                            <button
                                              onClick={() => {
                                                setLootDraftByRes((prev) => {
                                                  const next = { ...prev };
                                                  const cur = (next[selectedDefId] ?? []).slice();
                                                  cur.splice(idx, 1);
                                                  next[selectedDefId] = cur;
                                                  return next;
                                                });
                                                setDirtyLoot((s) => new Set([...s, selectedDefId]));
                                              }}
                                              style={smallBtnStyle("red")}
                                            >
                                              Delete
                                            </button>
                                          </div>
                                        );
                                      })}

                                      {(lootDraftByRes[selectedDefId] ?? []).length === 0 && (
                                        <div style={{ padding: 12, opacity: 0.75, fontSize: 12 }}>
                                          No loot rows. Add one.
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* PLAYERS */}
                            {adminTab === "players" && (
                              <div style={{ display: "grid", gap: 10 }}>
                                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                                  <div style={{ fontSize: 18, fontWeight: 900 }}>Players</div>
                                  <button
                                    onClick={() => {
                                      const ids = Array.from(dirtyPlayers);
                                      for (const id of ids) {
                                        const row = playersDraft.find((x) => x.userId === id);
                                        if (!row) continue;
                                        adminSendOrError({ t: "adminUpdatePlayer", player: row });
                                      }
                                    }}
                                    style={smallBtnStyle("neutral")}
                                  >
                                    Save ({dirtyPlayers.size})
                                  </button>
                                </div>

                                <div style={{ border: "1px solid rgba(255,255,255,0.10)", borderRadius: 12, overflow: "hidden" }}>
                                  <div
                                    style={{
                                      display: "grid",
                                      gridTemplateColumns: "160px 160px 90px 90px 90px 110px 110px 110px 1fr",
                                      background: "rgba(255,255,255,0.06)",
                                      fontSize: 12,
                                      fontWeight: 900,
                                      padding: "10px 10px"
                                    }}
                                  >
                                    <div>Username</div>
                                    <div>CharName</div>
                                    <div>Rights</div>
                                    <div>X</div>
                                    <div>Y</div>
                                    <div>XP WC</div>
                                    <div>XP MIN</div>
                                    <div>XP FSH</div>
                                    <div>UserId</div>
                                  </div>

                                  <div style={{ maxHeight: 460, overflow: "auto" }}>
                                    {playersDraft
                                      .filter((p) => {
                                        const q = adminSearch.trim().toLowerCase();
                                        if (!q) return true;
                                        return (
                                          p.username.toLowerCase().includes(q) ||
                                          p.userId.toLowerCase().includes(q) ||
                                          p.charName.toLowerCase().includes(q)
                                        );
                                      })
                                      .map((p) => {
                                        const isDirty = dirtyPlayers.has(p.userId);
                                        const markDirty = () => setDirtyPlayers((s) => new Set([...s, p.userId]));
                                        const set = (patch: Partial<AdminPlayerRow>) => {
                                          setPlayersDraft((prev) => prev.map((x) => (x.userId === p.userId ? { ...x, ...patch } : x)));
                                          markDirty();
                                        };

                                        return (
                                          <div
                                            key={p.userId}
                                            style={{
                                              display: "grid",
                                              gridTemplateColumns: "160px 160px 90px 90px 90px 110px 110px 110px 1fr",
                                              padding: "8px 10px",
                                              borderTop: "1px solid rgba(255,255,255,0.08)",
                                              fontSize: 12,
                                              alignItems: "center",
                                              background: isDirty ? "rgba(80,140,255,0.08)" : "transparent"
                                            }}
                                          >
                                            <div style={{ fontWeight: 900 }}>
                                              {p.username} {isDirty && <span style={{ opacity: 0.7 }}>●</span>}
                                            </div>
                                            <input value={p.charName} onChange={(e) => set({ charName: e.target.value })} style={inputStyle()} />
                                            <input value={String(p.rights)} onChange={(e) => set({ rights: asInt(e.target.value, p.rights) })} style={inputStyle()} />
                                            <input value={String(p.x)} onChange={(e) => set({ x: asInt(e.target.value, p.x) })} style={inputStyle()} />
                                            <input value={String(p.y)} onChange={(e) => set({ y: asInt(e.target.value, p.y) })} style={inputStyle()} />
                                            <input value={String(p.xpWoodcutting)} onChange={(e) => set({ xpWoodcutting: asInt(e.target.value, p.xpWoodcutting) })} style={inputStyle()} />
                                            <input value={String(p.xpMining)} onChange={(e) => set({ xpMining: asInt(e.target.value, p.xpMining) })} style={inputStyle()} />
                                            <input value={String(p.xpFishing)} onChange={(e) => set({ xpFishing: asInt(e.target.value, p.xpFishing) })} style={inputStyle()} />
                                            <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", opacity: 0.8 }}>
                                              {p.userId}
                                            </div>
                                          </div>
                                        );
                                      })}
                                  </div>
                                </div>
                              </div>
                            )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {adminOpen && adminMinimized && (
            <div
              style={{
                position: "absolute",
                right: 12,
                top: 210, // below minimap
                zIndex: 60,
                width: 380,
                background: "rgba(12,14,20,0.86)",
                border: "1px solid rgba(255,255,255,0.14)",
                borderRadius: 14,
                boxShadow: "0 20px 70px rgba(0,0,0,0.55)",
                color: "rgba(255,255,255,0.92)",
                fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
                padding: 10,
                pointerEvents: "auto"
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div style={{ fontWeight: 900 }}>Admin</div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>rights: {adminRights}</div>
              </div>

              {/* Mini toolbar */}
              <div
                style={{
                  marginTop: 10,
                  padding: 10,
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.04)",
                  display: "grid",
                  gap: 10
                }}
              >
                <div style={{ fontSize: 12, opacity: 0.85, lineHeight: 1.35 }}>
                  <b>Map tool:</b> click the <b>3D world</b> to place/remove.
                </div>

                <div>
                  <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Resource def</div>
                  <select
                    value={selectedDefId}
                    onChange={(e) => {
                      const v = e.target.value;
                      setSelectedDefId(v);
                      setAdminTool((t: any) => (t?.mode === "place" ? { mode: "place", defId: v } : t));
                    }}
                    style={inputStyle()}
                  >
                    {(defsDraft.length ? defsDraft : [{ id: "tree_basic" } as any]).map((d: any) => (
                      <option key={d.id} value={d.id}>
                        {d.id}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button onClick={() => setAdminTool({ mode: "place", defId: selectedDefId })} style={smallBtnStyle("blue")}>
                    Place
                  </button>
                  <button onClick={() => setAdminTool({ mode: "remove" })} style={smallBtnStyle("red")}>
                    Remove
                  </button>
                  <button onClick={() => setAdminTool({ mode: "off" })} style={smallBtnStyle("neutral")}>
                    Off
                  </button>
                </div>

                <div style={{ fontSize: 12, opacity: 0.9 }}>
                  <span style={{ opacity: 0.75 }}>Active tool:</span>{" "}
                  <b>
                    {adminTool.mode === "off"
                      ? "Off"
                      : adminTool.mode === "remove"
                      ? "Remove"
                      : `Place (${adminTool.defId})`}
                  </b>
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button onClick={() => setAdminMinimized(false)} style={smallBtnStyle("blue")}>
                  Open
                </button>

                <button onClick={refreshSnapshot} style={smallBtnStyle("neutral")}>
                  Refresh
                </button>

                <button
                  onClick={() => {
                    setAdminOpen(false);
                    setAdminMinimized(false);
                    setAdminTool({ mode: "off" });
                  }}
                  style={smallBtnStyle("red")}
                >
                  Close
                </button>
              </div>
            </div>
          )}

          
          
    </div>
  );
}
