//
//  http.ts
//  
//
//  Created by Giovanni Spagnuolo on 2/9/26.
//


import express from "express";
import cors from "cors";
import { LoginSchema, RegisterSchema, loginUser, registerUser, verifyToken } from "./auth.js";

export function startHttpServer(port: number) {
  const app = express();

  app.use(cors({ origin: true }));
  app.use(express.json());

  app.post("/auth/register", async (req, res) => {
    try {
      const result = await registerUser(RegisterSchema.parse(req.body));
      res.json(result);
    } catch (e: any) {
      res.status(400).json({ error: e?.message ?? "Register failed" });
    }
  });

  app.post("/auth/login", async (req, res) => {
    try {
      const result = await loginUser(LoginSchema.parse(req.body));
      res.json(result);
    } catch (e: any) {
      res.status(400).json({ error: e?.message ?? "Login failed" });
    }
  });

  app.get("/me", (req, res) => {
    const auth = req.header("authorization");
    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Missing token" });

    const user = verifyToken(token);
    if (!user) return res.status(401).json({ error: "Invalid token" });

    res.json({ user });
  });

  app.listen(port, () => console.log(`HTTP listening on http://localhost:${port}`));
}
