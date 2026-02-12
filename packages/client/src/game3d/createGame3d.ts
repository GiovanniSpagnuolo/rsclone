import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils";
import type { PlayerState, ResourceState } from "@rsclone/shared/protocol";
import { WORLD_W, WORLD_H, makeCollision } from "@rsclone/shared/world";
import { CameraRig } from "./CameraRig";

// --- TYPES ---
export type EntityMesh = {
  root: THREE.Object3D;
  visual: THREE.Object3D;
  mixer?: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>;
  currentAction?: string;
  targetPos: THREE.Vector3;
  tileX: number;
  tileY: number;
  modelName: string;
  isFallback: boolean;
  dispose: () => void;
};

// --- HIT MARKER SYSTEM ---
class HitMarker {
  mesh: THREE.Mesh;
  age = 0;
  maxAge = 0.6; // seconds

  constructor(x: number, z: number, color: number) {
    const geometry = new THREE.PlaneGeometry(0.5, 0.5);
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide,
      depthTest: false
    });
    
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.set(x, 0.05, z);
    this.mesh.renderOrder = 999;
    
    const cross = new THREE.Mesh(geometry, material);
    cross.rotation.z = Math.PI / 2;
    this.mesh.add(cross);
  }

  update(dt: number): boolean {
    this.age += dt;
    const progress = this.age / this.maxAge;
    if (progress >= 1) return false;

    const scale = 1 - progress * 0.3;
    this.mesh.scale.setScalar(scale);
    (this.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - progress;
    return true;
  }
}

// --- ASSET MANAGER ---
export class AssetManager {
  private loader = new GLTFLoader();
  private cache = new Map<string, { scene: THREE.Group; animations: THREE.AnimationClip[] } | "failed">();
  private vfs = new Map<string, string>();
  private pending = new Map<string, Promise<void>>();
  public isReady = false;

  async init(onProgress?: (pct: number) => void) {
    if (this.isReady) { onProgress?.(100); return; }
    try {
      console.log("[AssetManager] Downloading cache...");
      const res = await fetch("http://localhost:8081/game.cache");
      if (!res.ok) throw new Error("No cache found");

      const contentLength = res.headers.get("content-length");
      const total = contentLength ? parseInt(contentLength, 10) : 0;
      let loaded = 0;

      const reader = res.body?.getReader();
      const chunks: Uint8Array[] = [];
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          loaded += value.length;
          if (total) onProgress?.(Math.round((loaded / total) * 100));
        }
      }
      
      const buf = new Uint8Array(loaded);
      let offset = 0;
      for (const chunk of chunks) { buf.set(chunk, offset); offset += chunk.length; }
      
      const view = new DataView(buf.buffer);
      const headerLen = view.getUint32(0, true);
      const headerStr = new TextDecoder().decode(new Uint8Array(buf.buffer, 4, headerLen));
      const dir = JSON.parse(headerStr) as Record<string, { offset: number; size: number }>;
      const bodyOffset = 4 + headerLen;
      
      for (const [name, info] of Object.entries(dir)) {
        const fileData = new Uint8Array(buf.buffer, bodyOffset + info.offset, info.size);
        const blob = new Blob([fileData], { type: "model/gltf-binary" });
        const url = URL.createObjectURL(blob);
        this.vfs.set(name, url);
      }
      this.isReady = true;
    } catch (e) {
      console.warn("[AssetManager] Cache load failed.", e);
      this.isReady = true;
    }
  }

  has(filename: string) { return this.cache.has(filename) && this.cache.get(filename) !== "failed"; }

  load(filename: string) {
    if (!filename || this.cache.has(filename)) return;
    const url = this.vfs.get(filename);
    if (!url) { this.cache.set(filename, "failed"); return; }
    this.cache.set(filename, "failed");
    const p = new Promise<void>((resolve) => {
      this.loader.load(url, (gltf) => {
        this.cache.set(filename, { scene: gltf.scene, animations: gltf.animations });
        resolve();
      }, undefined, () => { this.cache.set(filename, "failed"); resolve(); });
    });
    this.pending.set(filename, p);
  }

  instantiate(filename: string): Omit<EntityMesh, "modelName" | "targetPos" | "tileX" | "tileY" | "isFallback"> | null {
    if (!this.cache.has(filename)) { this.load(filename); return null; }
    const asset = this.cache.get(filename);
    if (!asset || asset === "failed") return null;
    try {
        const visual = SkeletonUtils.clone(asset.scene) as THREE.Object3D;
        visual.position.set(0, 0, 0); visual.rotation.set(0, 0, 0); visual.scale.set(0.6, 0.6, 0.6);
        const root = new THREE.Group();
        root.add(visual);
        visual.traverse((c) => { if ((c as THREE.Mesh).isMesh) { c.castShadow = true; c.receiveShadow = true; } });
        const mixer = new THREE.AnimationMixer(visual);
        const actions = new Map<string, THREE.AnimationAction>();
        for (const clip of asset.animations) actions.set(clip.name.toLowerCase(), mixer.clipAction(clip));
        return { root, visual, mixer, actions, dispose: () => mixer.stopAllAction() };
    } catch (e) { return null; }
  }
}

