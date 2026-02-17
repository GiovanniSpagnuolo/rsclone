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
    
    activePlayers.set(socket.id, {
      characterId: socket.characterId,
      pos: pos,
      path: []
    });

    socket.emit('server_message', {
	  message: `Welcome back, ${character.displayName}!`,
	  position: pos,
	  rights: socket.rights
	});
	
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
      player.path = calculatePath(player.pos.x, player.pos.y, targetData.x, targetData.y);
    }
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