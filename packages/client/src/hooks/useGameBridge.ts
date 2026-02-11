//
//  useGameHooks.ts
//  
//
//  Created by Giovanni Spagnuolo on 2/10/26.
//


// packages/client/src/hooks/useGameBridge.ts
import { useEffect } from "react";
import type { ChatLine, Inventory } from "@rsclone/shared/protocol";

export type Skills = { woodcutting: number; mining: number; fishing: number };

export type AdminSnapshot = {
  items: any[];
  resourceDefs: any[];
  resourceLoot: any[];
  resourceSpawns: any[];
  players: any[];
};

export function useGameBridge(opts: {
  // chat
  pushChat: (line: ChatLine | ChatLine[]) => void;

  // skills + inventory
  setSkills: (s: Skills) => void;
  setInventory: (inv: Inventory) => void;
  flashInvFull: () => void;

  // minimap
  setMinimap: (state: any) => void;

  // admin
  onAdminOpen: (rights: number) => void;
  onAdminSnapshot: (snap: AdminSnapshot) => void;
  onAdminError: (err: string) => void;
}) {
  useEffect(() => {
    // ---- chat ----
    (window as any).__chatPush = (line: ChatLine | ChatLine[]) => {
      opts.pushChat(line);
    };

    // ---- HUD ----
    // IMPORTANT: React owns these callbacks. createGame3d should never null them out.
    (window as any).__skillsSet = (s: Skills) => opts.setSkills(s);
    (window as any).__invSet = (inv: Inventory) => opts.setInventory(inv);
    (window as any).__invFull = () => opts.flashInvFull();

    // ---- minimap ----
    (window as any).__minimapUpdate = (state: any) => opts.setMinimap(state);

    // ---- admin ----
    (window as any).__adminOpen = (rights: number) => opts.onAdminOpen(rights);
    (window as any).__adminSnapshot = (snap: AdminSnapshot) => opts.onAdminSnapshot(snap);
    (window as any).__adminError = (err: string) => opts.onAdminError(err);

    return () => {
      (window as any).__chatPush = null;

      (window as any).__skillsSet = null;
      (window as any).__invSet = null;
      (window as any).__invFull = null;

      (window as any).__minimapUpdate = null;

      (window as any).__adminOpen = null;
      (window as any).__adminSnapshot = null;
      (window as any).__adminError = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
