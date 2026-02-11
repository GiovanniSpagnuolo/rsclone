// packages/client/src/ui/admin/AdminDock.tsx
import React from "react";
import { inputStyle, smallBtnStyle } from "../styles";

export type AdminTool =
  | { mode: "off" }
  | { mode: "remove" }
  | { mode: "place"; defId: string };

export function AdminDock(props: {
  adminRights: number;
  selectedDefId: string;
  setSelectedDefId: (id: string) => void;
  defs: { id: string }[];

  adminTool: AdminTool;
  setAdminTool: (t: AdminTool | ((prev: AdminTool) => AdminTool)) => void;

  onOpen: () => void;
  onRefresh: () => void;
  onClose: () => void;
}) {
  const { adminRights, selectedDefId, setSelectedDefId, defs, adminTool, setAdminTool, onOpen, onRefresh, onClose } =
    props;

  return (
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
              setAdminTool((t) => (t.mode === "place" ? { mode: "place", defId: v } : t));
            }}
            style={inputStyle()}
          >
            {(defs.length ? defs : [{ id: "tree_basic" }]).map((d) => (
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
        <button onClick={onOpen} style={smallBtnStyle("blue")}>
          Open
        </button>
        <button onClick={onRefresh} style={smallBtnStyle("neutral")}>
          Refresh
        </button>
        <button onClick={onClose} style={smallBtnStyle("red")}>
          Close
        </button>
      </div>
    </div>
  );
}
