import React, { useEffect, useState } from "react";
import { inputStyle, smallBtnStyle } from "../styles";
import type { AdminTool, TerrainMaterial } from "@rsclone/shared/protocol";

export function AdminDock(props: {
  adminRights: number;
  selectedDefId: string;
  setSelectedDefId: (id: string) => void;
  defs: { id: string }[];
  materials: TerrainMaterial[];

  adminTool: AdminTool;
  setAdminTool: (t: AdminTool | ((prev: AdminTool) => AdminTool)) => void;

  onOpen: () => void;
  onRefresh: () => void;
  onClose: () => void;
}) {
  const { adminRights, selectedDefId, setSelectedDefId, defs, materials, adminTool, setAdminTool, onOpen, onRefresh, onClose } = props;

  // Local UI state
  const [tab, setTab] = useState<"objects" | "terrain">("objects");
  const [brushSize, setBrushSize] = useState(1);
  const [selectedMatId, setSelectedMatId] = useState("grass");

  // Sync tool state to window for the game engine
  useEffect(() => {
    (window as any).__adminTool = adminTool;
  }, [adminTool]);

  const btn = (active: boolean, color: "blue" | "red" | "neutral" = "neutral") => ({
    ...smallBtnStyle(active ? color : "neutral"),
    border: active ? "1px solid rgba(255,255,255,0.6)" : "1px solid transparent"
  });

  if (adminRights < 2) return null;

  return (
    <div
      style={{
        position: "absolute", right: 12, top: 220, zIndex: 60, width: 340,
        background: "rgba(12,14,20,0.9)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 14,
        boxShadow: "0 20px 70px rgba(0,0,0,0.55)", color: "#e6e8ef",
        fontFamily: "system-ui, sans-serif", padding: 12, pointerEvents: "auto"
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
        <div style={{ fontWeight: 900, letterSpacing: 0.5 }}>Level Editor</div>
        <div style={{ fontSize: 11, opacity: 0.5 }}>rights: {adminRights}</div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 12, background: "rgba(0,0,0,0.3)", padding: 4, borderRadius: 8 }}>
        <button onClick={() => { setTab("objects"); setAdminTool({ mode: "off" }); }} style={{ flex: 1, ...btn(tab === "objects"), fontSize: 12 }}>Objects</button>
        <button onClick={() => { setTab("terrain"); setAdminTool({ mode: "off" }); }} style={{ flex: 1, ...btn(tab === "terrain"), fontSize: 12 }}>Terrain</button>
      </div>

      <div style={{ background: "rgba(255,255,255,0.03)", padding: 10, borderRadius: 10, border: "1px solid rgba(255,255,255,0.05)" }}>
        
        {/* --- OBJECTS TAB --- */}
        {tab === "objects" && (
          <div style={{ display: "grid", gap: 10 }}>
            <div>
               <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>Select Object</div>
               <select
                 value={selectedDefId}
                 onChange={(e) => {
                   const v = e.target.value;
                   setSelectedDefId(v);
                   // Update tool immediately if we are already in place mode
                   if(adminTool.mode === "place") setAdminTool({ mode: "place", defId: v });
                 }}
                 style={{ ...inputStyle(), width: "100%", background: "rgba(0,0,0,0.3)", color: "white" }}
               >
                 {(defs.length ? defs : [{ id: "tree_basic" }]).map(d => <option key={d.id} value={d.id}>{d.id}</option>)}
               </select>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setAdminTool({ mode: "place", defId: selectedDefId })} style={btn(adminTool.mode === "place", "blue")}>Place</button>
              <button onClick={() => setAdminTool({ mode: "remove" })} style={btn(adminTool.mode === "remove", "red")}>Remove</button>
              <button onClick={() => setAdminTool({ mode: "off" })} style={btn(adminTool.mode === "off")}>Off</button>
            </div>
          </div>
        )}

        
          {/* --- TERRAIN TAB --- */}
                  {tab === "terrain" && (
                    <div style={{ display: "grid", gap: 10 }}>
                       {/* Tools */}
                       <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          <button onClick={() => setAdminTool({ mode: "terrain_paint", matId: selectedMatId, brushSize })} style={btn(adminTool.mode === "terrain_paint", "blue")}>Paint</button>
                          <button onClick={() => setAdminTool({ mode: "terrain_height", subMode: "raise", brushSize, strength: 0.5 })} style={btn(adminTool.mode === "terrain_height" && (adminTool as any).subMode === "raise", "blue")}>Raise</button>
                          <button onClick={() => setAdminTool({ mode: "terrain_height", subMode: "lower", brushSize, strength: 0.5 })} style={btn(adminTool.mode === "terrain_height" && (adminTool as any).subMode === "lower", "blue")}>Lower</button>
                          <button onClick={() => setAdminTool({ mode: "terrain_height", subMode: "flatten", brushSize, strength: 0.5 })} style={btn(adminTool.mode === "terrain_height" && (adminTool as any).subMode === "flatten", "blue")}>Flat</button>
                          <button onClick={() => setAdminTool({ mode: "off" })} style={btn(adminTool.mode === "off")}>Off</button>
                       </div>

                       {/* Brush Settings */}
                       <div>
                          <div style={{ fontSize: 10, opacity: 0.7 }}>Brush Size: {brushSize}</div>
                          <input type="range" min="1" max="5" step="1" value={brushSize} onChange={e => { const s = Number(e.target.value); setBrushSize(s); setAdminTool(prev => ({ ...prev, brushSize: s } as any)); }} style={{ width: "100%" }} />
                       </div>

                       {/* Material Picker (Only show if painting) */}
                       {adminTool.mode === "terrain_paint" && (
                         <div>
                            <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>Material</div>
                            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                               {(materials.length ? materials : [{ id: "grass", color: 0x55ff55 }]).map(m => (
                                 <div
                                   key={m.id}
                                   onClick={() => { setSelectedMatId(m.id); setAdminTool({ mode: "terrain_paint", matId: m.id, brushSize }); }}
                                   title={m.name}
                                   style={{
                                     width: 24, height: 24, borderRadius: 4, cursor: "pointer",
                                     backgroundColor: "#" + m.color.toString(16).padStart(6, "0"),
                                     border: selectedMatId === m.id ? "2px solid white" : "1px solid rgba(255,255,255,0.2)"
                                   }}
                                 />
                               ))}
                            </div>
                         </div>
                       )}
                    </div>
                  )}
          </div>

      <div style={{ display: "flex", gap: 8, marginTop: 12, borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 10 }}>
        <button onClick={onOpen} style={smallBtnStyle("neutral")}>Full Panel</button>
        <button onClick={onRefresh} style={smallBtnStyle("neutral")}>Reload</button>
      </div>
    </div>
  );
}
