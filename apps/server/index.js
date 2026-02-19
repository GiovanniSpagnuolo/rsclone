import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import authRoutes from './src/routes/auth.js';
import { calculatePath } from './src/game/pathfinding.js';
import { loadChunksIntoRAM, loadedChunks } from './src/game/mapManager.js';
import mapRoutes from './src/routes/map.js';
import { loadCacheIntoRAM } from './src/game/cacheManager.js';
import spawnsRoutes from './src/routes/spawns.js';
import cacheRoutes from './src/routes/cache.js';
import {
  createEmptyInventory,
  attemptAddItem,
  validateAndMoveItem
} from './src/game/inventoryManager.js';


import {
  activePlayers,
  startTickEngine,
  getWorldTimePayload,
  patchWorldSettings,
  setWorldTimeOfDay
} from './src/game/engine.js';


const prisma = new PrismaClient();
const app = express();
const httpServer = createServer(app);

app.use(cors());
app.use(express.json());
app.use('/', authRoutes);
app.use('/map', mapRoutes);
app.use('/spawns', spawnsRoutes);
app.use('/cache', cacheRoutes);

app.use(express.static('public'));


const JWT_SECRET = "super_secret_osrs_key_change_me_later";

const io = new Server(httpServer, {
  cors: { origin: "http://localhost:5173", methods: ["GET", "POST"] }
});

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error("Authentication error: No token provided"));

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return next(new Error("Authentication error: Invalid token"));
    socket.userId = decoded.userId;
    socket.characterId = decoded.characterId;
    next();
  });
});

// --- PATHFINDING HELPER ---
const getAdjacentWalkable = (startX, startZ, targetX, targetZ) => {
  const cx = Math.floor(targetX / 8);
  const cz = Math.floor(targetZ / 8);
  const chunk = loadedChunks.get(`${cx}_${cz}`);

  // 1. Is the target tile itself walkable? (Like clicking the ground)
  if (chunk) {
    const lx = Math.abs(targetX % 8);
    const lz = Math.abs(targetZ % 8);
    if (chunk[(lz * 8) + lx]?.isWalkable !== false) {
      return { x: targetX, y: targetZ };
    }
  }

  // 2. It's blocked! Find the closest open adjacent tile
  const neighbors = [
    { x: targetX + 1, y: targetZ }, { x: targetX - 1, y: targetZ },
    { x: targetX, y: targetZ + 1 }, { x: targetX, y: targetZ - 1 }
  ];

  let bestDist = Infinity;
  let bestPos = { x: targetX, y: targetZ }; // Fallback

  for (const n of neighbors) {
    const ncx = Math.floor(n.x / 8);
    const ncz = Math.floor(n.y / 8);
    const nChunk = loadedChunks.get(`${ncx}_${ncz}`);
    
    if (nChunk) {
      const nlx = Math.abs(n.x % 8);
      const nlz = Math.abs(n.y % 8);
      if (nChunk[(nlz * 8) + nlx]?.isWalkable !== false) {
        const dist = Math.abs(startX - n.x) + Math.abs(startZ - n.y);
        if (dist < bestDist) {
          bestDist = dist;
          bestPos = n;
        }
      }
    }
  }
  return bestPos;
};

