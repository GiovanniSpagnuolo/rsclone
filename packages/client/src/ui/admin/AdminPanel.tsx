//
//  AdminPanel.tsx
//  
//
//  Created by Giovanni Spagnuolo on 2/10/26.
//


// packages/client/src/ui/admin/AdminPanel.tsx
import React from "react";
import { pillStyle } from "../styles";
import type { AdminTool } from "./AdminDock";

export function AdminPanel(props: {
  adminTab: "map" | "items" | "resources" | "loot" | "players";
  setAdminTab: (t: "map" | "items" | "resources" | "loot" | "players") => void;

  adminTool: AdminTool;
  dirtyItems: number;
  dirtyDefs: number;
  dirtyLoot: number;
  dirtyPlayers: number;

  snapshotCounts: {
    items: number;
    resourceDefs: number;
    resourceLoot: number;
    resourceSpawns: number;
    players: number;
  };

  // You supply tab bodies (so you can move them later)
  mapBody: React.ReactNode;
  itemsBody: React.ReactNode;
  resourcesBody: React.ReactNode;
  lootBody: React.ReactNode;
  playersBody: React.ReactNode;
}) {
  const {
    adminTab,
    setAdminTab,
    adminTool,
    dirtyItems,
    dirtyDefs,
    dirtyLoot,
    dirtyPlayers,
    snapshotCounts,
    mapBody,
    itemsBody,
    resourcesBody,
    lootBody,
    playersBody
  } = props;

  return (
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
          {dirtyItems > 0 && <span style={{ marginLeft: 8, opacity: 0.65 }}>●</span>}
        </button>

        <button onClick={() => setAdminTab("resources")} style={pillStyle(adminTab === "resources")}>
          Resource defs
          {dirtyDefs > 0 && <span style={{ marginLeft: 8, opacity: 0.65 }}>●</span>}
        </button>

        <button onClick={() => setAdminTab("loot")} style={pillStyle(adminTab === "loot")}>
          Loot tables
          {dirtyLoot > 0 && <span style={{ marginLeft: 8, opacity: 0.65 }}>●</span>}
        </button>

        <button onClick={() => setAdminTab("players")} style={pillStyle(adminTab === "players")}>
          Players
          {dirtyPlayers > 0 && <span style={{ marginLeft: 8, opacity: 0.65 }}>●</span>}
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
          <div style={{ marginTop: 6, opacity: 0.8 }}>Minimize to click the 3D world for map placement.</div>
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
              Items: <b>{snapshotCounts.items}</b>
            </div>
            <div>
              Resource defs: <b>{snapshotCounts.resourceDefs}</b>
            </div>
            <div>
              Loot rows: <b>{snapshotCounts.resourceLoot}</b>
            </div>
            <div>
              Spawns: <b>{snapshotCounts.resourceSpawns}</b>
            </div>
            <div>
              Players: <b>{snapshotCounts.players}</b>
            </div>
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div style={{ padding: 12, overflow: "auto" }}>
        {adminTab === "map" && mapBody}
        {adminTab === "items" && itemsBody}
        {adminTab === "resources" && resourcesBody}
        {adminTab === "loot" && lootBody}
        {adminTab === "players" && playersBody}
      </div>
    </div>
  );
}
