import React, { useEffect, useMemo, useRef, useState } from "react";
import { createGame } from "./game/createGame";
import { createGame3d, assetManager, type ContextMenuOption } from "./game3d/createGame3d";
import { AuthScreen } from "./ui/AuthScreen";
import { AdminModal } from "./ui/admin/AdminModal";
import type {
  ChatLine,
  PlayerState,
  ResourceState,
  Inventory,
  ItemId,
  AdminSnapshot,
  AdminTool
} from "@rsclone/shared/protocol";
import { WORLD_W, WORLD_H, makeCollision } from "@rsclone/shared/world";

const API = "http://localhost:8081";

function fmtTime(ts: number) { const d = new Date(ts); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; }
type Skills = { woodcutting: number; mining: number; fishing: number };
type MinimapState = { youId: string | null; players: PlayerState[]; resources: ResourceState[]; cameraYawRad?: number; };
function clamp(n: number, a: number, b: number) { return Math.max(a, Math.min(b, n)); }
function itemName(id: ItemId | string) { const map: Record<string, string> = { logs: "Logs", ore: "Ore", raw_fish: "Raw fish" }; return map[id] ?? id; }
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
  const [assetProgress, setAssetProgress] = useState<number | null>(null);
  const [status, setStatus] = useState("connecting…");
  const [rendererMode] = useState<"2d" | "3d">("3d");
  const [token, setToken] = useState<string>("");
  const [menu, setMenu] = useState<{ x: number; y: number; options: ContextMenuOption[] } | null>(null);

  // Auth
  const [mode, setMode] = useState<"login" | "register">("login");
  const [authError, setAuthError] = useState("");
  const [emailOrUsername, setEmailOrUsername] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // Game Data
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

  // Admin
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminRights, setAdminRights] = useState(0);
  const [adminSnapshot, setAdminSnapshot] = useState<AdminSnapshot | null>(null);
  const [adminTool, setAdminTool] = useState<AdminTool>({ mode: "off" });

  const minimapCanvasRef = useRef<HTMLCanvasElement>(null);
  const collision = useMemo(() => makeCollision(), []);

  // --- FIX: SYNC ADMIN TOOL TO WINDOW FOR GAME ENGINE ---
  useEffect(() => {
    (window as any).__adminTool = adminTool;
  }, [adminTool]);

  useEffect(() => {
    async function checkSession() {
      const stored = localStorage.getItem("token");
      if (!stored) { setInitialLoading(false); return; }
      try {
        const res = await fetch(`${API}/me`, { headers: { Authorization: `Bearer ${stored}` } });
        if (res.ok) setToken(stored);
        else { localStorage.removeItem("token"); setToken(""); }
      } catch (e) { localStorage.removeItem("token"); setToken(""); } finally { setInitialLoading(false); }
    }
    checkSession();
  }, []);

  useEffect(() => {
    if (!token) return;
    setAssetProgress(0);
    assetManager.init((pct) => setAssetProgress(pct)).catch(() => setAssetProgress(100));
  }, [token]);

  useEffect(() => {
    (window as any).__chatPush = (line: ChatLine | ChatLine[]) => { const add = Array.isArray(line) ? line : [line]; const sys = add.filter((l) => l.from.id === "system"); const ply = add.filter((l) => l.from.id !== "system"); if (sys.length) setWorldLines((prev) => cap([...prev, ...sys], WORLD_LIMIT)); if (ply.length) setPlayerLines((prev) => cap([...prev, ...ply], PLAYER_LIMIT)); };
    (window as any).__skillsSet = (s: Skills) => setSkills(s); (window as any).__invSet = (inv: Inventory) => setInventory(inv); (window as any).__invFull = () => { setInvFullFlash(true); window.setTimeout(() => setInvFullFlash(false), 1400); }; (window as any).__minimapUpdate = (state: MinimapState) => setMinimap(state);
    (window as any).__adminOpen = (rights: number) => { setAdminRights(Math.max(0, rights | 0)); setAdminOpen(true); refreshSnapshot(); };
    (window as any).__adminSnapshot = (snap: AdminSnapshot) => setAdminSnapshot(snap);
    (window as any).__adminError = (err: string) => { (window as any).__chatPush?.({ id: crypto.randomUUID(), ts: Date.now(), from: { id: "system", name: "System" }, text: `Admin error: ${err}` }); };
    return () => { (window as any).__chatPush = null; (window as any).__skillsSet = null; (window as any).__invSet = null; (window as any).__invFull = null; (window as any).__minimapUpdate = null; (window as any).__adminOpen = null; (window as any).__adminSnapshot = null; (window as any).__adminError = null; };
  }, []);

  function refreshSnapshot() { const send = (window as any).__adminSend; send?.({ t: "adminGetSnapshot" }); }
  function cap<T>(arr: T[], limit: number) { return arr.length > limit ? arr.slice(arr.length - limit) : arr; }
  const activeLines = chatTab === "world" ? worldLines : playerLines;
  useEffect(() => { const el = chatBoxRef.current; if (!el) return; el.scrollTop = el.scrollHeight; }, [activeLines, chatTab]);

  useEffect(() => {
    if (!hostRef.current || !token || assetProgress !== 100) return;
    setWorldLines([]); setPlayerLines([]); setSkills(null); setInventory(null); setInvFullFlash(false); setMinimap({ youId: null, players: [], resources: [] }); setMinimapFlag(null); setStatus("Connecting...");
    const game = rendererMode === "3d" ? createGame3d(hostRef.current, token, (x, y, options) => setMenu({ x, y, options })) : createGame(hostRef.current, token);
    game.setStatusText(setStatus);
    return () => { game.destroy(); };
  }, [token, rendererMode, assetProgress]);

  useEffect(() => { const click = () => setMenu(null); window.addEventListener("click", click); return () => window.removeEventListener("click", click); }, []);

  // Minimap Rendering (Simplified for brevity, logic unchanged)
  useEffect(() => { const canvas = minimapCanvasRef.current; if (!canvas) return; const ctx = canvas.getContext("2d"); if (!ctx) return; const size = canvas.width; const radius = size / 2; const pxPerTile = size / 28; let cx = WORLD_W / 2; let cy = WORLD_H / 2; if (minimap.youId) { const me = minimap.players.find((p) => p.id === minimap.youId); if (me) { cx = me.pos.x + 0.5; cy = me.pos.y + 0.5; } } function toMini(tx: number, ty: number) { const dx = (tx + 0.5 - cx) * pxPerTile; const dy = (ty + 0.5 - cy) * pxPerTile; return { x: radius + dx, y: radius + dy }; } ctx.clearRect(0, 0, size, size); ctx.save(); ctx.beginPath(); ctx.arc(radius, radius, radius - 1, 0, Math.PI * 2); ctx.clip(); ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillRect(0, 0, size, size); const half = 14; const minX = clamp(Math.floor(cx) - half, 0, WORLD_W - 1); const maxX = clamp(Math.floor(cx) + half, 0, WORLD_W - 1); const minY = clamp(Math.floor(cy) - half, 0, WORLD_H - 1); const maxY = clamp(Math.floor(cy) + half, 0, WORLD_H - 1); for (let y = minY; y <= maxY; y++) { for (let x = minX; x <= maxX; x++) { const p = toMini(x, y); if (collision[y][x] === 1) { ctx.fillStyle = "rgba(32,64,128,0.85)"; ctx.fillRect(p.x - pxPerTile/2, p.y - pxPerTile/2, pxPerTile, pxPerTile); } else { ctx.fillStyle = "rgba(20,20,20,0.55)"; ctx.fillRect(p.x - pxPerTile/2, p.y - pxPerTile/2, pxPerTile, pxPerTile); } } } for (const r of minimap.resources) { if (!r.alive) continue; const p = toMini(r.pos.x, r.pos.y); ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(2, pxPerTile * 0.18), 0, Math.PI * 2); ctx.fillStyle = r.type === "tree" ? "rgba(46,204,113,0.95)" : r.type === "rock" ? "rgba(180,180,180,0.95)" : "rgba(241,196,15,0.95)"; ctx.fill(); } for (const pl of minimap.players) { const p = toMini(pl.pos.x, pl.pos.y); ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(2.5, pxPerTile * 0.22), 0, Math.PI * 2); ctx.fillStyle = minimap.youId && pl.id === minimap.youId ? "rgba(102,255,102,1)" : "rgba(102,153,255,0.95)"; ctx.fill(); } if (minimapFlag) { const p = toMini(minimapFlag.x, minimapFlag.y); ctx.save(); ctx.translate(p.x, p.y); ctx.fillStyle = "rgba(255,60,60,0.95)"; ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(0, 10); ctx.lineTo(10, 0); ctx.fill(); ctx.restore(); } ctx.restore(); ctx.beginPath(); ctx.arc(radius, radius, radius - 1, 0, Math.PI * 2); ctx.strokeStyle = "rgba(255,255,255,0.16)"; ctx.lineWidth = 2; ctx.stroke(); }, [minimap, collision, minimapFlag]);
  
  function onMinimapClick(e: React.MouseEvent<HTMLDivElement>) { const rect = e.currentTarget.getBoundingClientRect(); const r = rect.width / 2; const px = e.clientX - rect.left - r; const py = e.clientY - rect.top - r; if (px * px + py * py > (r - 2) * (r - 2)) return; let cx = WORLD_W / 2; let cy = WORLD_H / 2; if (minimap.youId) { const me = minimap.players.find((p) => p.id === minimap.youId); if (me) { cx = me.pos.x + 0.5; cy = me.pos.y + 0.5; } } const pxPerTile = rect.width / 28; const tx = Math.floor(cx + px / pxPerTile); const ty = Math.floor(cy + py / pxPerTile); const target = findClosestWalkable(collision, { x: clamp(tx, 0, WORLD_W - 1), y: clamp(ty, 0, WORLD_H - 1) }, 16); if (target) { setMinimapFlag({ ...target, placedAt: Date.now() }); (window as any).__moveTo?.(target); } }
  
  async function authSubmit() { setAuthError(""); try { const res = await fetch(`${API}/auth/${mode}`, { method: "POST", headers: { "content-type": "application/json" }, body: mode === "login" ? JSON.stringify({ emailOrUsername, password }) : JSON.stringify({ email, username, password }) }); const data = await res.json(); if (!res.ok) throw new Error(data?.error ?? "Request failed"); localStorage.setItem("token", data.token); setToken(data.token); } catch (e: any) { setAuthError(e?.message ?? "Failed"); } }
  function logout() { localStorage.removeItem("token"); setToken(""); setSkills(null); setInventory(null); setWorldLines([]); setPlayerLines([]); setMinimap({ youId: null, players: [], resources: [] }); setMinimapFlag(null); setStatus("disconnected"); setInitialLoading(false); }
  const canSend = useMemo(() => chatInput.trim().length > 0, [chatInput]);
  function sendChat() { const text = chatInput.trim(); if (!text) return; (window as any).__chatSend?.(text); setChatInput(""); }

  if (initialLoading) return <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#07090f", color: "#888" }}>Loading...</div>;
  if (!token) return <AuthScreen mode={mode} setMode={setMode} emailOrUsername={emailOrUsername} setEmailOrUsername={setEmailOrUsername} email={email} setEmail={setEmail} username={username} setUsername={setUsername} password={password} setPassword={setPassword} error={authError} onSubmit={authSubmit} />;
  
  if (assetProgress !== null && assetProgress < 100) return <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#07090f", color: "#e6e8ef", fontFamily: "sans-serif" }}><div style={{ textAlign: "center" }}><div style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>Downloading Assets</div><div style={{ fontSize: 48, fontWeight: 300, color: "#4f86f7" }}>{assetProgress}%</div><div style={{ marginTop: 16, width: 300, height: 4, background: "#222", borderRadius: 2, overflow: "hidden" }}><div style={{ height: "100%", width: `${assetProgress}%`, background: "#4f86f7" }} /></div></div></div>;

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden", background: "#000", position: "relative" }}>
      <div ref={hostRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "hidden" }} />
      {/* HUD (Status, Minimap, Chat, Inv) - Keeping existing positioning */}
      <div style={{ position: "absolute", top: 12, left: 12, padding: "8px 10px", borderRadius: 10, background: "rgba(0,0,0,0.45)", border: "1px solid rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.88)", fontFamily: "system-ui, sans-serif", fontSize: 12, pointerEvents: "none" }}><div>{status}</div><div style={{ marginTop: 2, opacity: 0.8 }}>{skills ? `XP  WC:${skills.woodcutting}  MIN:${skills.mining}  FSH:${skills.fishing}` : "XP —"}</div></div>
      <div onClick={onMinimapClick} style={{ position: "absolute", top: 12, right: 12, width: 180, height: 180, borderRadius: "50%", overflow: "hidden", background: "rgba(0,0,0,0.22)", border: "2px solid rgba(255,255,255,0.12)", cursor: "pointer", pointerEvents: "auto" }}><canvas ref={minimapCanvasRef} width={180} height={180} style={{ width: "100%", height: "100%", display: "block" }} /></div>
      <div style={{ position: "absolute", right: 12, bottom: 64, width: 300, background: "rgba(0,0,0,0.55)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", color: "white", fontSize: 13, fontWeight: 700, marginBottom: 8 }}><div>Inventory</div><div style={{ opacity: 0.7, fontSize: 11 }}>30 slots</div></div>
        {invFullFlash && <div style={{ marginBottom: 8, padding: 6, background: "rgba(255,60,60,0.2)", color: "#ffcccc", borderRadius: 6, fontSize: 11, textAlign: "center" }}>Inventory Full</div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>{Array.from({ length: 30 }, (_, i) => { const s = inventory?.[i]; return <div key={i} title={s ? itemName(s.itemId) : "Empty"} style={{ height: 40, background: s ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.03)", borderRadius: 6, display: "grid", placeItems: "center", color: "white", fontSize: 10, position: "relative" }}>{s && <><div style={{fontWeight:600}}>{itemName(s.itemId).slice(0,3)}</div><div style={{position:"absolute", right:2, bottom:1, opacity:0.8}}>{s.qty}</div></>}</div> })}</div>
      </div>
      <div style={{ position: "absolute", left: 12, bottom: 12, width: 420, minWidth: 320, background: "rgba(0,0,0,0.55)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: 10, color: "white" }}>
         <div style={{ display: "flex", gap: 8, marginBottom: 8 }}><button onClick={() => setChatTab("world")} style={{ flex: 1, padding: 6, borderRadius: 6, background: chatTab === "world" ? "rgba(255,255,255,0.15)" : "transparent", border: "1px solid rgba(255,255,255,0.1)", color: "white", cursor: "pointer" }}>World</button><button onClick={() => setChatTab("player")} style={{ flex: 1, padding: 6, borderRadius: 6, background: chatTab === "player" ? "rgba(255,255,255,0.15)" : "transparent", border: "1px solid rgba(255,255,255,0.1)", color: "white", cursor: "pointer" }}>Player</button></div>
         <div ref={chatBoxRef} style={{ height: 140, overflowY: "auto", fontSize: 12, marginBottom: 8 }}>{activeLines.map((l) => <div key={l.id} style={{ marginBottom: 4, opacity: l.from.id==="system"?0.7:1 }}><span style={{ opacity: 0.5 }}>[{fmtTime(l.ts)}]</span> <b>{l.from.name}:</b> {l.text}</div>)}</div>
         <div style={{ display: "flex", gap: 8 }}><input value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && canSend && sendChat()} placeholder="Chat..." style={{ flex: 1, background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "8px 10px", color: "white", outline: "none" }} /><button onClick={sendChat} disabled={!canSend} style={{ padding: "0 16px", borderRadius: 6, background: canSend ? "rgba(80,140,255,0.3)" : "rgba(255,255,255,0.05)", border: "none", color: "white", cursor: canSend ? "pointer" : "default" }}>Send</button></div>
      </div>

      <AdminModal
        open={adminOpen}
        adminRights={adminRights}
        snapshot={adminSnapshot}
        onRefresh={refreshSnapshot}
        onClose={() => { setAdminOpen(false); setAdminTool({ mode: "off" }); }}
        token={token}
        adminTool={adminTool}
        setAdminTool={setAdminTool}
      />

      {menu && <div style={{ position: "absolute", left: menu.x, top: menu.y, zIndex: 100, background: "rgba(20,20,25,0.95)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, padding: 4, minWidth: 140 }} onMouseDown={e => e.stopPropagation()}>{menu.options.map((opt, i) => <div key={i} onClick={(e) => { e.stopPropagation(); opt.action(); setMenu(null); }} style={{ padding: "6px 10px", fontSize: 13, fontFamily: "sans-serif", color: opt.isCancel ? "#ff6b6b" : "white", cursor: "pointer" }} onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.1)"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>{opt.label}</div>)}</div>}
      <button onClick={logout} style={{ position: "absolute", right: 12, bottom: 12, padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.6)", color: "white", cursor: "pointer", fontSize: 11 }}>Logout</button>
    </div>
  );
}
