//
//  AdminShell.tsx
//  
//
//  Created by Giovanni Spagnuolo on 2/10/26.
//


// packages/client/src/ui/admin/AdminShell.tsx
import React from "react";
import { smallBtnStyle } from "../styles";
import { AdminDock, type AdminTool } from "./AdminDock";
import { AdminPanel } from "./AdminPanel";

export function AdminShell(props: {
  open: boolean;
  minimized: boolean;
  setMinimized: (v: boolean) => void;

  adminRights: number;
  onRefresh: () => void;
  onClose: () => void;

  // mini toolbar
  selectedDefId: string;
  setSelectedDefId: (id: string) => void;
  defs: { id: string }[];
  adminTool: AdminTool;
  setAdminTool: (t: AdminTool | ((prev: AdminTool) => AdminTool)) => void;

  // panel
  adminTab: "map" | "items" | "resources" | "loot" | "players";
  setAdminTab: (t: "map" | "items" | "resources" | "loot" | "players") => void;

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

  // bodies supplied by App.tsx for now
  mapBody: React.ReactNode;
  itemsBody: React.ReactNode;
  resourcesBody: React.ReactNode;
  lootBody: React.ReactNode;
  playersBody: React.ReactNode;
}) {
  if (!props.open) return null;

  if (props.minimized) {
    return (
      <AdminDock
        adminRights={props.adminRights}
        selectedDefId={props.selectedDefId}
        setSelectedDefId={props.setSelectedDefId}
        defs={props.defs}
        adminTool={props.adminTool}
        setAdminTool={props.setAdminTool}
        onOpen={() => props.setMinimized(false)}
        onRefresh={props.onRefresh}
        onClose={props.onClose}
      />
    );
  }

  return (
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
            <div style={{ fontSize: 12, opacity: 0.75 }}>rights: {props.adminRights}</div>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={props.onRefresh} style={smallBtnStyle("neutral")}>
              Refresh
            </button>

            <button
              onClick={() => props.setMinimized(true)}
              style={smallBtnStyle("neutral")}
              title="Minimize so you can click the world to place/remove"
            >
              Minimize
            </button>

            <button onClick={props.onClose} style={smallBtnStyle("red")}>
              Close
            </button>
          </div>
        </div>

        <AdminPanel
          adminTab={props.adminTab}
          setAdminTab={props.setAdminTab}
          adminTool={props.adminTool}
          dirtyItems={props.dirtyItems}
          dirtyDefs={props.dirtyDefs}
          dirtyLoot={props.dirtyLoot}
          dirtyPlayers={props.dirtyPlayers}
          snapshotCounts={props.snapshotCounts}
          mapBody={props.mapBody}
          itemsBody={props.itemsBody}
          resourcesBody={props.resourcesBody}
          lootBody={props.lootBody}
          playersBody={props.playersBody}
        />
      </div>
    </div>
  );
}
