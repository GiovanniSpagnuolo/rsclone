//
//  characterRepo.ts
//  
//
//  Created by Giovanni Spagnuolo on 2/9/26.
//


import { db } from "./db.js";
import type { SkillXP } from "@rsclone/shared/protocol";

export type CharacterRow = {
  id: string;
  user_id: string;
  name: string;
  x: number;
  y: number;
  xp_woodcutting: number;
  xp_mining: number;
  xp_fishing: number;
};

export function getDefaultCharacterForUser(userId: string): CharacterRow | null {
  const row = db
    .prepare(
      `SELECT id, user_id, name, x, y, xp_woodcutting, xp_mining, xp_fishing
       FROM characters
       WHERE user_id = ?
       ORDER BY created_at ASC
       LIMIT 1`
    )
    .get(userId) as CharacterRow | undefined;

  return row ?? null;
}

export function rowToSkills(row: CharacterRow): SkillXP {
  return {
    woodcutting: row.xp_woodcutting,
    mining: row.xp_mining,
    fishing: row.xp_fishing
  };
}

export function saveCharacterState(charId: string, x: number, y: number, skills: SkillXP) {
  const now = Date.now();
  db.prepare(
    `UPDATE characters
     SET x = ?, y = ?,
         xp_woodcutting = ?, xp_mining = ?, xp_fishing = ?,
         updated_at = ?
     WHERE id = ?`
  ).run(
    x, y,
    skills.woodcutting, skills.mining, skills.fishing,
    now,
    charId
  );
}
