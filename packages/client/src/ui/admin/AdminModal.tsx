import React, { useEffect, useState } from "react";
import { AdminShell } from "./AdminShell";
import { inputStyle as baseInputStyle, smallBtnStyle } from "../styles";
import type {
  AdminItemRow, AdminPlayerRow, AdminResourceDefRow, AdminResourceLootRow, AdminResourceSpawnRow
} from "@rsclone/shared/protocol";

const API = "http://localhost:8081";
function asInt(val: string, fallback: number) { const n = parseInt(val, 10); return isNaN(n) ? fallback : n; }
function safeJsonString(s: string | undefined) { if (!s) return "{}"; try { JSON.parse(s); return s; } catch { return "{}"; } }

// Force dark theme styles for inputs
const darkInput = {
  ...baseInputStyle(),
  background: "rgba(0,0,0,0.3)",
  color: "#e6e8ef",
  border: "1px solid rgba(255,255,255,0.15)"
};

// Option style for selects (so text is visible in dropdown)
const optionStyle = { color: "#000" };

type AdminSnapshot = { items: AdminItemRow[]; resourceDefs: AdminResourceDefRow[]; resourceLoot: AdminResourceLootRow[]; resourceSpawns: AdminResourceSpawnRow[]; players: AdminPlayerRow[]; };
type AdminAssetRow = { name: string; size: number; updated_at: number; };
type AdminTool = { mode: "off" } | { mode: "place"; defId: string } | { mode: "remove" };

