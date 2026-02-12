import React, { useEffect, useMemo, useRef, useState } from "react";
import { createGame } from "./game/createGame";
import { createGame3d, assetManager } from "./game3d/createGame3d"; // Import assetManager
import { AdminShell } from "./ui/admin/AdminShell";
import { AuthScreen } from "./ui/AuthScreen";
import { AdminModal } from "./ui/admin/AdminModal";
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
  AdminResourceSpawnRow
} from "@rsclone/shared/protocol";
import { WORLD_W, WORLD_H, makeCollision } from "@rsclone/shared/world";

const API = "http://localhost:8081";

// ... (keep helper functions fmtTime, clamp, inputStyle, smallBtnStyle, asInt, safeJsonString, findClosestWalkable, ITEM_NAME, itemName, MinimapState, AdminSnapshot, AdminTool) ...
function fmtTime(ts: number) { const d = new Date(ts); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; }
type Skills = { woodcutting: number; mining: number; fishing: number };
type MinimapState = { youId: string | null; players: PlayerState[]; resources: ResourceState[]; cameraYawRad?: number; };
function clamp(n: number, a: number, b: number) { return Math.max(a, Math.min(b, n)); }
function inputStyle() { return { width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.12)", outline: "none", background: "rgba(0,0,0,0.2)", color: "rgba(255,255,255,0.92)", fontSize: 12, fontFamily: "ui-monospace, monospace" } as const; }
function smallBtnStyle(kind: "neutral" | "blue" | "red" = "neutral") { return { padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.12)", background: kind === "blue" ? "rgba(80,140,255,0.22)" : kind === "red" ? "rgba(255,80,80,0.18)" : "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.92)", cursor: "pointer", fontSize: 12, fontWeight: 700 as const, whiteSpace: "nowrap" as const }; }
function asInt(val: string, fallback: number): number { const n = parseInt(val, 10); return isNaN(n) ? fallback : n; }
function safeJsonString(s: string | undefined): string { try { JSON.parse(s || "{}"); return s || "{}"; } catch { return "{}"; } }
const ITEM_NAME: Record<string, string> = { logs: "Logs", ore: "Ore", raw_fish: "Raw fish" };
function itemName(id: ItemId | string) { return ITEM_NAME[id] ?? id; }
type AdminSnapshot = { items: AdminItemRow[]; resourceDefs: AdminResourceDefRow[]; resourceLoot: AdminResourceLootRow[]; resourceSpawns: AdminResourceSpawnRow[]; players: AdminPlayerRow[]; };
type AdminTool = | { mode: "off" } | { mode: "place"; defId: string } | { mode: "remove" };
function findClosestWalkable(collision: number[][], start: { x: number; y: number }, maxRadius = 12) {
  const H = collision.length; const W = collision[0]?.length ?? 0;
  const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
  const walkable = (x: number, y: number) => inBounds(x, y) && collision[y][x] === 0;
  if (walkable(start.x, start.y)) return start;
  const q: Array<{ x: number; y: number }> = []; const seen = new Set<string>();
  const push = (x: number, y: number) => { const k = `${x},${y}`; if (seen.has(k)) return; seen.add(k); q.push({ x, y }); };
  push(start.x, start.y);
  while (q.length) {
    const cur = q.shift()!;
    const dist = Math.abs(cur.x - start.x) + Math.abs(cur.y - start.y);
    if (dist > maxRadius) continue;
    if (walkable(cur.x, cur.y)) return cur;
    push(cur.x + 1, cur.y); push(cur.x - 1, cur.y); push(cur.x, cur.y + 1); push(cur.x, cur.y - 1);
  }
  return null;
}

export default function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [assetProgress, setAssetProgress] = useState<number | null>(null); // Null = not started, 0-100 = loading, 100 = done
  const [status, setStatus] = useState("connecting…");
  const [rendererMode] = useState<"2d" | "3d">("3d");
  const [token, setToken] = useState<string>("");

  // ... (auth state: mode, authError, emailOrUsername, etc - same as before) ...
  const [mode, setMode] = useState<"login" | "register">("login");
  const [authError, setAuthError] = useState("");
  const [emailOrUsername, setEmailOrUsername] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // ... (game state: chatTab, worldLines, playerLines, etc - same as before) ...
  const WORLD_LIMIT = 250; const PLAYER_LIMIT = 250;
  const [chatTab, setChatTab] = useState<"world" | "player">("player");
  const [worldLines, setWorldLines] = useState<ChatLine[]>([]);
  const [playerLines, setPlayerLines] = useState<ChatLine[]>([]);
  const [chatInput, setChatInput] = useState("");
  const chatBoxRef = useRef<HTMLDivElement>(null);
  const [skills, setSkills] = useState<Skills | null>(null);
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [invFullFlash, setInvFullFlash] = useState(false);
  const [minimap, setMinimap] = useState<MinimapState>({ youId: null, players: [], resources: [] });
  const [minimapFlag, setMinimapFlag] = useState<{ x: number; y: number; placedAt: number } | null>(null);

  // ... (admin state - same as before) ...
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminMinimized, setAdminMinimized] = useState(false);
  const [adminRights, setAdminRights] = useState(0);
  const [adminTab, setAdminTab] = useState<"map" | "items" | "resources" | "loot" | "players">("map");
  const [adminSnapshot, setAdminSnapshot] = useState<AdminSnapshot | null>(null);
  const [itemsDraft, setItemsDraft] = useState<AdminItemRow[]>([]);
  const [defsDraft, setDefsDraft] = useState<AdminResourceDefRow[]>([]);
  const [lootDraft, setLootDraft] = useState<AdminResourceLootRow[]>([]);
  const [lootDraftByRes, setLootDraftByRes] = useState<Record<string, AdminResourceLootRow[]>>({});
  const [spawnsDraft, setSpawnsDraft] = useState<AdminResourceSpawnRow[]>([]);
  const [playersDraft, setPlayersDraft] = useState<AdminPlayerRow[]>([]);
  const [selectedDefId, setSelectedDefId] = useState<string>("tree_basic");
  const [adminTool, setAdminTool] = useState<AdminTool>({ mode: "off" });
  const [dirtyItems, setDirtyItems] = useState(() => new Set<string>());
  const [dirtyDefs, setDirtyDefs] = useState(() => new Set<string>());
  const [dirtyLoot, setDirtyLoot] = useState(() => new Set<string>());
  const [dirtyPlayers, setDirtyPlayers] = useState(() => new Set<string>());

  const minimapCanvasRef = useRef<HTMLCanvasElement>(null);
  const collision = useMemo(() => makeCollision(), []);

  // --- Session Restoration ---
  useEffect(() => {
    async function checkSession() {
      const stored = localStorage.getItem("token");
      if (!stored) {
        setInitialLoading(false);
        return;
      }
      try {
        const res = await fetch(`${API}/me`, { headers: { Authorization: `Bearer ${stored}` } });
        if (res.ok) {
          setToken(stored);
        } else {
          localStorage.removeItem("token");
          setToken("");
        }
      } catch (e) {
        localStorage.removeItem("token");
        setToken("");
      } finally {
        setInitialLoading(false);
      }
    }
    checkSession();
  }, []);

  // --- ASSET PRELOADING ---
  useEffect(() => {
    if (!token) return; // Only load assets if logged in
    
    setAssetProgress(0);
    assetManager.init((pct) => setAssetProgress(pct))
      .catch(() => setAssetProgress(100)); // Proceed even if fail (fallback mode)
      
  }, [token]);

  // ... (keep seedFromSnapshot, refreshSnapshot, adminSendOrError, useEffect window hacks, cap, activeLines, chat scroll) ...
  function seedFromSnapshot(snap: AdminSnapshot) { setAdminSnapshot(snap); setItemsDraft(snap.items ?? []); setDefsDraft(snap.resourceDefs ?? []); setLootDraft(snap.resourceLoot ?? []); setSpawnsDraft(snap.resourceSpawns ?? []); setPlayersDraft(snap.players ?? []); const lootMap: Record<string, AdminResourceLootRow[]> = {}; for (const r of snap.resourceLoot ?? []) { if (!lootMap[r.resourceId]) lootMap[r.resourceId] = []; lootMap[r.resourceId].push(r); } setLootDraftByRes(lootMap); setDirtyItems(new Set()); setDirtyDefs(new Set()); setDirtyLoot(new Set()); setDirtyPlayers(new Set()); const firstDefId = snap.resourceDefs?.[0]?.id; if (firstDefId && !snap.resourceDefs.some((d) => d.id === selectedDefId)) { setSelectedDefId(firstDefId); } }
  function refreshSnapshot() { const get = (window as any).__adminGetSnapshot; if (get) return get(); const send = (window as any).__adminSend; send?.({ t: "adminGetSnapshot" }); }
  function adminSendOrError(msg: any) { const send = (window as any).__adminSend; if (send) send(msg); else console.error("Admin send not linked"); }
  
  useEffect(() => {
    (window as any).__chatPush = (line: ChatLine | ChatLine[]) => { const add = Array.isArray(line) ? line : [line]; const sys = add.filter((l) => l.from.id === "system"); const ply = add.filter((l) => l.from.id !== "system"); if (sys.length) setWorldLines((prev) => cap([...prev, ...sys], WORLD_LIMIT)); if (ply.length) setPlayerLines((prev) => cap([...prev, ...ply], PLAYER_LIMIT)); };
    (window as any).__skillsSet = (s: Skills) => setSkills(s); (window as any).__invSet = (inv: Inventory) => setInventory(inv); (window as any).__invFull = () => { setInvFullFlash(true); window.setTimeout(() => setInvFullFlash(false), 1400); }; (window as any).__minimapUpdate = (state: MinimapState) => setMinimap(state);
    (window as any).__adminOpen = (rights: number) => { setAdminRights(Math.max(0, rights | 0)); setAdminOpen(true); setAdminMinimized(false); setAdminTab("map"); refreshSnapshot(); }; (window as any).__adminSnapshot = (snap: AdminSnapshot) => seedFromSnapshot(snap); (window as any).__adminError = (err: string) => { (window as any).__chatPush?.({ id: crypto.randomUUID(), ts: Date.now(), from: { id: "system", name: "System" }, text: `Admin error: ${err}` }); };
    return () => { (window as any).__chatPush = null; (window as any).__skillsSet = null; (window as any).__invSet = null; (window as any).__invFull = null; (window as any).__minimapUpdate = null; (window as any).__adminOpen = null; (window as any).__adminSnapshot = null; (window as any).__adminError = null; };
  }, []);
  function cap<T>(arr: T[], limit: number) { return arr.length > limit ? arr.slice(arr.length - limit) : arr; }
  const activeLines = chatTab === "world" ? worldLines : playerLines;
  useEffect(() => { const el = chatBoxRef.current; if (!el) return; el.scrollTop = el.scrollHeight; }, [activeLines, chatTab]);

  // --- GAME MOUNT ---
  useEffect(() => {
    if (!hostRef.current) return;
    if (!token) return;
    if (assetProgress !== 100) return; // WAIT FOR ASSETS!

    setWorldLines([]); setPlayerLines([]); setSkills(null); setInventory(null); setInvFullFlash(false); setMinimap({ youId: null, players: [], resources: [] }); setMinimapFlag(null); setStatus("Connecting...");

    const game = rendererMode === "3d" ? createGame3d(hostRef.current, token) : createGame(hostRef.current, token);
    game.setStatusText(setStatus);
    return () => { game.destroy(); };
  }, [token, rendererMode, assetProgress]); // Depend on assetProgress

  // ... (keep minimap render effects, onMinimapClick, authSubmit, logout, sendChat) ...
  useEffect(() => { const canvas = minimapCanvasRef.current; if (!canvas) return; const ctx = canvas.getContext("2d"); if (!ctx) return; const size = canvas.width; const radius = size / 2; const viewTiles = 28; const pxPerTile = size / viewTiles; let cx = WORLD_W / 2; let cy = WORLD_H / 2; if (minimap.youId) { const me = minimap.players.find((p) => p.id === minimap.youId); if (me) { cx = me.pos.x + 0.5; cy = me.pos.y + 0.5; } } function toMini(tx: number, ty: number) { const dx = (tx + 0.5 - cx) * pxPerTile; const dy = (ty + 0.5 - cy) * pxPerTile; return { x: radius + dx, y: radius + dy }; } ctx.clearRect(0, 0, size, size); ctx.save(); ctx.beginPath(); ctx.arc(radius, radius, radius - 1, 0, Math.PI * 2); ctx.clip(); ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillRect(0, 0, size, size); const half = Math.floor(viewTiles / 2); const minX = clamp(Math.floor(cx) - half, 0, WORLD_W - 1); const maxX = clamp(Math.floor(cx) + half, 0, WORLD_W - 1); const minY = clamp(Math.floor(cy) - half, 0, WORLD_H - 1); const maxY = clamp(Math.floor(cy) + half, 0, WORLD_H - 1); for (let y = minY; y <= maxY; y++) { for (let x = minX; x <= maxX; x++) { const p = toMini(x, y); const left = p.x - pxPerTile / 2; const top = p.y - pxPerTile / 2; if (collision[y][x] === 1) ctx.fillStyle = "rgba(32,64,128,0.85)"; else ctx.fillStyle = "rgba(20,20,20,0.55)"; ctx.fillRect(left, top, pxPerTile, pxPerTile); } } for (const r of minimap.resources) { if (!r.alive) continue; const p = toMini(r.pos.x, r.pos.y); ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(2, pxPerTile * 0.18), 0, Math.PI * 2); ctx.fillStyle = r.type === "tree" ? "rgba(46,204,113,0.95)" : r.type === "rock" ? "rgba(180,180,180,0.95)" : "rgba(241,196,15,0.95)"; ctx.fill(); } for (const pl of minimap.players) { const p = toMini(pl.pos.x, pl.pos.y); ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(2.5, pxPerTile * 0.22), 0, Math.PI * 2); const isMe = minimap.youId && pl.id === minimap.youId; ctx.fillStyle = isMe ? "rgba(102,255,102,1)" : "rgba(102,153,255,0.95)"; ctx.fill(); } if (minimapFlag) { const p = toMini(minimapFlag.x, minimapFlag.y); ctx.save(); ctx.translate(p.x, p.y); ctx.fillStyle = "rgba(255,60,60,0.95)"; ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(0, 10); ctx.lineTo(10, 0); ctx.closePath(); ctx.fill(); ctx.strokeStyle = "rgba(0,0,0,0.6)"; ctx.lineWidth = 2; ctx.stroke(); ctx.restore(); } ctx.restore(); ctx.beginPath(); ctx.arc(radius, radius, radius - 1, 0, Math.PI * 2); ctx.strokeStyle = "rgba(255,255,255,0.16)"; ctx.lineWidth = 2; ctx.stroke(); }, [minimap, collision, minimapFlag]);
  useEffect(() => { if (!minimapFlag) return; const me = minimap.youId ? minimap.players.find((p) => p.id === minimap.youId) : null; if (me && me.pos.x === minimapFlag.x && me.pos.y === minimapFlag.y) { setMinimapFlag(null); return; } const t = window.setTimeout(() => setMinimapFlag(null), 10000); return () => window.clearTimeout(t); }, [minimap, minimapFlag]);
  function onMinimapClick(e: React.MouseEvent<HTMLDivElement>) { const wrap = e.currentTarget; const rect = wrap.getBoundingClientRect(); const size = rect.width; const r = size / 2; const px = e.clientX - rect.left; const py = e.clientY - rect.top; const dx = px - r; const dy = py - r; if (dx * dx + dy * dy > (r - 2) * (r - 2)) return; const viewTiles = 28; const pxPerTile = size / viewTiles; let cx = WORLD_W / 2; let cy = WORLD_H / 2; if (minimap.youId) { const me = minimap.players.find((p) => p.id === minimap.youId); if (me) { cx = me.pos.x + 0.5; cy = me.pos.y + 0.5; } } const offTilesX = dx / pxPerTile; const offTilesY = dy / pxPerTile; const desiredX = Math.floor(cx + offTilesX); const desiredY = Math.floor(cy + offTilesY); const clamped = { x: clamp(desiredX, 0, WORLD_W - 1), y: clamp(desiredY, 0, WORLD_H - 1) }; const target = findClosestWalkable(collision, clamped, 16); if (!target) return; setMinimapFlag({ ...target, placedAt: Date.now() }); const fn = (window as any).__moveTo; fn?.(target); }
  async function authSubmit() { setAuthError(""); try { const res = await fetch(`${API}/auth/${mode}`, { method: "POST", headers: { "content-type": "application/json" }, body: mode === "login" ? JSON.stringify({ emailOrUsername, password }) : JSON.stringify({ email, username, password }) }); const data = await res.json(); if (!res.ok) throw new Error(data?.error ?? "Request failed"); localStorage.setItem("token", data.token); setToken(data.token); } catch (e: any) { setAuthError(e?.message ?? "Failed"); } }
  function logout() { localStorage.removeItem("token"); setToken(""); setSkills(null); setInventory(null); setWorldLines([]); setPlayerLines([]); setMinimap({ youId: null, players: [], resources: [] }); setMinimapFlag(null); setStatus("disconnected"); setInitialLoading(false); }
  const canSend = useMemo(() => chatInput.trim().length > 0, [chatInput]);
  function sendChat() { const text = chatInput.trim(); if (!text) return; const fn = (window as any).__chatSend; fn?.(text); setChatInput(""); }

  if (initialLoading) {
    return <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#07090f", color: "#888" }}>Loading...</div>;
  }

  if (!token) {
    return <AuthScreen mode={mode} setMode={setMode} emailOrUsername={emailOrUsername} setEmailOrUsername={setEmailOrUsername} email={email} setEmail={setEmail} username={username} setUsername={setUsername} password={password} setPassword={setPassword} error={authError} onSubmit={authSubmit} />;
  }

  // --- LOADING SCREEN ---
  if (assetProgress !== null && assetProgress < 100) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#07090f", color: "#e6e8ef", fontFamily: "sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>Downloading Assets</div>
          <div style={{ fontSize: 48, fontWeight: 300, color: "#4f86f7" }}>{assetProgress}%</div>
          <div style={{ marginTop: 16, width: 300, height: 4, background: "#222", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${assetProgress}%`, background: "#4f86f7" }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", background: "#000", position: "relative" }}>
      <div ref={hostRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "hidden" }} />
      {/* HUD (Status, Minimap, Chat, Inv) */}
      <div style={{ position: "absolute", top: 12, left: 12, padding: "8px 10px", borderRadius: 10, background: "rgba(0,0,0,0.45)", border: "1px solid rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.88)", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", fontSize: 12, pointerEvents: "none" }}>
        <div style={{ opacity: 0.85 }}>{status}</div>
        <div style={{ marginTop: 2, opacity: 0.8 }}>{skills ? `XP  WC:${skills.woodcutting}  MIN:${skills.mining}  FSH:${skills.fishing}` : "XP —"}</div>
      </div>
      <div onClick={onMinimapClick} style={{ position: "absolute", top: 12, right: 12, width: 180, height: 180, borderRadius: "50%", overflow: "hidden", background: "rgba(0,0,0,0.22)", border: "2px solid rgba(255,255,255,0.12)", boxShadow: "0 12px 28px rgba(0,0,0,0.45)", pointerEvents: "auto", cursor: "pointer", userSelect: "none" }} title="Click to move">
        <canvas ref={minimapCanvasRef} width={180} height={180} style={{ width: "100%", height: "100%", display: "block" }} />
        <div style={{ position: "absolute", inset: 0, color: "rgba(255,255,255,0.80)", fontFamily: "system-ui, sans-serif", fontSize: 12, pointerEvents: "none" }}>
            <div style={{ position: "absolute", top: 6, left: "50%", transform: "translateX(-50%)" }}>N</div>
            <div style={{ position: "absolute", bottom: 6, left: "50%", transform: "translateX(-50%)" }}>S</div>
            <div style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)" }}>E</div>
            <div style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)" }}>W</div>
        </div>
      </div>
      <div style={{ position: "absolute", right: 12, bottom: 64, width: 300, background: "rgba(0,0,0,0.55)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: 10, boxShadow: "0 12px 28px rgba(0,0,0,0.45)", fontFamily: "system-ui, sans-serif", color: "rgba(255,255,255,0.92)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 13, fontWeight: 700, opacity: 0.95 }}>Inventory</div>
            <div style={{ fontSize: 11, opacity: 0.7 }}>30 slots</div>
        </div>
        {invFullFlash && (<div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 10, background: "rgba(255,60,60,0.14)", border: "1px solid rgba(255,60,60,0.25)", color: "rgba(255,220,220,0.95)", fontSize: 12 }}>Inventory is full</div>)}
        <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
            {Array.from({ length: 30 }, (_, i) => {
                const slot = inventory?.[i] ?? null;
                return (<div key={i} title={slot ? `${itemName(slot.itemId)} x${slot.qty}` : "Empty"} style={{ height: 48, borderRadius: 10, border: "1px solid rgba(255,255,255,0.10)", background: slot ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.03)", display: "grid", placeItems: "center", position: "relative", userSelect: "none" }}>
                    <div style={{ position: "absolute", left: 6, top: 4, fontSize: 10, opacity: 0.35 }}>{i + 1}</div>
                    {slot ? (<><div style={{ fontSize: 11, fontWeight: 700, opacity: 0.95 }}>{itemName(slot.itemId)}</div><div style={{ position: "absolute", right: 6, bottom: 4, fontSize: 11, opacity: 0.85, fontVariantNumeric: "tabular-nums" }}>{slot.qty}</div></>) : (<div style={{ fontSize: 11, opacity: 0.35 }}>—</div>)}
                </div>);
            })}
        </div>
      </div>
      <div style={{ position: "absolute", left: 12, bottom: 12, width: 420, minWidth: 320, maxWidth: "min(420px, calc(100vw - 24px))", background: "rgba(0,0,0,0.55)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: 10, fontFamily: `"RuneScape UF","RuneScape",sans-serif`, color: "white", boxSizing: "border-box" }}>
         <div style={{ position: "sticky", top: 0, zIndex: 2, paddingBottom: 8, marginBottom: 8, background: "rgba(0,0,0,0.35)", backdropFilter: "blur(6px)" }}>
             <div style={{ display: "flex", gap: 8 }}>
                 <button onClick={() => setChatTab("world")} style={{ flex: 1, padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: chatTab === "world" ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.90)", cursor: "pointer" }}>World ({worldLines.length})</button>
                 <button onClick={() => setChatTab("player")} style={{ flex: 1, padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: chatTab === "player" ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.90)", cursor: "pointer" }}>Player ({playerLines.length})</button>
             </div>
         </div>
         <div ref={chatBoxRef} style={{ height: 140, overflowY: "auto", paddingRight: 6, fontSize: 12 }}>
             {(chatTab === "world" ? worldLines : playerLines).map((l) => (<div key={l.id} style={{ marginBottom: 4, opacity: l.from.id === "system" ? 0.92 : 1 }}><span style={{ opacity: 0.65 }}>[{fmtTime(l.ts)}] </span><span style={{ fontWeight: 650 }}>{l.from.name}: </span><span style={{ opacity: 0.95 }}>{l.text}</span></div>))}
         </div>
         <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
             <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && canSend) sendChat(); }} placeholder="Type message…" style={{ flex: 1, padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", outline: "none", background: "rgba(255,255,255,0.04)", color: "#e6e8ef" }} />
             <button onClick={sendChat} disabled={!canSend} style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: canSend ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.90)", cursor: canSend ? "pointer" : "default", opacity: canSend ? 1 : 0.7 }}>Send</button>
         </div>
      </div>

      <AdminModal
        open={adminOpen}
        minimized={adminMinimized}
        setMinimized={setAdminMinimized}
        adminRights={adminRights}
        snapshot={adminSnapshot}
        onRefresh={refreshSnapshot}
        onClose={() => {
          setAdminOpen(false);
          setAdminMinimized(false);
          setAdminTool({ mode: "off" });
        }}
        token={token}
        adminTool={adminTool}
        setAdminTool={setAdminTool}
      />

      <button onClick={logout} style={{ position: "absolute", right: 12, bottom: 12, padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.45)", color: "rgba(255,255,255,0.9)", fontFamily: "system-ui, sans-serif", fontSize: 12, cursor: "pointer", boxShadow: "0 12px 28px rgba(0,0,0,0.45)" }}>Logout</button>
    </div>
  );
}
