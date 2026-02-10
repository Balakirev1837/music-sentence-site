const express = require('express');
const cookieSession = require('cookie-session');
const fs = require('fs');
const path = require('path');

// --- Configuration ---
const PORT = process.env.PORT || 3998;
const ADMIN_PASSWORD = 'teacher123';
const DATA_FILE = path.join(__dirname, 'data.json');

// --- Data Persistence ---
function loadData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    const defaults = { phase: 1, users: [], sentences: [], guesses: [] };
    saveData(defaults);
    return defaults;
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// --- Fisher-Yates Shuffle ---
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// --- Express Setup ---
const app = express();

app.use(cookieSession({
  name: 'session',
  keys: ['sentence-game-secret-key'],
  maxAge: 24 * 60 * 60 * 1000
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Auth Middleware ---
function requireLogin(req, res, next) {
  if (!req.session.username) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.isAdmin) {
    return res.status(403).json({ error: 'Not authorized' });
  }
  next();
}

// ===========================
//  AUTH ENDPOINTS
// ===========================

// Register a new student (phase 1 only)
app.post('/api/register', (req, res) => {
  const data = loadData();
  if (data.phase !== 1) {
    return res.status(400).json({ error: 'Registration is closed' });
  }

  const { username, displayName, password } = req.body;
  if (!username || !displayName || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  const usernameLower = username.trim().toLowerCase();
  if (data.users.find(u => u.username === usernameLower)) {
    return res.status(400).json({ error: 'Username already taken' });
  }

  data.users.push({
    username: usernameLower,
    displayName: displayName.trim(),
    password: password
  });
  saveData(data);

  req.session.username = usernameLower;
  res.json({ ok: true });
});

// Student login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const data = loadData();
  const user = data.users.find(u => u.username === username.trim().toLowerCase());
  if (!user || user.password !== password) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  req.session.username = user.username;
  res.json({ ok: true, displayName: user.displayName });
});

// Admin login
app.post('/api/admin-login', (req, res) => {
  const { password } = req.body;
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Wrong admin password' });
  }

  req.session.isAdmin = true;
  res.json({ ok: true });
});

// Logout
app.post('/api/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

// Current session info
app.get('/api/me', (req, res) => {
  if (req.session.isAdmin) {
    return res.json({ loggedIn: true, isAdmin: true });
  }

  if (req.session.username) {
    const data = loadData();
    const user = data.users.find(u => u.username === req.session.username);
    if (user) {
      return res.json({
        loggedIn: true,
        username: user.username,
        displayName: user.displayName
      });
    }
  }

  res.json({ loggedIn: false });
});

// Current phase (public, polled by clients)
app.get('/api/phase', (req, res) => {
  const data = loadData();
  res.json({ phase: data.phase });
});

// ===========================
//  STUDENT GAME ENDPOINTS
// ===========================

// Submit a sentence (phase 2 only)
app.post('/api/submit-sentence', requireLogin, (req, res) => {
  const data = loadData();
  if (data.phase !== 2) {
    return res.status(400).json({ error: 'Sentence submission is not open' });
  }

  const { text } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Sentence cannot be empty' });
  }

  const existing = data.sentences.findIndex(s => s.username === req.session.username);
  if (existing >= 0) {
    data.sentences[existing].text = text.trim();
  } else {
    data.sentences.push({ username: req.session.username, text: text.trim() });
  }

  saveData(data);
  res.json({ ok: true });
});