io.on('connection', (socket) => {
  console.log(`🟢 Player connected: Socket ${socket.id}`);
  
  socket.rights = 0;

	const isAdmin = () => (socket.rights ?? 0) >= 2;


  socket.on('request_spawn', async () => {
    const character = await prisma.character.findUnique({ 
      where: { id: socket.characterId },
      include: { user: true } 
    });
    
    const pos = JSON.parse(character.position);
	socket.rights = character.user.rights ?? 0;
    
      const initialInventory = createEmptyInventory();

          activePlayers.set(socket.id, {
            characterId: socket.characterId,
            pos: pos,
            path: [],
            inventory: initialInventory
          });

    socket.emit('server_message', {
	  message: `Welcome back, ${character.displayName}!`,
	  position: pos,
	  rights: socket.rights
	});
      
      socket.emit('sync_inventory', initialInventory);
	
	socket.emit('world_time', getWorldTimePayload());
	
  });

socket.on('admin_set_world_settings', (partial) => {
  if (!isAdmin()) return;
  patchWorldSettings(partial);
  io.emit('world_time', getWorldTimePayload());
});

socket.on('admin_set_time_of_day', ({ timeOfDay }) => {
  if (!isAdmin()) return;
  setWorldTimeOfDay(timeOfDay);
  io.emit('world_time', getWorldTimePayload());
});

    socket.on('request_move', (targetData) => {
        const player = activePlayers.get(socket.id);
        if (player) {
          // Find a valid adjacent tile if they clicked a tree/rock!
          const validTarget = getAdjacentWalkable(player.pos.x, player.pos.y, targetData.x, targetData.y);
          player.path = calculatePath(player.pos.x, player.pos.y, validTarget.x, validTarget.y);
        }
      });
    socket.on('toggle_run', ({ isRunning }) => {
        const player = activePlayers.get(socket.id);
        if (player) {
          player.isRunning = isRunning;
        }
      });

    socket.on('interact_object', async ({ action, objectDefId, x, z }) => {
        const player = activePlayers.get(socket.id);
        if (!player) return;

        // 1. Distance Check (Manhattan distance for a grid)
        const dist = Math.abs(player.pos.x - x) + Math.abs(player.pos.y - z);
        if (dist > 1) {
          socket.emit('server_message', "You need to get closer to do that.");
          return;
        }

        // 2. Fetch definition from DB (or CacheManager if wired up)
        const def = await prisma.objectDefinition.findUnique({ where: { id: objectDefId } });
        if (!def || !def.interactableData) return;

        try {
          const data = JSON.parse(def.interactableData);
          const actionData = data.actions?.[action];
          if (!actionData) return;

          // TODO in future: Check actionData.reqSkills against player's actual skills here
          // TODO in future: Check actionData.reqItemCategory against player's equipped items here
          // TODO in future: Trigger actionData.animation on the client here

          // 3. Success! Award Item and broadcast message
          socket.emit('server_message', actionData.msgSuccess);
          console.log(`[Player ${socket.id}] received Item ID: ${actionData.rewardItemId} (x${actionData.rewardQty})`);

          // 4. Depletion Math
          // In the future, formula will be: Math.max(actionData.depleteFloor, actionData.depleteChance - (player.level * 0.01))
          const roll = Math.random();
          if (roll <= actionData.depleteChance) {
            socket.emit('server_message', actionData.msgDeplete);
            
            // TODO: Broadcast despawn event to all clients to visually replace the tree with a stump!
            console.log(`[World] Object at ${x},${z} depleted!`);
          }

        } catch (e) {
          console.error("Interaction parsing error:", e);
        }
      });
    
    socket.on('move_item', ({ guid, targetIndex, rotated }) => {
        const player = activePlayers.get(socket.id);
        if (!player) return;

        const valid = validateAndMoveItem(player.inventory, guid, targetIndex, rotated);
        
        // Always sync back to the client.
        // If valid, UI updates. If invalid (cheat attempt), UI snaps the item back!
        socket.emit('sync_inventory', player.inventory);
      });
    
  socket.on('disconnect', async () => {
    const player = activePlayers.get(socket.id);
    if (player) {
      try {
        await prisma.character.update({
          where: { id: player.characterId },
          data: { position: JSON.stringify(player.pos) }
        });
      } catch (error) {
        console.error("Failed to save player position:", error);
      }
      activePlayers.delete(socket.id);
    }
    console.log(`🔴 Player disconnected: Socket ${socket.id}`);
  });
});



await loadChunksIntoRAM();
await loadCacheIntoRAM(); // Add this line
startTickEngine(io);

const PORT = 3001;
httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));
