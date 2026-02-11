//
//  AuthScreen.tsx
//  
//
//  Created by Giovanni Spagnuolo on 2/10/26.
//


// packages/client/src/ui/AuthScreen.tsx
import React from "react";
import { pillStyle, inputStyle } from "./styles";

export function AuthScreen(props: {
  mode: "login" | "register";
  setMode: (m: "login" | "register") => void;

  emailOrUsername: string;
  setEmailOrUsername: (v: string) => void;

  email: string;
  setEmail: (v: string) => void;

  username: string;
  setUsername: (v: string) => void;

  password: string;
  setPassword: (v: string) => void;

  error: string;
  onSubmit: () => void;
}) {
  const {
    mode,
    setMode,
    emailOrUsername,
    setEmailOrUsername,
    email,
    setEmail,
    username,
    setUsername,
    password,
    setPassword,
    error,
    onSubmit
  } = props;

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background:
          "radial-gradient(1200px 800px at 30% 20%, rgba(80,140,255,0.14), transparent 60%), #07090f",
        color: "#e6e8ef",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
      }}
    >
      <div
        style={{
          width: 420,
          minWidth: 320,
          maxWidth: "min(420px, calc(100vw - 24px))",
          background: "rgba(10,12,18,0.85)",
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: 14,
          padding: 18,
          boxShadow: "0 20px 70px rgba(0,0,0,0.55)"
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>RS Clone</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Welcome back</div>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button onClick={() => setMode("login")} style={pillStyle(mode === "login")}>
            Login
          </button>
          <button onClick={() => setMode("register")} style={pillStyle(mode === "register")}>
            Register
          </button>
        </div>

        <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
          {mode === "register" && (
            <>
              <div>
                <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Email</div>
                <input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" style={inputStyle()} />
              </div>

              <div>
                <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Username</div>
                <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" style={inputStyle()} />
              </div>
            </>
          )}

          {mode === "login" && (
            <div>
              <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Email or Username</div>
              <input
                value={emailOrUsername}
                onChange={(e) => setEmailOrUsername(e.target.value)}
                autoComplete="username"
                style={inputStyle()}
              />
            </div>
          )}

          <div>
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Password</div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              style={inputStyle()}
            />
          </div>

          <button
            onClick={onSubmit}
            style={{
              marginTop: 2,
              width: "100%",
              padding: "11px 12px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(80,140,255,0.22)",
              color: "#e6e8ef",
              cursor: "pointer",
              fontWeight: 700
            }}
          >
            {mode === "login" ? "Login" : "Create account"}
          </button>

          {error && (
            <div
              style={{
                marginTop: 4,
                padding: "10px 12px",
                borderRadius: 10,
                background: "rgba(255,60,60,0.12)",
                border: "1px solid rgba(255,60,60,0.25)",
                color: "rgba(255,220,220,0.95)",
                fontSize: 13
              }}
            >
              {error}
            </div>
          )}

          <div style={{ marginTop: 4, fontSize: 12, opacity: 0.65 }}>Token stored in localStorage (dev).</div>
        </div>
      </div>
    </div>
  );
}