export const assetManager = new AssetManager();

export type ContextMenuOption = { label: string; action: () => void; isCancel?: boolean };

export function createGame3d(
  container: HTMLDivElement,
  token: string,
  onContextMenu: (x: number, y: number, options: ContextMenuOption[]) => void
) {
    // --- PASTE HERE (Move these to the top) ---
      let ws: WebSocket | null = null;
      let myId: string | null = null;
  (window as any).__wsToken = token;
  let statusSetter: ((s: string) => void) | null = null;
  (window as any).__setStatus = (s: string) => statusSetter?.(s);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.Fog(0x87ceeb, 20, 60);

  const camera = new THREE.PerspectiveCamera(55, container.clientWidth / container.clientHeight, 0.1, 100);
  camera.position.set(WORLD_W / 2, 18, (WORLD_H / 2) + 12);
  camera.lookAt(WORLD_W / 2, 0, WORLD_H / 2);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
    // --- NEW: Camera Rig Setup ---
      const rig = new CameraRig(camera, container);
      // Set initial look target to center of world
      rig.setTarget({ x: WORLD_W / 2, y: 0, z: WORLD_H / 2 });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffefd5, 1.2);
  dir.position.set(20, 30, 10);
  dir.castShadow = true;
  dir.shadow.camera.top = 30; dir.shadow.camera.bottom = -30;
  dir.shadow.camera.left = -30; dir.shadow.camera.right = 30;
  dir.shadow.mapSize.set(2048, 2048);
  scene.add(dir);

  // 1. Ground
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_W, WORLD_H), new THREE.MeshStandardMaterial({ color: 0x3e2723, roughness: 1.0 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(WORLD_W / 2, -0.01, WORLD_H / 2);
  ground.receiveShadow = true;
  scene.add(ground);

  // 2. Water
  const collision = makeCollision();
  const waterGeo = new THREE.BoxGeometry(1, 0.2, 1);
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x29b6f6, roughness: 0.2 });
  const waterMesh = new THREE.InstancedMesh(waterGeo, waterMat, WORLD_W * WORLD_H);
  const dummy = new THREE.Object3D();
  let idx = 0;
  for (let y = 0; y < WORLD_H; y++) {
    for (let x = 0; x < WORLD_W; x++) {
      if (collision[y][x] === 1) {
        dummy.position.set(x + 0.5, 0, y + 0.5);
        dummy.updateMatrix();
        waterMesh.setMatrixAt(idx++, dummy.matrix);
      }
    }
  }
  waterMesh.count = idx;
  waterMesh.receiveShadow = true;
  scene.add(waterMesh);

  // 3. Grid
  const grid = new THREE.GridHelper(Math.max(WORLD_W, WORLD_H), Math.max(WORLD_W, WORLD_H), 0x000000, 0x000000);
  grid.position.set(WORLD_W / 2, 0.01, WORLD_H / 2);
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.1;
  scene.add(grid);

  // Entities
  const players = new Map<string, EntityMesh>();
  const resources = new Map<string, EntityMesh>();
  const markers: HitMarker[] = [];
  const interactables: THREE.Object3D[] = [];

  function createFallback(isPlayer: boolean, isMe: boolean) {
    const visual = new THREE.Mesh(
      isPlayer ? new THREE.CapsuleGeometry(0.25, 0.35, 4, 8) : new THREE.BoxGeometry(0.6, 0.6, 0.6),
      new THREE.MeshStandardMaterial({ color: isPlayer ? (isMe ? 0x66ff66 : 0x6699ff) : 0xff00ff })
    );
    visual.castShadow = true;
    if (isPlayer) visual.position.y = 0.425; else visual.position.y = 0.3;
    const root = new THREE.Group();
    root.add(visual);
    return { root, visual };
  }

  function updateEntity(id: string, map: Map<string, EntityMesh>, pos: { x: number; y: number }, modelName: string, state: string, actionKind?: string, playerName?: string) {
    let entity = map.get(id);
    const targetX = pos.x + 0.5;
    const targetZ = pos.y + 0.5;
    const cleanName = (modelName || "").trim();
    const targetModel = cleanName && !cleanName.endsWith(".glb") ? `${cleanName}.glb` : cleanName;

    if (entity) {
      const idx = interactables.indexOf(entity.root);
      if (idx !== -1) interactables.splice(idx, 1);
    }

    if (entity && entity.modelName !== targetModel) {
        if (assetManager.has(targetModel)) {
            scene.remove(entity.root);
            entity.dispose();
            map.delete(id);
            entity = undefined;
        } else {
            assetManager.load(targetModel);
        }
    }

    if (!entity) {
      const isPlayer = map === players;
      let meshData = targetModel ? assetManager.instantiate(targetModel) : null;
      let isFallback = false;

      if (!meshData) {
        const { root, visual } = createFallback(isPlayer, id === myId);
        root.position.set(targetX, 0, targetZ);
        scene.add(root);
        isFallback = true;
        meshData = { root, visual, mixer: undefined, actions: new Map(), dispose: () => {} };
      } else {
        const { root, visual } = meshData;
        root.position.set(targetX, 0, targetZ);
        if (!isPlayer) visual.rotation.y = Math.random() * Math.PI * 2;
        scene.add(root);
      }
      
      entity = { ...meshData, targetPos: new THREE.Vector3(targetX, 0, targetZ), tileX: pos.x, tileY: pos.y, modelName: targetModel, isFallback };
      entity.root.userData = { id, type: isPlayer ? "player" : "resource" };
      map.set(id, entity);
    }
    else if (entity.isFallback && targetModel && assetManager.has(targetModel)) {
        scene.remove(entity.root);
        entity.dispose();
        map.delete(id);
        updateEntity(id, map, pos, targetModel, state, actionKind, playerName);
        return;
    }

    interactables.push(entity.root);

    entity.targetPos.set(targetX, 0, targetZ);
    if (entity.root.position.distanceTo(entity.targetPos) > 5) entity.root.position.copy(entity.targetPos);

    if (entity.mixer) {
        let anim = "idle";
        if (state === "dead") anim = "death";
        else if (state === "action" && actionKind) anim = actionKind;
        else if (entity.root.position.distanceTo(entity.targetPos) > 0.1) anim = "walk";
        
        anim = anim.toLowerCase();
        if (entity.currentAction !== anim) {
            if (entity.currentAction) entity.actions.get(entity.currentAction)?.fadeOut(0.2);
            const act = entity.actions.get(anim) || entity.actions.get("idle");
            if (act) {
                act.reset().fadeIn(0.2).play();
                act.loop = anim === "death" ? THREE.LoopOnce : THREE.LoopRepeat;
                act.clampWhenFinished = anim === "death";
                entity.currentAction = anim;
            }
        }
        entity.mixer.update(clock.getDelta());
    } else if (entity.root.position.distanceTo(entity.targetPos) > 0.01) {
        entity.visual.rotation.z = Math.sin(Date.now() / 100) * 0.1;
    } else {
        entity.visual.rotation.z = 0;
    }
    
    entity.tileX = pos.x;
    entity.tileY = pos.y;
  }

  const clock = new THREE.Clock();
  let raf = 0;
  function animate() {
    raf = requestAnimationFrame(animate);
    const dt = clock.getDelta();
      
      // --- NEW: Update Camera ---
        // 1. Find "My" Player Mesh
        if (myId && players.has(myId)) {
          const p = players.get(myId)!;
          // We target the "Head" area (y + 1.5) so we look at the character, not their feet
          rig.setTarget({ x: p.root.position.x, y: 1.5, z: p.root.position.z });
        }

        // 2. Step the Rig physics
        rig.update(dt);
        // --------------------------
    
    for (let i = markers.length - 1; i >= 0; i--) {
        if (!markers[i].update(dt)) { scene.remove(markers[i].mesh); markers.splice(i, 1); }
    }

    for (const ent of [...players.values(), ...resources.values()]) {
        const dist = ent.root.position.distanceTo(ent.targetPos);
        if (dist > 0.001) {
            const step = 10.0 * dt;
            if (dist <= step) ent.root.position.copy(ent.targetPos);
            else ent.root.position.lerp(ent.targetPos, step / dist);
            ent.root.lookAt(ent.targetPos.x, ent.root.position.y, ent.targetPos.z);
        }
        ent.mixer?.update(dt);
    }

    renderer.render(scene, camera);
  }
  animate();

  const raycaster = new THREE.Raycaster();
  const mouseNdc = new THREE.Vector2();

  function spawnMarker(x: number, z: number, color: number) {
      const marker = new HitMarker(x, z, color);
      scene.add(marker.mesh);
      markers.push(marker);
  }

  function handleInteraction(isRightClick: boolean, screenX: number, screenY: number) {
      const hits = raycaster.intersectObjects(interactables, true);
      let hitEntity = null;
      
      for (const hit of hits) {
          let cur: THREE.Object3D | null = hit.object;
          while (cur && !cur.userData.id) cur = cur.parent;
          if (cur) { hitEntity = cur; break; }
      }

      if (hitEntity) {
          const { id, type } = hitEntity.userData;
          if (isRightClick) {
              const options: ContextMenuOption[] = [
                  {
                      label: type === "resource" ? "Interact" : "Examine",
                      action: () => {
                          wsSend({ t: "interact", at: { x: Math.floor(hitEntity!.position.x), y: Math.floor(hitEntity!.position.z) } });
                          spawnMarker(hitEntity!.position.x, hitEntity!.position.z, 0xff0000);
                      }
                  },
                  { label: "Cancel", action: () => {}, isCancel: true }
              ];
              onContextMenu(screenX, screenY, options);
          } else {
              wsSend({ t: "interact", at: { x: Math.floor(hitEntity.position.x), y: Math.floor(hitEntity.position.z) } });
              spawnMarker(hitEntity.position.x, hitEntity.position.z, 0xff0000);
          }
      } else {
          const groundHits = raycaster.intersectObject(ground);
          if (groundHits.length > 0) {
              const pt = groundHits[0].point;
              const tx = Math.floor(pt.x);
              const ty = Math.floor(pt.z);
            
              if (tx >= 0 && ty >= 0 && tx < WORLD_W && ty < WORLD_H) {
                  const options: ContextMenuOption[] = [
                      {
                          label: "Walk here",
                          action: () => {
                              wsSend({ t: "moveTo", dest: { x: tx, y: ty } });
                              spawnMarker(pt.x, pt.z, 0xffff00);
                          }
                      },
                      { label: "Cancel", action: () => {}, isCancel: true }
                  ];

                  if (isRightClick) {
                      onContextMenu(screenX, screenY, options);
                  } else {
                      wsSend({ t: "moveTo", dest: { x: tx, y: ty } });
                      spawnMarker(pt.x, pt.z, 0xffff00);
                  }
              }
          }
      }
  }

    function onPointerDown(ev: PointerEvent) {
          if (!ws || ws.readyState !== WebSocket.OPEN) return;
          const rect = renderer.domElement.getBoundingClientRect();
          mouseNdc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
          mouseNdc.y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
          raycaster.setFromCamera(mouseNdc, camera);

          // --- ADMIN OVERRIDE CHECK ---
          const tool = (window as any).__adminTool || { mode: "off" };
          
          // DEBUG LOG: See what the engine thinks the tool is
          if (tool.mode !== "off") {
              console.log("Admin Tool Active:", tool);
          }

          if (tool.mode === "place" || tool.mode === "remove") {
              const groundHits = raycaster.intersectObject(ground);
              
              // DEBUG LOG: See if we are hitting the ground
              console.log("Ground hits:", groundHits.length);

              if (groundHits.length > 0) {
                  const pt = groundHits[0].point;
                  const tx = Math.floor(pt.x);
                  const ty = Math.floor(pt.z);
                  
                  console.log("Attempting action at:", tx, ty); // DEBUG
                  
                  if (tx >= 0 && ty >= 0 && tx < WORLD_W && ty < WORLD_H) {
                      if (tool.mode === "place") {
                          wsSend({ t: "adminPlaceSpawn", defId: tool.defId, x: tx, y: ty });
                      } else {
                          wsSend({ t: "adminRemoveSpawn", x: tx, y: ty });
                      }
                  }
              }
              return;
          }

          handleInteraction(ev.button === 2, ev.clientX, ev.clientY);
      }
  
  renderer.domElement.addEventListener("contextmenu", (e) => e.preventDefault());
  renderer.domElement.addEventListener("pointerdown", onPointerDown);


  function wsSend(obj: any) { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj)); }

  function connectWs() {
    ws = new WebSocket(`ws://localhost:8080?token=${encodeURIComponent(token)}`);
    ws.onopen = () => {
      (window as any).__setStatus?.("connected");
      (window as any).__chatSend = (text: string) => wsSend({ t: "chat", text });
      (window as any).__moveTo = (tile: { x: number; y: number }) => wsSend({ t: "moveTo", dest: tile });
      (window as any).__adminGetSnapshot = () => wsSend({ t: "adminGetSnapshot" });
      (window as any).__adminSend = (msg: any) => wsSend(msg);
    };
    ws.onclose = () => { (window as any).__setStatus?.("disconnected"); ws = null; };
    ws.onmessage = (ev) => {
      let msg: any;
      try { msg = JSON.parse(ev.data); } catch { return; }
      
      if (msg.t === "welcome") { myId = msg.id; }
      else if (msg.t === "you") { (window as any).__skillsSet?.(msg.skills); (window as any).__invSet?.(msg.inventory); }
      else if (msg.t === "inv") { (window as any).__invSet?.(msg.inventory); }
      else if (msg.t === "invFull") { (window as any).__invFull?.(); }
      else if (msg.t === "chat") { (window as any).__chatPush?.(msg.line); }
      else if (msg.t === "chatHistory") { (window as any).__chatPush?.(msg.lines); }
      else if (msg.t === "snapshot") {
        const presentIds = new Set<string>();
        for (const p of msg.players as PlayerState[]) {
          presentIds.add(p.id);
          const state = p.action ? "action" : "idle";
          updateEntity(p.id, players, p.pos, "character.glb", state, p.action?.kind, p.name);
        }
        for (const [id, ent] of players) {
            if (!presentIds.has(id)) {
                const idx = interactables.indexOf(ent.root);
                if (idx !== -1) interactables.splice(idx, 1);
                scene.remove(ent.root); ent.dispose(); players.delete(id);
            }
        }

        const resIds = new Set<string>();
        for (const r of msg.resources as (ResourceState & { mesh: string; depletedMesh: string })[]) {
          resIds.add(r.id);
          const aliveMesh = r.mesh || "tree.glb";
          const deadMesh = r.depletedMesh || aliveMesh;
          updateEntity(r.id, resources, r.pos, r.alive ? aliveMesh : deadMesh, r.alive ? "idle" : "dead");
        }
        for (const [id, ent] of resources) {
            if (!resIds.has(id)) {
                const idx = interactables.indexOf(ent.root);
                if (idx !== -1) interactables.splice(idx, 1);
                scene.remove(ent.root); ent.dispose(); resources.delete(id);
            }
        }
        (window as any).__minimapUpdate?.({ youId: myId, players: msg.players, resources: msg.resources });
      }
      else if (msg.t.startsWith("admin")) {
          if (msg.t === "adminOpen") (window as any).__adminOpen?.(msg.rights);
          else if (msg.t === "adminSnapshot") (window as any).__adminSnapshot?.(msg);
          else if (msg.t === "adminError") (window as any).__adminError?.(msg.error);
      }
    };
  }
  connectWs();
  
  function resize() {
      const w = container.clientWidth; const h = container.clientHeight;
      camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h);
  }
  window.addEventListener("resize", resize);

  return {
    setStatusText(fn: (s: string) => void) { statusSetter = fn; },
    triggerAction: (action: () => void) => action(),
    destroy() {
        rig.destroy();
      cancelAnimationFrame(raf);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", resize);
      ws?.close();
      renderer.dispose();
      if (renderer.domElement.parentElement === container) container.removeChild(renderer.domElement);
    }
  };
}
