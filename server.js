
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// ---- Translation Provider (Mock) ----
// You can later replace translate() with a real API call.
function detectLang(text) {
  // very naive: if contains Arabic Unicode range, mark 'ar'; if ASCII letters, 'en'; else 'auto'
  const hasArabic = /[\u0600-\u06FF]/.test(text);
  if (hasArabic) return 'ar';
  const hasLatin = /[A-Za-z]/.test(text);
  if (hasLatin) return 'en';
  return 'auto';
}

async function translate({ text, target, source }) {
  const mode = process.env.TRANSLATION_MODE || 'mock'; // 'mock' only in this starter
  if (mode !== 'mock') {
    // Placeholder for a real provider (e.g., OpenAI, Azure, Google).
    // For safety in this starter, we fallback to mock.
  }
  // MOCK behavior: just annotate that translation occurred.
  if (!text || !target) return text;
  const src = source || detectLang(text);
  if (src === target) return text;
  return `[${src}->${target}] ${text}`;
}

// ---- In-memory store (for demo only; replace with DB in production) ----
const conversations = new Map(); // conversationId -> { users: Set<socketId> }
const userPrefs = new Map(); // key `${userId}:${peerId}` -> { autoTranslate, targetLang }

function prefKey(userId, peerId) { return `${userId}:${peerId}`; }

io.on('connection', (socket) => {
  // For demo, userId is passed as query (?userId=Ali) or generated
  const userId = socket.handshake.query.userId || `user-${socket.id.slice(-4)}`;
  socket.data.userId = userId;

  socket.on('presence:join', ({ conversationId }) => {
    socket.join(conversationId);
    if (!conversations.has(conversationId)) conversations.set(conversationId, { users: new Set() });
    conversations.get(conversationId).users.add(socket.id);
    // broadcast presence state
    const usersOnline = Array.from(conversations.get(conversationId).users).map(id => io.sockets.sockets.get(id)?.data.userId);
    io.to(conversationId).emit('presence:state', { usersOnline });
  });

  socket.on('prefs:set', ({ peerId, autoTranslate, targetLang }) => {
    userPrefs.set(prefKey(userId, peerId), { autoTranslate: !!autoTranslate, targetLang: targetLang || 'en' });
    socket.emit('prefs:sync', { peerId, autoTranslate: !!autoTranslate, targetLang: targetLang || 'en' });
  });

  socket.on('message:send', async ({ conversationId, text, sourceLang }) => {
    if (!conversationId || !text) return;
    const room = conversations.get(conversationId);
    if (!room) return;

    // Determine recipient(s). For demo, send to everyone in room (except sender) and also echo to sender.
    const senderId = socket.data.userId;

    const payloadBase = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
      conversationId,
      senderId,
      original_text: text,
      original_lang: sourceLang || detectLang(text),
      created_at: new Date().toISOString(),
    };

    // Deliver to each participant according to their prefs.
    for (const sid of room.users) {
      const s = io.sockets.sockets.get(sid);
      if (!s) continue;
      const recipientId = s.data.userId;
      let outText = text;
      const prefs = userPrefs.get(prefKey(recipientId, senderId)) || { autoTranslate: true, targetLang: 'en' };
      if (prefs.autoTranslate) {
        outText = await translate({ text, target: prefs.targetLang, source: payloadBase.original_lang });
      }
      s.emit('message:new', { ...payloadBase, rendered_for: recipientId, text: outText });
    }
  });

  socket.on('disconnect', () => {
    // clean up from all rooms
    for (const [cid, info] of conversations) {
      if (info.users.has(socket.id)) {
        info.users.delete(socket.id);
        const usersOnline = Array.from(info.users).map(id => io.sockets.sockets.get(id)?.data.userId).filter(Boolean);
        io.to(cid).emit('presence:state', { usersOnline });
      }
    }
  });
});

app.get('/health', (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🔊 Server running on http://localhost:${PORT}`);
  console.log(`Open http://localhost:${PORT} in two tabs, use different userIds in the URL query to simulate two users, e.g.:`);
  console.log(`  http://localhost:${PORT}/?userId=Ali`);
  console.log(`  http://localhost:${PORT}/?userId=Mike`);
});
