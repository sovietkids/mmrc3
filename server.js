'use strict';

/* ===============================
 * Imports
 * =============================== */
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const session = require("express-session");

/* ===============================
 * App / Server
 * =============================== */
const app = express();
const PORT = process.env.PORT || 10001;

/* ===============================
 * Directories (Render-safe)
 * =============================== */
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const UPLOAD_DIR = path.join(PUBLIC_DIR, 'uploads');

// ensure dirs exist
[DATA_DIR, UPLOAD_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

/* ===============================
 * Persistent files (best-effort)
 * ※ Render再デプロイで消える点は仕様
 * =============================== */
const drawingFile = path.join(DATA_DIR, 'drawing.json');
const messagesFile = path.join(DATA_DIR, 'messages.json');

//Discord
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_REDIRECT_URI = "http://cube.ssnetwork.io:54290/auth/discord/callback";


app.get("/__whoami", (req, res) => {
  res.send("THIS SERVER IS DISCORD-AUTH SERVER");
});

app.get("/auth/discord", (req, res) => {
  const url = new URL("https://discord.com/oauth2/authorize");

  url.searchParams.set("client_id", DISCORD_CLIENT_ID);
  url.searchParams.set("redirect_uri", DISCORD_REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "identify email");

  res.redirect(url.toString());
});

app.get("/auth/discord/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send("No code");

  try {
    const params = new URLSearchParams({
      client_id: DISCORD_CLIENT_ID,
      client_secret: DISCORD_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: DISCORD_REDIRECT_URI
    });

    const tokenRes = await axios.post(
      "https://discord.com/api/oauth2/token",
      params,
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const token = tokenRes.data;

    const userRes = await axios.get(
      "https://discord.com/api/users/@me",
      { headers: { Authorization: `Bearer ${token.access_token}` } }
    );

    const user = userRes.data;

    res.send(`
      <h1>ログイン成功</h1>
      <pre>${JSON.stringify(user, null, 2)}</pre>
      <a href="/">戻る</a>
    `);

  } catch (e) {
    console.error(e.response?.data || e);
    res.status(500).send("Discord login failed");
  }
});

app.use(session({
  secret: "super-secret-key",
  resave: false,
  saveUninitialized: false
}));

app.get("/auth/discord/callback", async (req, res) => {
  const user = userRes.data;

  req.session.user = {
    id: user.id,
    username: user.username,
    avatar: user.avatar
  };

  res.redirect("/");
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});




/* ===============================
 * In-memory state
 * =============================== */
let drawingData = [];
const threads = {
  general: { name: '雑談', messages: [] },
  hobbies: { name: '趣味', messages: [] },
  tech: { name: '技術', messages: [] },
};
const users = {}; // username -> socket.id

/* ===============================
 * Load / Save helpers
 * =============================== */
function safeReadJSON(file, fallback) {
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch (e) {
    console.error('JSON read error:', file, e);
  }
  return fallback;
}

function safeWriteJSON(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('JSON write error:', file, e);
  }
}

/* load on startup */
drawingData = safeReadJSON(drawingFile, []);
const savedThreads = safeReadJSON(messagesFile, null);
if (savedThreads) {
  Object.keys(savedThreads).forEach(id => {
    threads[id] = savedThreads[id];
  });
  console.log('Messages loaded from file');
}
console.log('Drawing data loaded');

/* ===============================
 * Express middleware
 * =============================== */
app.use(express.json());
app.use(express.static(PUBLIC_DIR));

/* ===============================
 * Routes
 * =============================== */
app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

/* ===============================
 * Multer (image upload)
 * =============================== */
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOAD_DIR),
  filename: (_, file, cb) => {
    const name =
      'img-' +
      Date.now() +
      '-' +
      Math.random().toString(36).slice(2) +
      path.extname(file.originalname);
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
});

app.post('/upload-image', upload.single('image'), (req, res) => {
  if (!req.file) return res.json({ error: 'No file uploaded' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

/* ===============================
 * Image search (safe mock + optional Pexels)
 * =============================== */
app.get('/search-images', async (req, res) => {
  const q = req.query.q;
  if (!q) return res.json({ results: [] });

  const results = [];
  try {
    if (process.env.PEXELS_KEY) {
      const r = await axios.get(
        'https://api.pexels.com/v1/search',
        {
          params: { query: q, per_page: 20 },
          headers: { Authorization: process.env.PEXELS_KEY },
        }
      );
      (r.data.photos || []).forEach(p => {
        results.push({
          url: p.src.medium,
          title: `Photo by ${p.photographer}`,
        });
      });
    }
  } catch (e) {
    console.warn('Pexels error (fallback used)');
  }

  if (results.length === 0) {
    for (let i = 1; i <= 6; i++) {
      results.push({
        url: `https://picsum.photos/300/300?random=${i}`,
        title: `Sample ${i}`,
      });
    }
  }

  res.json({ results });
});

/* ===============================
 * HTTP + Socket.IO (Render style)
 * =============================== */
const server = http.createServer(app);
const io = new Server(server);

/* ===============================
 * Socket.IO
 * =============================== */
io.on('connection', socket => {
    io.emit(
      'threads updated',
      Object.fromEntries(
        Object.keys(threads).map(k => [k, { name: threads[k].name }])
      )
    );

  console.log('user connected');

  const defaultThread = 'general';
  socket.join(defaultThread);
  socket.currentThread = defaultThread;

  socket.emit('updateList', drawingData);
  socket.emit('init', {
    threadId: defaultThread,
    messages: threads[defaultThread].messages,
  });

  socket.on('user joined', username => {
    users[username] = socket.id;
    socket.username = username;
    io.emit('update users', Object.keys(users));
  });

  socket.on('switch thread', (id, cb) => {
    if (!threads[id]) return;
    socket.leave(socket.currentThread);
    socket.join(id);
    socket.currentThread = id;
    cb(threads[id].messages);
  });

  socket.on('create thread', (name, cb) => {
    const id = `${name}-${Date.now()}`.toLowerCase();
    threads[id] = { name, messages: [] };
    safeWriteJSON(messagesFile, threads);
    io.emit(
      'threads updated',
      Object.fromEntries(
        Object.keys(threads).map(k => [k, { name: threads[k].name }])
      )
    );
    cb({ newThreadId: id });
  });

  socket.on('chat message', msg => {
    const t = socket.currentThread;
    if (!threads[t]) return;

    const m = {
      text: msg.text,
      username: socket.username || msg.username,
      timestamp: new Date().toISOString(),
    };

    threads[t].messages.push(m);
    io.to(t).emit('chat message', m);
    safeWriteJSON(messagesFile, threads);
  });

  socket.on('uploadList', list => {
    drawingData = list;
    safeWriteJSON(drawingFile, drawingData);
    io.emit('updateList', list);
  });

  socket.on('disconnect', () => {
    if (socket.username) {
      delete users[socket.username];
      io.emit('update users', Object.keys(users));
    }
  });
});

/* ===============================
 * Start
 * =============================== */
server.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});