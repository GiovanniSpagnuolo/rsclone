//
//  styles.ts
//  
//
//  Created by Giovanni Spagnuolo on 2/10/26.
//


// packages/client/src/ui/styles.ts
export function pillStyle(active: boolean) {
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

export function smallBtnStyle(kind: "neutral" | "blue" | "red" = "neutral") {
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

export function inputStyle() {
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
