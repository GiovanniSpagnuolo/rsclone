import { useEffect, useState } from 'react';
import { getSocket } from './socket';

interface PlayerState {
  position: [number, number, number];
  serverMsg: string;
  rights: number;
}

export interface WorldSettings {
  cycleLengthSec: number;
  nightIntensityFloor: number;

  dayAmbientColor: string;
  dayDirColor: string;
  dayFogColor: string;

  nightAmbientColor: string;
  nightDirColor: string;
  nightFogColor: string;
}

export interface WorldTimeState {
  timeOfDay: number;      // 0..1
  settings: WorldSettings;
  serverTimeMs: number;   // when server sent it
  receivedAtMs: number;   // when client received it (for smoothing)
}

const DEFAULT_WORLD_SETTINGS: WorldSettings = {
  cycleLengthSec: 20 * 60,
  nightIntensityFloor: 0.28,
  dayAmbientColor: '#ffffff',
  dayDirColor: '#ffffff',
  dayFogColor: '#87CEEB',
  nightAmbientColor: '#0b1020',
  nightDirColor: '#2b3a6b',
  nightFogColor: '#020205',
};

export const useGameEngine = () => {
  const [gameState, setGameState] = useState<PlayerState>({
    position: [3200, 0, 3200],
    serverMsg: '',
    rights: 0,
  });

  const [worldTime, setWorldTime] = useState<WorldTimeState>({
    timeOfDay: 7 / 24,
    settings: DEFAULT_WORLD_SETTINGS,
    serverTimeMs: Date.now(),
    receivedAtMs: performance.now(),
  });

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    socket.on('server_message', (data: any) => {
      setGameState(prev => ({
        ...prev,
        serverMsg: data.message,
        rights: data.rights ?? 0,
        position: data.position ? [data.position.x, data.position.plane, data.position.y] : prev.position
      }));
    });

    socket.on('tick_update', (updates: any[]) => {
      const myUpdate = updates.find(u => u.id === socket.id);
      if (myUpdate) {
        setGameState(prev => ({
          ...prev,
          position: [myUpdate.pos.x, myUpdate.pos.plane, myUpdate.pos.y]
        }));
      }
    });

    socket.on('world_time', (payload: any) => {
      if (!payload) return;
      setWorldTime({
        timeOfDay: Number(payload.timeOfDay) || 0,
        settings: payload.settings ?? DEFAULT_WORLD_SETTINGS,
        serverTimeMs: Number(payload.serverTimeMs) || Date.now(),
        receivedAtMs: performance.now(),
      });
    });

    socket.emit('request_spawn');

    return () => {
      socket.off('server_message');
      socket.off('tick_update');
      socket.off('world_time');
    };
  }, []);

  // Admin actions (safe no-ops if not connected)
  const setWorldSettings = (partial: Partial<WorldSettings>) => {
    const socket = getSocket();
    if (!socket) return;
    socket.emit('admin_set_world_settings', partial);
  };

  const setTimeOfDay = (timeOfDay: number) => {
    const socket = getSocket();
    if (!socket) return;
    socket.emit('admin_set_time_of_day', { timeOfDay });
  };

  return {
    ...gameState,
    worldTime,
    setWorldSettings,
    setTimeOfDay,
  };
};