// Get sentences for guessing (phase 3+)
app.get('/api/sentences', requireLogin, (req, res) => {
  const data = loadData();
  if (data.phase < 3) {
    return res.status(400).json({ error: 'Guessing phase has not started' });
  }

  // Return sentences in their stored (shuffled) order
  const sentences = data.sentences.map(s => s.text);

  // Return students who submitted, sorted alphabetically by display name
  const students = data.sentences
    .map(s => {
      const user = data.users.find(u => u.username === s.username);
      return { username: s.username, displayName: user ? user.displayName : s.username };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  res.json({ sentences, students });
});

// Submit guesses (phase 3 only)
app.post('/api/submit-guesses', requireLogin, (req, res) => {
  const data = loadData();
  if (data.phase !== 3) {
    return res.status(400).json({ error: 'Guessing phase is not open' });
  }

  const { guessMap } = req.body;
  if (!guessMap || typeof guessMap !== 'object') {
    return res.status(400).json({ error: 'Invalid guesses' });
  }

  const existing = data.guesses.findIndex(g => g.guesserUsername === req.session.username);
  if (existing >= 0) {
    data.guesses[existing].guessMap = guessMap;
  } else {
    data.guesses.push({ guesserUsername: req.session.username, guessMap });
  }

  saveData(data);
  res.json({ ok: true });
});

// Get results (phase 4 only)
app.get('/api/results', requireLogin, (req, res) => {
  const data = loadData();
  if (data.phase < 4) {
    return res.status(400).json({ error: 'Results are not available yet' });
  }

  // Build the answer key: username -> sentence text
  const answerKey = {};
  for (const s of data.sentences) {
    answerKey[s.username] = s.text;
  }

  const totalStudents = data.sentences.length;

  // Score each student who submitted guesses
  const scoreboard = [];
  for (const user of data.users) {
    const guessEntry = data.guesses.find(g => g.guesserUsername === user.username);
    let score = 0;

    if (guessEntry) {
      for (const [guessedUsername, guessedSentence] of Object.entries(guessEntry.guessMap)) {
        // Don't count self-match
        if (guessedUsername === user.username) continue;
        if (answerKey[guessedUsername] === guessedSentence) {
          score++;
        }
      }
    }

    scoreboard.push({
      username: user.username,
      displayName: user.displayName,
      score
    });
  }

  // Sort by score descending
  scoreboard.sort((a, b) => b.score - a.score);

  // Build answer key for display
  const answerKeyDisplay = data.sentences.map(s => {
    const user = data.users.find(u => u.username === s.username);
    return {
      displayName: user ? user.displayName : s.username,
      sentence: s.text
    };
  });

  // Find current user's score
  const myEntry = scoreboard.find(s => s.username === req.session.username);
  const myScore = myEntry ? myEntry.score : 0;

  res.json({
    scoreboard,
    totalPossible: totalStudents - 1,
    myScore,
    answerKey: answerKeyDisplay
  });
});

// ===========================
//  ADMIN ENDPOINTS
// ===========================

// Game status summary
app.get('/api/admin/status', requireAdmin, (req, res) => {
  const data = loadData();
  res.json({
    phase: data.phase,
    userCount: data.users.length,
    sentenceCount: data.sentences.length,
    guessCount: data.guesses.length,
    users: data.users.map(u => {
      const hasSentence = data.sentences.some(s => s.username === u.username);
      const hasGuessed = data.guesses.some(g => g.guesserUsername === u.username);
      return { displayName: u.displayName, hasSentence, hasGuessed };
    })
  });
});

// Advance phase (forward only)
app.post('/api/admin/set-phase', requireAdmin, (req, res) => {
  const data = loadData();
  const { phase } = req.body;

  if (typeof phase !== 'number' || phase < 1 || phase > 4) {
    return res.status(400).json({ error: 'Phase must be 1-4' });
  }

  if (phase <= data.phase) {
    return res.status(400).json({ error: 'Can only advance to a later phase' });
  }

  // If advancing to phase 3, shuffle the sentences
  if (phase >= 3 && data.phase < 3) {
    data.sentences = shuffle(data.sentences);
  }

  data.phase = phase;
  saveData(data);
  res.json({ ok: true, phase: data.phase });
});

// Reset all data
app.post('/api/admin/reset', requireAdmin, (req, res) => {
  const defaults = { phase: 1, users: [], sentences: [], guesses: [] };
  saveData(defaults);
  res.json({ ok: true });
});

// --- Start Server ---
app.listen(PORT, () => {
  console.log(`Sentence game running at http://localhost:${PORT}`);
  console.log(`Admin password: ${ADMIN_PASSWORD}`);
});
