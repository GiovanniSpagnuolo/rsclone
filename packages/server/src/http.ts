import express from "express";
import cors from "cors";
import { Buffer } from "node:buffer";
import { LoginSchema, RegisterSchema, loginUser, registerUser, verifyToken } from "./auth.js";
import { db } from "./db.js";

export function startHttpServer(port: number) {
  const app = express();

  app.use(cors({ origin: true }));
  
  // Custom raw body parser for asset uploads (up to 50MB)
  app.use("/admin/assets", express.raw({ type: "*/*", limit: "50mb" }));
  
  // Standard JSON for everything else
  app.use(express.json());

  // --- AUTH ROUTES ---
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

  // --- ASSET / CACHE ROUTES ---

  // 1. GET /game.cache -> Returns the packed binary file
  app.get("/game.cache", (req, res) => {
    try {
      const assets = db.prepare("SELECT name, data FROM assets").all() as { name: string; data: Buffer }[];
      
      // Build Directory
      const dir: Record<string, { offset: number; size: number }> = {};
      let offset = 0;
      const buffers: Buffer[] = [];

      for (const a of assets) {
        dir[a.name] = { offset, size: a.data.length };
        buffers.push(a.data);
        offset += a.data.length;
      }

      // Format: [HeaderLength (4b)][Header JSON (utf8)][Body (concatenated assets)]
      const header = Buffer.from(JSON.stringify(dir), "utf-8");
      const headerLen = Buffer.alloc(4);
      headerLen.writeUInt32LE(header.length, 0);

      const body = Buffer.concat(buffers);
      const final = Buffer.concat([headerLen, header, body]);

      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Length", final.length);
      res.send(final);
    } catch (e) {
      console.error(e);
      res.status(500).send("Cache build failed");
    }
  });

  // 2. POST /admin/assets?name=file.glb -> Uploads a raw file
  app.post("/admin/assets", (req, res) => {
    const auth = req.header("authorization");
    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Missing token" });
    const user = verifyToken(token);
    if (!user || user.rights < 2) return res.status(403).json({ error: "Admin only" });

    const name = String(req.query.name || "").trim();
    if (!name) return res.status(400).json({ error: "Missing ?name=" });

    const data = req.body;
    if (!Buffer.isBuffer(data)) return res.status(400).json({ error: "Body must be raw binary" });

    db.prepare(`
      INSERT INTO assets (name, data, size, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET data=excluded.data, size=excluded.size, updated_at=excluded.updated_at
    `).run(name, data, data.length, Date.now());

    res.json({ success: true, name, size: data.length });
  });

  // 3. DELETE /admin/assets?name=file.glb
  app.delete("/admin/assets", (req, res) => {
    const auth = req.header("authorization");
    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Missing token" });
    const user = verifyToken(token);
    if (!user || user.rights < 2) return res.status(403).json({ error: "Admin only" });

    const name = String(req.query.name || "").trim();
    db.prepare("DELETE FROM assets WHERE name = ?").run(name);
    res.json({ success: true });
  });

  // 4. GET /admin/assets -> List files
  app.get("/admin/assets", (req, res) => {
    // Public list is fine, but maybe restrict to logged in users?
    // For now, let's keep it open or check token if you prefer.
    const rows = db.prepare("SELECT name, size, updated_at FROM assets ORDER BY name ASC").all();
    res.json(rows);
  });

  app.listen(port, () => console.log(`HTTP listening on http://localhost:${port}`));
}
