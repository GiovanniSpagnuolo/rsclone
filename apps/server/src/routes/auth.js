import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();
const JWT_SECRET = "super_secret_osrs_key_change_me_later";

router.post('/register', async (req, res) => {
  const { username, email, password } = req.body;

  try {
    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        username,
        email,
        passwordHash,
        characters: {
          create: {
            displayName: username,
            position: JSON.stringify({ x: 3200, y: 3200, plane: 0 }),
            skills: JSON.stringify({ hitpoints: { xp: 1154 } }),
            attributes: JSON.stringify({ hitpoints: 10 })
          }
        }
      },
      include: { characters: true }
    });

    res.json({ message: "Registration successful!", user });
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: "Username or email already exists." });
  }
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  const user = await prisma.user.findUnique({
    where: { username },
    include: { characters: true }
  });

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = jwt.sign({ userId: user.id, characterId: user.characters[0].id }, JWT_SECRET, { expiresIn: '24h' });

  res.json({ token, character: user.characters[0] });
});

export default router;