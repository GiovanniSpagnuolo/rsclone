//
//  ChatPanel.tsx
//  
//
//  Created by Giovanni Spagnuolo on 2/10/26.
//


// packages/client/src/ui/ChatPanel.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import type { ChatLine } from "@rsclone/shared/protocol";
import { fmtTime } from "./utils";

export function ChatPanel(props: {
  worldLines: ChatLine[];
  playerLines: ChatLine[];
  onSend: (text: string) => void;
}) {
  const { worldLines, playerLines, onSend } = props;

  const [chatTab, setChatTab] = useState<"world" | "player">("player");
  const [chatInput, setChatInput] = useState("");
  const chatBoxRef = useRef<HTMLDivElement>(null);

  const activeLines = chatTab === "world" ? worldLines : playerLines;
  const canSend = useMemo(() => chatInput.trim().length > 0, [chatInput]);

  useEffect(() => {
    const el = chatBoxRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [activeLines, chatTab]);

  function sendChat() {
    const text = chatInput.trim();
    if (!text) return;
    onSend(text);
    setChatInput("");
  }

  return (
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
        {activeLines.map((l) => (
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
  );
}
