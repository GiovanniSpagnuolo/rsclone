import React from "react";
import { smallBtnStyle, inputStyle } from "../styles";
import type { AdminTool } from "./AdminDock";

export function AdminShell(props: {
  open: boolean;
  adminRights: number;
  onRefresh: () => void;
  onClose: () => void;

  // State
  adminTab: "map" | "items" | "resources" | "loot" | "players" | "assets";
  setAdminTab: (t: any) => void;
  
  // Map Tool Props
  selectedDefId: string;
  setSelectedDefId: (id: string) => void;
  defs: { id: string }[];
  adminTool: AdminTool;
  setAdminTool: (t: AdminTool) => void;

  // Content Bodies
  children: React.ReactNode;
}) {
  // FIX 1: Respect the open prop!
  if (!props.open) return null;

  return (
    <>
      {/* 1. TOP BAR (Always Visible when open) */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0,
        height: 54,
        background: "rgba(10, 12, 16, 0.98)", // Darker background
        borderBottom: "1px solid rgba(255,255,255,0.12)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 16px", zIndex: 90,
        color: "#e6e8ef", // FIX 2: White text
        fontFamily: "system-ui, sans-serif"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ fontWeight: 800, letterSpacing: 0.5, color: "#fff" }}>ADMIN</div>
          
          <div style={{ display: "flex", gap: 4 }}>
            {["map", "items", "resources", "loot", "players", "assets"].map(t => (
              <button
                key={t}
                onClick={() => props.setAdminTab(t)}
                style={{
                  ...smallBtnStyle(props.adminTab === t ? "blue" : "neutral"),
                  textTransform: "capitalize",
                  minWidth: 70
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Map Tool Context Controls */}
          {props.adminTab === "map" && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 16, borderLeft: "1px solid rgba(255,255,255,0.1)" }}>
              <select
                value={props.selectedDefId}
                onChange={(e) => {
                   props.setSelectedDefId(e.target.value);
                   if (props.adminTool.mode === "place") props.setAdminTool({ mode: "place", defId: e.target.value });
                }}
                // FIX 3: Input styling for dark mode
                style={{ ...inputStyle(), width: 160, background: "rgba(0,0,0,0.4)", color: "white" }}
              >
                {props.defs.map(d => <option key={d.id} value={d.id}>{d.id}</option>)}
              </select>
              <button onClick={() => props.setAdminTool({ mode: "place", defId: props.selectedDefId })} style={smallBtnStyle(props.adminTool.mode === "place" ? "blue" : "neutral")}>Place</button>
              <button onClick={() => props.setAdminTool({ mode: "remove" })} style={smallBtnStyle(props.adminTool.mode === "remove" ? "red" : "neutral")}>Remove</button>
              <button onClick={() => props.setAdminTool({ mode: "off" })} style={smallBtnStyle("neutral")}>Off</button>
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={props.onRefresh} style={smallBtnStyle("neutral")}>Refresh</button>
          <button onClick={props.onClose} style={smallBtnStyle("red")}>Close</button>
        </div>
      </div>

      {/* 2. MAIN CONTENT OVERLAY (Hidden in Map Mode) */}
      {props.adminTab !== "map" && (
        <div style={{
          position: "absolute", top: 54, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.75)", // Darker backdrop
          display: "flex", justifyContent: "center", paddingTop: 40,
          zIndex: 80,
          color: "#e6e8ef"
        }}>
          <div style={{
            width: "90%", maxWidth: 1200, height: "80%",
            background: "#12141a",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 12,
            boxShadow: "0 20px 50px rgba(0,0,0,0.8)",
            display: "flex", flexDirection: "column", overflow: "hidden"
          }}>
            {props.children}
          </div>
        </div>
      )}
    </>
  );
}