export function AdminModal(props: {
  open: boolean;
  adminRights: number;
  snapshot: AdminSnapshot | null;
  onRefresh: () => void;
  onClose: () => void;
  token: string;
  adminTool: AdminTool;
  setAdminTool: (t: any) => void;
}) {
  const { open, snapshot, token, onRefresh } = props;
  const [tab, setTab] = useState<"map" | "items" | "resources" | "loot" | "players" | "assets">("map");
  
  const [searchItems, setSearchItems] = useState("");
  const [searchDefs, setSearchDefs] = useState("");
  const [searchPlayers, setSearchPlayers] = useState("");

  const [itemsDraft, setItemsDraft] = useState<AdminItemRow[]>([]);
  const [defsDraft, setDefsDraft] = useState<AdminResourceDefRow[]>([]);
  const [lootDraftByRes, setLootDraftByRes] = useState<Record<string, AdminResourceLootRow[]>>({});
  const [playersDraft, setPlayersDraft] = useState<AdminPlayerRow[]>([]);
  
  const [dirtyItems, setDirtyItems] = useState(() => new Set<string>());
  const [dirtyDefs, setDirtyDefs] = useState(() => new Set<string>());
  const [dirtyLoot, setDirtyLoot] = useState(() => new Set<string>());
  const [dirtyPlayers, setDirtyPlayers] = useState(() => new Set<string>());

  const [selectedDefId, setSelectedDefId] = useState<string>("tree_basic");
  const [assetsList, setAssetsList] = useState<AdminAssetRow[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (!snapshot) return;
    setItemsDraft(snapshot.items ?? []);
    setDefsDraft(snapshot.resourceDefs ?? []);
    setPlayersDraft(snapshot.players ?? []);
    const lootMap: Record<string, AdminResourceLootRow[]> = {};
    for (const r of snapshot.resourceLoot ?? []) {
      if (!lootMap[r.resourceId]) lootMap[r.resourceId] = [];
      lootMap[r.resourceId].push(r);
    }
    setLootDraftByRes(lootMap);
    setDirtyItems(new Set()); setDirtyDefs(new Set()); setDirtyLoot(new Set()); setDirtyPlayers(new Set());
    if (snapshot.resourceDefs?.[0]?.id) setSelectedDefId(snapshot.resourceDefs[0].id);
  }, [snapshot]);

  useEffect(() => { if (open && (tab === "assets" || tab === "resources")) fetchAssets(); }, [open, tab]);

  function adminSend(msg: any) { (window as any).__adminSend?.(msg); }
  async function fetchAssets() { try { const res = await fetch(`${API}/admin/assets`, { headers: { Authorization: `Bearer ${token}` } }); if (res.ok) setAssetsList(await res.json()); } catch (e) {} }
  async function uploadAsset(file: File) { setIsUploading(true); try { await fetch(`${API}/admin/assets?name=${encodeURIComponent(file.name)}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/octet-stream" }, body: file }); await fetchAssets(); } catch { alert("Upload failed"); } finally { setIsUploading(false); } }
  async function deleteAsset(name: string) { if (!confirm(`Delete ${name}?`)) return; await fetch(`${API}/admin/assets?name=${encodeURIComponent(name)}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }); await fetchAssets(); }

  const filteredItems = itemsDraft.filter(i => i.name.toLowerCase().includes(searchItems.toLowerCase()) || i.id.toLowerCase().includes(searchItems.toLowerCase()));
  const filteredDefs = defsDraft.filter(d => d.name.toLowerCase().includes(searchDefs.toLowerCase()) || d.id.toLowerCase().includes(searchDefs.toLowerCase()));
  const filteredPlayers = playersDraft.filter(p => p.username.toLowerCase().includes(searchPlayers.toLowerCase()));

  return (
    <AdminShell
      open={props.open}
      adminRights={props.adminRights}
      onRefresh={props.onRefresh}
      onClose={props.onClose}
      adminTab={tab}
      setAdminTab={setTab}
      selectedDefId={selectedDefId}
      setSelectedDefId={setSelectedDefId}
      defs={defsDraft}
      adminTool={props.adminTool}
      setAdminTool={props.setAdminTool}
    >
      {tab === "items" && (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: 16, color: "#e6e8ef" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
            <input placeholder="Search items..." value={searchItems} onChange={e => setSearchItems(e.target.value)} style={{ ...darkInput, width: 300 }} />
            <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => { const id = `item_${Date.now()}`; setItemsDraft([{ id, name: "New Item", itemType: "misc", equipSlot: null, stackable: true, stackLimit: 999, splittable: false, consumable: false, metaJson: "{}" }, ...itemsDraft]); setDirtyItems(s => new Set(s).add(id)); }} style={smallBtnStyle("blue")}>+ Add</button>
                <button onClick={() => { dirtyItems.forEach(id => { const r = itemsDraft.find(x => x.id === id); if (r) adminSend({ t: "adminUpsertItem", item: r }); }); }} style={smallBtnStyle("neutral")}>Save ({dirtyItems.size})</button>
            </div>
          </div>
          <div style={{ flex: 1, overflow: "auto", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }}>
             <div style={{ display: "grid", gridTemplateColumns: "150px 1fr 100px 80px 60px 60px 60px 60px 100px", fontWeight: "bold", padding: "10px 6px", background: "#1a1d26", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                <div>ID</div><div>Name</div><div>Type</div><div>Slot</div><div>Stack</div><div>Limit</div><div>Split</div><div>Cons</div><div>Meta</div>
             </div>
             {filteredItems.map(r => (
                 <div key={r.id} style={{ display: "grid", gridTemplateColumns: "150px 1fr 100px 80px 60px 60px 60px 60px 100px", padding: 4, borderBottom: "1px solid rgba(255,255,255,0.05)", background: dirtyItems.has(r.id) ? "rgba(80,140,255,0.15)" : undefined, alignItems: "center" }}>
                    <div style={{ opacity: 0.7, paddingLeft: 4, fontSize: 11 }}>{r.id}</div>
                    <input value={r.name} onChange={e => { setItemsDraft(prev => prev.map(x => x.id===r.id ? {...x, name: e.target.value} : x)); setDirtyItems(s => new Set(s).add(r.id)); }} style={darkInput} />
                    <input value={r.itemType} onChange={e => { setItemsDraft(prev => prev.map(x => x.id===r.id ? {...x, itemType: e.target.value} : x)); setDirtyItems(s => new Set(s).add(r.id)); }} style={darkInput} />
                    <input value={r.equipSlot ?? ""} onChange={e => { setItemsDraft(prev => prev.map(x => x.id===r.id ? {...x, equipSlot: e.target.value || null} : x)); setDirtyItems(s => new Set(s).add(r.id)); }} style={darkInput} />
                    <div style={{ textAlign: "center" }}><input type="checkbox" checked={r.stackable} onChange={e => { setItemsDraft(prev => prev.map(x => x.id===r.id ? {...x, stackable: e.target.checked} : x)); setDirtyItems(s => new Set(s).add(r.id)); }} /></div>
                    <input value={String(r.stackLimit)} onChange={e => { setItemsDraft(prev => prev.map(x => x.id===r.id ? {...x, stackLimit: asInt(e.target.value, 1)} : x)); setDirtyItems(s => new Set(s).add(r.id)); }} style={darkInput} />
                    <div style={{ textAlign: "center" }}><input type="checkbox" checked={r.splittable} onChange={e => { setItemsDraft(prev => prev.map(x => x.id===r.id ? {...x, splittable: e.target.checked} : x)); setDirtyItems(s => new Set(s).add(r.id)); }} /></div>
                    <div style={{ textAlign: "center" }}><input type="checkbox" checked={r.consumable} onChange={e => { setItemsDraft(prev => prev.map(x => x.id===r.id ? {...x, consumable: e.target.checked} : x)); setDirtyItems(s => new Set(s).add(r.id)); }} /></div>
                    <input value={r.metaJson} onChange={e => { setItemsDraft(prev => prev.map(x => x.id===r.id ? {...x, metaJson: e.target.value} : x)); setDirtyItems(s => new Set(s).add(r.id)); }} style={darkInput} />
                 </div>
             ))}
          </div>
        </div>
      )}

      {tab === "resources" && (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: 16, color: "#e6e8ef" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
            <input placeholder="Search resources..." value={searchDefs} onChange={e => setSearchDefs(e.target.value)} style={{ ...darkInput, width: 300 }} />
            <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => { const id = `res_${Date.now()}`; setDefsDraft([{ id, name: "New", resourceType: "tree", skill: "woodcutting", xpGain: 10, ticksMin: 3, ticksMax: 5, respawnMs: 5000, mesh: "tree.glb", depletedMesh: "", collision: "block", metaJson: "{}" }, ...defsDraft]); setDirtyDefs(s => new Set(s).add(id)); }} style={smallBtnStyle("blue")}>+ Add</button>
                <button onClick={() => { dirtyDefs.forEach(id => { const r = defsDraft.find(x => x.id === id); if (r) adminSend({ t: "adminUpsertResourceDef", def: { ...r, metaJson: safeJsonString(r.metaJson) } }); }); }} style={smallBtnStyle("neutral")}>Save ({dirtyDefs.size})</button>
            </div>
          </div>
          <div style={{ flex: 1, overflow: "auto", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }}>
             <div style={{ display: "grid", gridTemplateColumns: "120px 120px 100px 90px 60px 60px 60px 100px 100px 100px 1fr", fontWeight: "bold", padding: "10px 6px", background: "#1a1d26", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                <div>ID</div><div>Name</div><div>Type</div><div>Skill</div><div>XP</div><div>Min</div><div>Max</div><div>Resp(ms)</div><div>Mesh</div><div>Depl</div><div>Meta</div>
             </div>
             {filteredDefs.map(r => (
                 <div key={r.id} style={{ display: "grid", gridTemplateColumns: "120px 120px 100px 90px 60px 60px 60px 100px 100px 100px 1fr", padding: 4, borderBottom: "1px solid rgba(255,255,255,0.05)", background: dirtyDefs.has(r.id) ? "rgba(80,140,255,0.15)" : undefined, alignItems: "center" }}>
                    <div style={{ opacity: 0.7, paddingLeft: 4, fontSize: 11 }}>{r.id}</div>
                    <input value={r.name} onChange={e => { setDefsDraft(prev => prev.map(x => x.id===r.id ? {...x, name: e.target.value} : x)); setDirtyDefs(s => new Set(s).add(r.id)); }} style={darkInput} />
                    <select value={r.resourceType} onChange={e => { setDefsDraft(prev => prev.map(x => x.id===r.id ? {...x, resourceType: e.target.value as any} : x)); setDirtyDefs(s => new Set(s).add(r.id)); }} style={darkInput}><option style={optionStyle} value="tree">tree</option><option style={optionStyle} value="rock">rock</option><option style={optionStyle} value="fishing_spot">fish</option></select>
                    <select value={r.skill} onChange={e => { setDefsDraft(prev => prev.map(x => x.id===r.id ? {...x, skill: e.target.value as any} : x)); setDirtyDefs(s => new Set(s).add(r.id)); }} style={darkInput}><option style={optionStyle} value="woodcutting">wc</option><option style={optionStyle} value="mining">min</option><option style={optionStyle} value="fishing">fish</option></select>
                    <input value={String(r.xpGain)} onChange={e => { setDefsDraft(prev => prev.map(x => x.id===r.id ? {...x, xpGain: asInt(e.target.value, 0)} : x)); setDirtyDefs(s => new Set(s).add(r.id)); }} style={darkInput} />
                    <input value={String(r.ticksMin)} onChange={e => { setDefsDraft(prev => prev.map(x => x.id===r.id ? {...x, ticksMin: asInt(e.target.value, 1)} : x)); setDirtyDefs(s => new Set(s).add(r.id)); }} style={darkInput} />
                    <input value={String(r.ticksMax)} onChange={e => { setDefsDraft(prev => prev.map(x => x.id===r.id ? {...x, ticksMax: asInt(e.target.value, 1)} : x)); setDirtyDefs(s => new Set(s).add(r.id)); }} style={darkInput} />
                    <input value={String(r.respawnMs)} onChange={e => { setDefsDraft(prev => prev.map(x => x.id===r.id ? {...x, respawnMs: asInt(e.target.value, 0)} : x)); setDirtyDefs(s => new Set(s).add(r.id)); }} style={darkInput} />
                    <select value={r.mesh ?? ""} onChange={e => { setDefsDraft(prev => prev.map(x => x.id===r.id ? {...x, mesh: e.target.value} : x)); setDirtyDefs(s => new Set(s).add(r.id)); }} style={darkInput}><option style={optionStyle} value="">(none)</option>{assetsList.map(a => <option style={optionStyle} key={a.name} value={a.name}>{a.name}</option>)}</select>
                    <select value={r.depletedMesh ?? ""} onChange={e => { setDefsDraft(prev => prev.map(x => x.id===r.id ? {...x, depletedMesh: e.target.value} : x)); setDirtyDefs(s => new Set(s).add(r.id)); }} style={darkInput}><option style={optionStyle} value="">(none)</option>{assetsList.map(a => <option style={optionStyle} key={a.name} value={a.name}>{a.name}</option>)}</select>
                    <input value={r.metaJson} onChange={e => { setDefsDraft(prev => prev.map(x => x.id===r.id ? {...x, metaJson: e.target.value} : x)); setDirtyDefs(s => new Set(s).add(r.id)); }} style={darkInput} />
                 </div>
             ))}
          </div>
        </div>
      )}

      {tab === "loot" && (
          <div style={{ height: "100%", display: "grid", gridTemplateColumns: "240px 1fr", gap: 12, padding: 16 }}>
             <div style={{ border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, overflow: "hidden", display: "flex", flexDirection: "column" }}>
               <div style={{ padding: 10, background: "rgba(255,255,255,0.04)", fontWeight: 900, borderBottom: "1px solid rgba(255,255,255,0.1)" }}>Select Resource</div>
               <div style={{ overflow: "auto", flex: 1 }}>
                 {defsDraft.map(d => (
                   <div key={d.id}
                        onClick={() => setSelectedDefId(d.id)}
                        style={{ padding: "8px 10px", cursor: "pointer", background: selectedDefId === d.id ? "rgba(80,140,255,0.2)" : "transparent", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                      <div style={{ fontWeight: 600 }}>{d.id} {dirtyLoot.has(d.id) && "●"}</div>
                      <div style={{ fontSize: 11, opacity: 0.7 }}>{d.name}</div>
                   </div>
                 ))}
               </div>
             </div>

             <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
               <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <div style={{ fontSize: 16, fontWeight: 900 }}>Loot for {selectedDefId}</div>
                  <div style={{ display: "flex", gap: 8 }}>
                     <button onClick={() => { setLootDraftByRes(prev => ({ ...prev, [selectedDefId]: [...(prev[selectedDefId]||[]), { resourceId: selectedDefId, itemId: "logs", minQty: 1, maxQty: 1, weight: 10 }] })); setDirtyLoot(s => new Set([...s, selectedDefId])); }} style={smallBtnStyle("blue")}>+ Row</button>
                     <button onClick={() => { adminSend({ t: "adminSetResourceLoot", resourceId: selectedDefId, loot: lootDraftByRes[selectedDefId] ?? [] }); setDirtyLoot(s => { const n = new Set(s); n.delete(selectedDefId); return n; }); }} style={smallBtnStyle("neutral")}>Save</button>
                  </div>
               </div>

               <div style={{ flex: 1, overflow: "auto", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }}>
                  <div style={{ minWidth: 500, display: "grid", gridTemplateColumns: "1fr 80px 80px 80px 80px", fontWeight: "bold", padding: 10, background: "#1a1d26" }}>
                     <div>Item ID</div><div>Min</div><div>Max</div><div>Weight</div><div>Del</div>
                  </div>
                  {(lootDraftByRes[selectedDefId] ?? []).map((row, i) => {
                     const set = (patch: Partial<AdminResourceLootRow>) => { const list = [...(lootDraftByRes[selectedDefId] ?? [])]; list[i] = { ...list[i], ...patch }; setLootDraftByRes(p => ({ ...p, [selectedDefId]: list })); setDirtyLoot(s => new Set([...s, selectedDefId])); };
                     return (
                       <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 80px 80px", padding: 4, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                          <input value={row.itemId} onChange={e => set({ itemId: e.target.value as any })} style={darkInput} />
                          <input value={String(row.minQty)} onChange={e => set({ minQty: asInt(e.target.value, row.minQty) })} style={darkInput} />
                          <input value={String(row.maxQty)} onChange={e => set({ maxQty: asInt(e.target.value, row.maxQty) })} style={darkInput} />
                          <input value={String(row.weight)} onChange={e => set({ weight: asInt(e.target.value, row.weight) })} style={darkInput} />
                          <button onClick={() => { const list = [...(lootDraftByRes[selectedDefId] ?? [])]; list.splice(i, 1); setLootDraftByRes(p => ({ ...p, [selectedDefId]: list })); setDirtyLoot(s => new Set([...s, selectedDefId])); }} style={smallBtnStyle("red")}>X</button>
                       </div>
                     )
                  })}
               </div>
             </div>
          </div>
      )}

      {tab === "players" && (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
            <input placeholder="Search players..." value={searchPlayers} onChange={e => setSearchPlayers(e.target.value)} style={{ ...darkInput, width: 300 }} />
            <button onClick={() => { dirtyPlayers.forEach(id => { const row = playersDraft.find(x => x.userId === id); if (row) adminSend({ t: "adminUpdatePlayer", player: row }); }); }} style={smallBtnStyle("neutral")}>Save ({dirtyPlayers.size})</button>
          </div>
          <div style={{ flex: 1, overflow: "auto", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }}>
            <div style={{ minWidth: 900, display: "grid", gridTemplateColumns: "140px 140px 60px 60px 60px 60px 60px 60px 1fr", fontWeight: "bold", padding: 10, background: "#1a1d26" }}>
               <div>Username</div><div>CharName</div><div>Rights</div><div>X</div><div>Y</div><div>WC</div><div>MIN</div><div>FISH</div><div>User ID</div>
            </div>
            {filteredPlayers.map(p => {
               const isDirty = dirtyPlayers.has(p.userId);
               const set = (patch: Partial<AdminPlayerRow>) => { setPlayersDraft(prev => prev.map(x => x.userId === p.userId ? { ...x, ...patch } : x)); setDirtyPlayers(s => new Set([...s, p.userId])); };
               return (
                 <div key={p.userId} style={{ display: "grid", gridTemplateColumns: "140px 140px 60px 60px 60px 60px 60px 60px 1fr", padding: 4, borderBottom: "1px solid rgba(255,255,255,0.05)", background: isDirty ? "rgba(80,140,255,0.15)" : undefined, alignItems: "center" }}>
                    <div style={{ paddingLeft: 4 }}>{p.username}</div>
                    <input value={p.charName} onChange={e => set({ charName: e.target.value })} style={darkInput} />
                    <input value={String(p.rights)} onChange={e => set({ rights: asInt(e.target.value, p.rights) })} style={darkInput} />
                    <input value={String(p.x)} onChange={e => set({ x: asInt(e.target.value, p.x) })} style={darkInput} />
                    <input value={String(p.y)} onChange={e => set({ y: asInt(e.target.value, p.y) })} style={darkInput} />
                    <input value={String(p.xpWoodcutting)} onChange={e => set({ xpWoodcutting: asInt(e.target.value, p.xpWoodcutting) })} style={darkInput} />
                    <input value={String(p.xpMining)} onChange={e => set({ xpMining: asInt(e.target.value, p.xpMining) })} style={darkInput} />
                    <input value={String(p.xpFishing)} onChange={e => set({ xpFishing: asInt(e.target.value, p.xpFishing) })} style={darkInput} />
                    <div style={{ fontSize: 10, opacity: 0.5, paddingLeft: 4 }}>{p.userId}</div>
                 </div>
               );
            })}
          </div>
        </div>
      )}

      {tab === "assets" && (
          <div style={{ padding: 16 }}>
             <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                {isUploading && <span>Uploading...</span>}
                <label style={{ ...smallBtnStyle("blue"), position: "relative" }}>+ Upload<input type="file" style={{position:"absolute",inset:0,opacity:0}} onChange={e => e.target.files?.[0] && uploadAsset(e.target.files[0])} /></label>
                <button onClick={() => window.open(`${API}/game.cache`, "_blank")} style={smallBtnStyle("neutral")}>Download Cache</button>
             </div>
             <div style={{ flex: 1, overflow: "auto", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 180px 80px", gap: 4, fontWeight: "bold", padding: 10, background: "#1a1d26" }}><div>Name</div><div>Size</div><div>Date</div><div></div></div>
                {assetsList.map(a => (
                    <div key={a.name} style={{ display: "grid", gridTemplateColumns: "1fr 100px 180px 80px", gap: 4, padding: 8, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                        <div>{a.name}</div>
                        <div>{(a.size/1024).toFixed(1)} KB</div>
                        <div>{new Date(a.updated_at).toLocaleString()}</div>
                        <button onClick={() => deleteAsset(a.name)} style={smallBtnStyle("red")}>Delete</button>
                    </div>
                ))}
             </div>
          </div>
      )}
    </AdminShell>
  );
}
