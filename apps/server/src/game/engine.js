export const activePlayers = new Map();

// 07:00 at server start, every restart
const START_TIME_OF_DAY = 7 / 24;

// Sensible defaults (admin can override)
const worldTimeState = {
  timeOfDay: START_TIME_OF_DAY, // 0..1
  settings: {
    cycleLengthSec: 20 * 60, // 20 minutes for a full day/night cycle
    nightIntensityFloor: 0.28, // prevents pitch black

    // Colors are hex strings
    dayAmbientColor: '#ffffff',
    dayDirColor: '#ffffff',
    dayFogColor: '#87CEEB',

    nightAmbientColor: '#0b1020',
    nightDirColor: '#2b3a6b',
    nightFogColor: '#020205',
  },
};

export const getWorldTimePayload = () => ({
  timeOfDay: worldTimeState.timeOfDay,
  settings: worldTimeState.settings,
  serverTimeMs: Date.now(),
});

export const setWorldTimeOfDay = (timeOfDay) => {
  // normalize to [0,1)
  const t = Number(timeOfDay);
  if (!Number.isFinite(t)) return;
  worldTimeState.timeOfDay = ((t % 1) + 1) % 1;
};

export const patchWorldSettings = (partial) => {
  if (!partial || typeof partial !== 'object') return;
  worldTimeState.settings = { ...worldTimeState.settings, ...partial };
};

export const startTickEngine = (io) => {
  const TICK_MS = 600;

  setInterval(() => {
    // --- Advance world clock ---
    const tickSec = TICK_MS / 1000;
    const cycle = Number(worldTimeState.settings.cycleLengthSec) || (20 * 60);
    worldTimeState.timeOfDay = (worldTimeState.timeOfDay + tickSec / cycle) % 1;

    // --- Player movement updates (existing logic) ---
    const updates = [];

    for (const [socketId, player] of activePlayers.entries()) {
      if (player.path && player.path.length > 0) {
        const nextStep = player.path.shift();
        player.pos.x = nextStep.x;
        player.pos.y = nextStep.y;

        updates.push({ id: socketId, pos: player.pos });
      }
    }

    if (updates.length > 0) io.emit('tick_update', updates);

    // --- Broadcast world time (cheap & simple: every tick) ---
    io.emit('world_time', getWorldTimePayload());
  }, TICK_MS);
};
