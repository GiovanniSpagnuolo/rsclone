import Phaser from "phaser";
import type { ResourceState, ServerToClient, SkillXP, PlayerState, ChatLine } from "@rsclone/shared/protocol";
import { WORLD_W, WORLD_H, makeCollision } from "@rsclone/shared/world";

const TILE = 24;

type RemotePlayer = {
  sprite: Phaser.GameObjects.Rectangle;
  nameText: Phaser.GameObjects.Text;
  tileX: number;
  tileY: number;
  action: { kind: "woodcutting" | "mining" | "fishing"; ticksLeft: number } | null;
};

type ResourceSprite = {
  id: string;
  type: ResourceState["type"];
  rect: Phaser.GameObjects.Rectangle;
  tileX: number;
  tileY: number;
};

export class MainScene extends Phaser.Scene {
  private ws: WebSocket | null = null;
  private myId: string | null = null;

  private collision = makeCollision();

  private players = new Map<string, RemotePlayer>();
  private resources = new Map<string, ResourceSprite>();

  private worldGraphics!: Phaser.GameObjects.Graphics;

  private mySkills: SkillXP | null = null;
  private skillsText!: Phaser.GameObjects.Text;

  create() {
    (window as any).__setStatus?.("connecting…");

    this.worldGraphics = this.add.graphics();
    this.drawWorld();

    this.skillsText = this.add
      .text(8, 8, "Skills: —", { fontFamily: "sans-serif", fontSize: "12px", color: "#ffffff" })
      .setScrollFactor(0);

    this.connectWs();

    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (!this.myId) return;
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

      const tx = Math.floor(p.worldX / TILE);
      const ty = Math.floor(p.worldY / TILE);

      // Resource click -> interact
      const key = `${tx},${ty}`;
      const r = this.resources.get(key);
      if (r) {
        this.ws.send(JSON.stringify({ t: "interact", at: { x: tx, y: ty } }));
        return;
      }

      this.ws.send(JSON.stringify({ t: "moveTo", dest: { x: tx, y: ty } }));
    });

    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => this.disconnectWs());
    this.events.on(Phaser.Scenes.Events.DESTROY, () => this.disconnectWs());
  }

  update() {
    const t = this.time.now / 1000;

    for (const rp of this.players.values()) {
      const baseX = rp.tileX * TILE + TILE / 2;
      const baseY = rp.tileY * TILE + TILE / 2;

      // default transform
      let offX = 0;
      let offY = 0;
      let scale = 1;
      let rot = 0;

      if (rp.action) {
        if (rp.action.kind === "woodcutting") {
          // swing left/right
          offX = Math.sin(t * 10) * 2.5;
        } else if (rp.action.kind === "mining") {
          // thump (scale pulse)
          scale = 1 + Math.max(0, Math.sin(t * 12)) * 0.15;
        } else if (rp.action.kind === "fishing") {
          // bob + tiny rotation
          offY = Math.sin(t * 6) * 2.0;
          rot = Math.sin(t * 6) * 0.12;
        }
      }

      const targetX = baseX + offX;
      const targetY = baseY + offY;

      rp.sprite.x = Phaser.Math.Linear(rp.sprite.x, targetX, 0.25);
      rp.sprite.y = Phaser.Math.Linear(rp.sprite.y, targetY, 0.25);

      rp.sprite.setScale(scale);
      rp.sprite.setRotation(rot);

      rp.nameText.x = rp.sprite.x;
      rp.nameText.y = rp.sprite.y - 18;
    }
  }

  private connectWs() {
    const token = (window as any).__wsToken as string | null;
    if (!token) {
      (window as any).__setStatus?.("missing token (please login)");
      return;
    }

    const url = `ws://localhost:8080?token=${encodeURIComponent(token)}`;
    (window as any).__setStatus?.(`connecting to ${url}`);

    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      (window as any).__setStatus?.("connected (auth ok)");

      // Bridge chat send for React overlay
      (window as any).__chatSend = (text: string) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        ws.send(JSON.stringify({ t: "chat", text }));
      };
        (window as any).__moveTo = (tile: { x: number; y: number }) => {
          if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
          this.ws.send(JSON.stringify({ t: "moveTo", dest: tile }));
        };

    };

    ws.onerror = () => (window as any).__setStatus?.("ws error");

    ws.onclose = (ev) => {
      if (ev.code === 1008) (window as any).__setStatus?.("disconnected: unauthorized");
      else (window as any).__setStatus?.(`disconnected (${ev.code})`);

      (window as any).__chatSend = null;
        (window as any).__moveTo = null;
      this.ws = null;
      this.myId = null;
      this.mySkills = null;
      this.updateSkillsText();

      this.clearPlayers();
      this.clearResources();
    };

    ws.onmessage = (ev) => {
      let msg: ServerToClient | null = null;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (!msg) return;

      if (msg.t === "welcome") {
        this.myId = msg.id;
        (window as any).__setStatus?.(`connected as ${msg.id.slice(0, 6)} • tickRate=${msg.tickRate}`);
        return;
      }

      if (msg.t === "you") {
        this.mySkills = msg.skills;
        this.updateSkillsText();
        return;
      }

      if (msg.t === "chatHistory") {
        (window as any).__chatPush?.(msg.lines as ChatLine[]);
        return;
      }

      if (msg.t === "chat") {
        (window as any).__chatPush?.(msg.line as ChatLine);
        return;
      }

      if (msg.t === "snapshot") {
        this.applySnapshot(msg.players);
        this.applyResources(msg.resources);
          (window as any).__minimapUpdate?.({
            youId: this.myId,
            players: msg.players,
            resources: msg.resources
          });
      }
        
    };
  }

  private updateSkillsText() {
    if (!this.mySkills) {
      this.skillsText.setText("Skills: —");
      return;
    }
    const s = this.mySkills;
    this.skillsText.setText(`Skills XP  WC:${s.woodcutting}  MIN:${s.mining}  FSH:${s.fishing}`);
  }

  private disconnectWs() {
    if (this.ws) {
      try { this.ws.close(); } catch {}
      this.ws = null;
      (window as any).__chatSend = null;
    }
  }

  private clearPlayers() {
    for (const rp of this.players.values()) {
      rp.sprite.destroy();
      rp.nameText.destroy();
    }
    this.players.clear();
  }

  private clearResources() {
    for (const r of this.resources.values()) r.rect.destroy();
    this.resources.clear();
  }

  private drawWorld() {
    const g = this.worldGraphics;
    g.clear();

    for (let y = 0; y < WORLD_H; y++) {
      for (let x = 0; x < WORLD_W; x++) {
        const blocked = this.collision[y][x] === 1;
        const px = x * TILE;
        const py = y * TILE;

        g.lineStyle(1, 0x222222, 1);
        g.strokeRect(px, py, TILE, TILE);

        if (blocked) {
          // blocked tiles as water-ish for now
          g.fillStyle(0x204080, 0.9);
          g.fillRect(px, py, TILE, TILE);
        }
      }
    }
  }

  private applySnapshot(players: PlayerState[]) {
    const alive = new Set(players.map((p) => p.id));

    for (const [id, rp] of this.players) {
      if (!alive.has(id)) {
        rp.sprite.destroy();
        rp.nameText.destroy();
        this.players.delete(id);
      }
    }

    for (const p of players) {
      let rp = this.players.get(p.id);
      if (!rp) {
        const isMe = p.id === this.myId;

        const rect = this.add.rectangle(
          p.pos.x * TILE + TILE / 2,
          p.pos.y * TILE + TILE / 2,
          TILE * 0.7,
          TILE * 0.7,
          isMe ? 0x66ff66 : 0x6699ff
        );

        const nameText = this.add
          .text(rect.x, rect.y - 18, p.name, {
            fontFamily: "sans-serif",
            fontSize: "12px",
            color: "#ffffff"
          })
          .setOrigin(0.5, 0.5);

        rp = {
          sprite: rect,
          nameText,
          tileX: p.pos.x,
          tileY: p.pos.y,
          action: p.action ? { kind: p.action.kind, ticksLeft: p.action.ticksLeft } : null
        };
        this.players.set(p.id, rp);
      }

      rp.tileX = p.pos.x;
      rp.tileY = p.pos.y;
      rp.nameText.setText(p.name);
      rp.action = p.action ? { kind: p.action.kind, ticksLeft: p.action.ticksLeft } : null;
    }
  }

  private applyResources(resources: ResourceState[]) {
    const aliveByTile = new Map<string, ResourceState>();
    for (const r of resources) {
      if (!r.alive) continue;
      aliveByTile.set(`${r.pos.x},${r.pos.y}`, r);
    }

    for (const [tileKey, s] of this.resources) {
      if (!aliveByTile.has(tileKey)) {
        s.rect.destroy();
        this.resources.delete(tileKey);
      }
    }

    for (const [tileKey, r] of aliveByTile) {
      if (this.resources.has(tileKey)) continue;

      const color =
        r.type === "tree" ? 0x2ecc71 :
        r.type === "rock" ? 0x95a5a6 :
        0xf1c40f;

      const rect = this.add.rectangle(
        r.pos.x * TILE + TILE / 2,
        r.pos.y * TILE + TILE / 2,
        TILE * 0.8,
        TILE * 0.8,
        color
      );

      this.resources.set(tileKey, { id: r.id, type: r.type, rect, tileX: r.pos.x, tileY: r.pos.y });
    }
  }
}
