//
//  createGame3d.ts
//
//  Created by Giovanni Spagnuolo on 2/9/26.
//

import * as THREE from "three";
import type {
  ChatLine,
  PlayerState,
  ResourceState,
  ServerToClient,
  SkillXP,
  Inventory
} from "@rsclone/shared/protocol";
import { WORLD_W, WORLD_H, makeCollision } from "@rsclone/shared/world";

const TILE = 1; // 1 unit per tile in 3D

type PlayerMesh = {
  root: THREE.Object3D;
  body: THREE.Mesh;
  nameSprite: THREE.Sprite;

  chatSprite?: THREE.Sprite;
  chatUntilMs?: number;

  tileX: number;
  tileY: number;
  action: { kind: "woodcutting" | "mining" | "fishing"; ticksLeft: number } | null;
};

type ResourceMesh = {
  id: string;
  type: ResourceState["type"];
  root: THREE.Object3D;
  tileX: number;
  tileY: number;
};

type AdminTool =
  | { mode: "off" }
  | { mode: "place"; defId: string }
  | { mode: "remove" };

export function createGame3d(container: HTMLDivElement, token: string) {
  (window as any).__wsToken = token;

  let statusSetter: ((s: string) => void) | null = null;
  (window as any).__setStatus = (s: string) => statusSetter?.(s);

  // Chat + skills/inv bridges used by React overlay
  (window as any).__chatSend = null;

  (window as any).__moveTo = null;

  // Admin bridges (App.tsx listens to these)
  (window as any).__adminGetSnapshot = null;

  // ---------------- Three setup ----------------
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0b0b);

  const camera = new THREE.PerspectiveCamera(
    55,
    container.clientWidth / container.clientHeight,
    0.1,
    200
  );

  // Fixed angle, OSRS-ish tilt (rotation comes later)
  camera.position.set(WORLD_W * 0.5, 22, WORLD_H * 0.9);
  camera.lookAt(WORLD_W * 0.5, 0, WORLD_H * 0.5);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  // Lights
  const hemi = new THREE.HemisphereLight(0xffffff, 0x222233, 1.0);
  scene.add(hemi);

  const dir = new THREE.DirectionalLight(0xffffff, 0.8);
  dir.position.set(40, 50, 20);
  scene.add(dir);

  // Helpers / world
  const collision = makeCollision();

  // Ground plane
  const groundGeo = new THREE.PlaneGeometry(WORLD_W, WORLD_H);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x1b1b1b });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(WORLD_W / 2, 0, WORLD_H / 2);
  scene.add(ground);

  // Grid lines
  const grid = new THREE.GridHelper(Math.max(WORLD_W, WORLD_H), Math.max(WORLD_W, WORLD_H));
  grid.position.set(WORLD_W / 2, 0.001, WORLD_H / 2);
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.25;
  scene.add(grid);

  // Blocked/water tiles: render as slightly raised blue quads
  const waterGroup = new THREE.Group();
  scene.add(waterGroup);

  {
    const tileGeo = new THREE.BoxGeometry(1, 0.05, 1);
    const waterMat = new THREE.MeshStandardMaterial({ color: 0x204080 });
    for (let y = 0; y < WORLD_H; y++) {
      for (let x = 0; x < WORLD_W; x++) {
        if (collision[y][x] !== 1) continue;
        const m = new THREE.Mesh(tileGeo, waterMat);
        m.position.set(x + 0.5, 0.02, y + 0.5);
        waterGroup.add(m);
      }
    }
  }

  // Player + resource maps
  const players = new Map<string, PlayerMesh>();
  const resources = new Map<string, ResourceMesh>(); // keyed by "x,y" for click detection

  // Raycasting for click-to-move/interact/admin-place
  const raycaster = new THREE.Raycaster();
  const mouseNdc = new THREE.Vector2();

  function screenToRay(ev: PointerEvent) {
    const rect = renderer.domElement.getBoundingClientRect();
    mouseNdc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    mouseNdc.y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
    raycaster.setFromCamera(mouseNdc, camera);
  }

  function pickTile(ev: PointerEvent): { x: number; y: number } | null {
    screenToRay(ev);

    // Intersect the ground plane
    const hits = raycaster.intersectObject(ground, false);
    if (!hits.length) return null;

    const p = hits[0].point;
    const tx = Math.floor(p.x);
    const ty = Math.floor(p.z);
    if (tx < 0 || ty < 0 || tx >= WORLD_W || ty >= WORLD_H) return null;
    return { x: tx, y: ty };
  }

  // Name sprites (simple canvas text -> sprite)
  function makeNameSprite(text: string) {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = "24px sans-serif";
    ctx.fillStyle = "white";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;

    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(2.4, 0.6, 1);
    return sprite;
  }

  function updateNameSprite(sprite: THREE.Sprite, text: string) {
    const tex = (sprite.material as THREE.SpriteMaterial).map as THREE.CanvasTexture;
    const canvas = tex.image as HTMLCanvasElement;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = "24px sans-serif";
    ctx.fillStyle = "white";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    tex.needsUpdate = true;
  }

  function makeChatSprite(text: string) {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // OSRS-ish
    ctx.font = '42px "RuneScape UF","RuneScape","Verdana",sans-serif';
    ctx.fillStyle = "#ffd200";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // subtle shadow for readability
    ctx.shadowColor = "rgba(0,0,0,0.75)";
    ctx.shadowBlur = 6;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;

    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;

    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(3.4, 0.85, 1);
    return sprite;
  }

  function updateChatSprite(sprite: THREE.Sprite, text: string) {
    const tex = (sprite.material as THREE.SpriteMaterial).map as THREE.CanvasTexture;
    const canvas = tex.image as HTMLCanvasElement;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.font = '42px "RuneScape UF","RuneScape","Verdana",sans-serif';
    ctx.fillStyle = "#ffd200";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,0,0,0.75)";
    ctx.shadowBlur = 6;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;

    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    tex.needsUpdate = true;
  }

  function addOrUpdatePlayers(list: PlayerState[]) {
    const alive = new Set(list.map((p) => p.id));

    for (const [id, pm] of players) {
      if (!alive.has(id)) {
        scene.remove(pm.root);
        players.delete(id);
      }
    }

    for (const p of list) {
      let pm = players.get(p.id);
      if (!pm) {
        const root = new THREE.Group();

        const isMe = p.id === myId;
        const bodyGeo = new THREE.CapsuleGeometry(0.25, 0.35, 4, 8);
        const bodyMat = new THREE.MeshStandardMaterial({ color: isMe ? 0x66ff66 : 0x6699ff });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.set(0, 0.35, 0);
        root.add(body);

        const nameSprite = makeNameSprite(p.name);
        nameSprite.position.set(0, 1.2, 0);
        root.add(nameSprite);

        root.position.set(p.pos.x + 0.5, 0, p.pos.y + 0.5);
        scene.add(root);

        pm = {
          root,
          body,
          nameSprite,
          tileX: p.pos.x,
          tileY: p.pos.y,
          action: p.action ? { kind: p.action.kind, ticksLeft: p.action.ticksLeft } : null
        };
        players.set(p.id, pm);
      }

      pm.tileX = p.pos.x;
      pm.tileY = p.pos.y;
      pm.action = p.action ? { kind: p.action.kind, ticksLeft: p.action.ticksLeft } : null;
      updateNameSprite(pm.nameSprite, p.name);
    }
  }

  function clearResources() {
    for (const r of resources.values()) scene.remove(r.root);
    resources.clear();
  }

  function addOrUpdateResources(list: ResourceState[]) {
    const aliveByTile = new Map<string, ResourceState>();
    for (const r of list) {
      if (!r.alive) continue;
      aliveByTile.set(`${r.pos.x},${r.pos.y}`, r);
    }

    for (const [tileKey, rm] of resources) {
      if (!aliveByTile.has(tileKey)) {
        scene.remove(rm.root);
        resources.delete(tileKey);
      }
    }

    for (const [tileKey, r] of aliveByTile) {
      if (resources.has(tileKey)) continue;

      const root = new THREE.Group();
      root.position.set(r.pos.x + 0.5, 0, r.pos.y + 0.5);

      if (r.type === "tree") {
        // trunk + canopy
        const trunk = new THREE.Mesh(
          new THREE.CylinderGeometry(0.12, 0.14, 0.7, 8),
          new THREE.MeshStandardMaterial({ color: 0x7a4b2a })
        );
        trunk.position.y = 0.35;
        root.add(trunk);

        const canopy = new THREE.Mesh(
          new THREE.SphereGeometry(0.35, 10, 10),
          new THREE.MeshStandardMaterial({ color: 0x2ecc71 })
        );
        canopy.position.y = 0.85;
        root.add(canopy);
      } else if (r.type === "rock") {
        const rock = new THREE.Mesh(
          new THREE.DodecahedronGeometry(0.28, 0),
          new THREE.MeshStandardMaterial({ color: 0x95a5a6 })
        );
        rock.position.y = 0.28;
        root.add(rock);
      } else {
        // fishing spot marker
        const bob = new THREE.Mesh(
          new THREE.TorusGeometry(0.22, 0.06, 8, 16),
          new THREE.MeshStandardMaterial({ color: 0xf1c40f })
        );
        bob.rotation.x = Math.PI / 2;
        bob.position.y = 0.15;
        root.add(bob);
      }

      scene.add(root);
      resources.set(tileKey, { id: r.id, type: r.type, root, tileX: r.pos.x, tileY: r.pos.y });
    }
  }

  // ---------------- WebSocket ----------------
  let ws: WebSocket | null = null;
  let myId: string | null = null;

  function wsSend(obj: any) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(obj));
  }

  function connectWs() {
    (window as any).__setStatus?.("connecting…");
    const url = `ws://localhost:8080?token=${encodeURIComponent(token)}`;
    (window as any).__setStatus?.(`connecting to ${url}`);

    ws = new WebSocket(url);

    ws.onopen = () => {
      (window as any).__setStatus?.("connected (auth ok)");

      // Chat send bridge
      (window as any).__chatSend = (text: string) => wsSend({ t: "chat", text });

      // Move bridge (used by minimap click)
      (window as any).__moveTo = (tile: { x: number; y: number }) => wsSend({ t: "moveTo", dest: tile });

      // Admin snapshot bridge (Admin window calls this)
      ;(window as any).__adminGetSnapshot = () => wsSend({ t: "adminGetSnapshot" });
        
        // Admin send bridge (Admin panel uses this for Save operations)
        (window as any).__adminSend = (msg: any) => wsSend(msg);

    };

    ws.onclose = (ev) => {
      (window as any).__chatSend = null;

      (window as any).__moveTo = null;
      (window as any).__adminGetSnapshot = null;
        (window as any).__adminSend = null;


      myId = null;
      ws = null;

      clearResources();
      for (const pm of players.values()) scene.remove(pm.root);
      players.clear();

      if (ev.code === 1008) (window as any).__setStatus?.("disconnected: unauthorized");
      else (window as any).__setStatus?.(`disconnected (${ev.code})`);
    };

    ws.onerror = () => {
      (window as any).__setStatus?.("ws error");
    };

    ws.onmessage = (ev) => {
      let msg: ServerToClient | any = null;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (!msg) return;

      if (msg.t === "welcome") {
        myId = msg.id;
        (window as any).__setStatus?.(`connected as ${msg.id.slice(0, 6)} • tickRate=${msg.tickRate}`);
        return;
      }

      if (msg.t === "you") {
        const skills: SkillXP = msg.skills;
        const inv: Inventory = msg.inventory;
        (window as any).__skillsSet?.(skills);
        ;(window as any).__invSet?.(inv);
        return;
      }

      if (msg.t === "inv") {
        ;(window as any).__invSet?.(msg.inventory as Inventory);
        return;
      }

      if (msg.t === "invFull") {
        ;(window as any).__invFull?.();
        return;
      }

      if (msg.t === "chatHistory") {
        (window as any).__chatPush?.(msg.lines as ChatLine[]);
        return;
      }

      if (msg.t === "chat") {
        (window as any).__chatPush?.(msg.line as ChatLine);

        if (msg.line.from.id !== "system") {
          const pid = msg.line.from.id;
          const pm = players.get(pid);
          if (pm) {
            if (!pm.chatSprite) {
              pm.chatSprite = makeChatSprite(msg.line.text);
              pm.chatSprite.position.set(0, 1.75, 0); // above name
              pm.root.add(pm.chatSprite);
            } else {
              updateChatSprite(pm.chatSprite, msg.line.text);
              pm.chatSprite.visible = true;
            }
            pm.chatUntilMs = Date.now() + 4000;
          }
        }
        return;
      }

      // ---- Admin messages ----
      if (msg.t === "adminOpen") {
        // React opens the window; server already validated rights.
        (window as any).__adminOpen?.(msg.rights);
        return;
      }

      if (msg.t === "adminSnapshot") {
        (window as any).__adminSnapshot?.(msg);
        return;
      }

      if (msg.t === "adminError") {
        (window as any).__adminError?.(msg.error ?? "Unknown admin error");
        return;
      }

      if (msg.t === "adminAck") {
        // optional: could toast/log
        return;
      }

      if (msg.t === "snapshot") {
        addOrUpdatePlayers(msg.players);
        addOrUpdateResources(msg.resources);

        (window as any).__minimapUpdate?.({
          youId: myId,
          players: msg.players,
          resources: msg.resources
        });

        return;
      }
    };
  }

  connectWs();

  // Pointer input
  function onPointerDown(ev: PointerEvent) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    const tile = pickTile(ev);
    if (!tile) return;

    // Admin tool handling (server will still validate rights)
    const tool = ((window as any).__adminTool as AdminTool | undefined) ?? { mode: "off" };
    if (tool.mode && tool.mode !== "off") {
      if (tool.mode === "place") {
        wsSend({ t: "adminPlaceSpawn", defId: tool.defId, x: tile.x, y: tile.y });
      } else if (tool.mode === "remove") {
        wsSend({ t: "adminRemoveSpawn", x: tile.x, y: tile.y });
      }
      return; // do NOT move/interact when admin tool is active
    }

    const tileKey = `${tile.x},${tile.y}`;
    const r = resources.get(tileKey);

    if (r) {
      wsSend({ t: "interact", at: tile });
    } else {
      wsSend({ t: "moveTo", dest: tile });
    }
  }

  renderer.domElement.addEventListener("pointerdown", onPointerDown);

  // Resize
  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener("resize", resize);

  // Animation loop
  let raf = 0;
  const tmp = new THREE.Vector3();

  function animate(timeMs: number) {
    raf = requestAnimationFrame(animate);
    const t = timeMs / 1000;

    // smooth player meshes + action animation
    for (const pm of players.values()) {
      const targetX = pm.tileX + 0.5;
      const targetZ = pm.tileY + 0.5;

      tmp.set(targetX, 0, targetZ);
      pm.root.position.lerp(tmp, 0.25);

      // reset
      pm.body.position.set(0, 0.35, 0);
      pm.body.rotation.set(0, 0, 0);
      pm.body.scale.set(1, 1, 1);

      if (pm.action) {
        if (pm.action.kind === "woodcutting") {
          // swing (yaw)
          pm.body.rotation.y = Math.sin(t * 10) * 0.4;
        } else if (pm.action.kind === "mining") {
          // thump (scale pulse)
          const s = 1 + Math.max(0, Math.sin(t * 12)) * 0.15;
          pm.body.scale.set(s, s, s);
          pm.body.position.y = 0.35 - Math.max(0, Math.sin(t * 12)) * 0.06;
        } else if (pm.action.kind === "fishing") {
          // bob + small roll
          pm.body.position.y = 0.35 + Math.sin(t * 6) * 0.04;
          pm.body.rotation.z = Math.sin(t * 6) * 0.18;
        }
      }

      // Make name/chat face camera
      pm.nameSprite.quaternion.copy(camera.quaternion);

      if (pm.chatSprite) {
        pm.chatSprite.quaternion.copy(camera.quaternion);

        if (pm.chatUntilMs && Date.now() > pm.chatUntilMs) {
          pm.chatSprite.visible = false;
          pm.chatUntilMs = undefined;
        }
      }
    }

    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(animate);

  return {
    setStatusText(fn: (s: string) => void) {
      statusSetter = fn;
    },
    destroy() {
      cancelAnimationFrame(raf);


      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", resize);

      try {
        ws?.close();
      } catch {}

      (window as any).__chatSend = null;

        (window as any).__adminSend = null;

      (window as any).__moveTo = null;
      (window as any).__adminGetSnapshot = null;

      (window as any).__setStatus = null;
      (window as any).__wsToken = null;

      // Dispose renderer + remove canvas
      renderer.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }

      // Best-effort dispose (ok for MVP)
      players.clear();
      resources.clear();
    }
  };
}
