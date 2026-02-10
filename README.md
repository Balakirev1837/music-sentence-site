# Sentence Guessing Game

A small classroom activity where students submit a sentence, then try to guess who wrote each one.

## How it works

1. Students create accounts and log in
2. Teacher advances the game through 4 phases from the admin panel
3. Students submit a sentence
4. Students guess who wrote each sentence
5. Scores are revealed

## Setup

```
npm install
npm start
```

Server runs on `http://localhost:3998`. Students connect via your machine's IP on the local network.

## Admin

Click "Teacher? Admin login" on the main page. Password: `teacher123`

The admin panel shows how many students have registered, submitted sentences, and submitted guesses. The teacher advances phases when ready.

## API Endpoints

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/register | Create account (phase 1 only) |
| POST | /api/login | Student login |
| POST | /api/admin-login | Teacher login |
| POST | /api/logout | Clear session |
| GET | /api/me | Current session info |
| GET | /api/phase | Current phase number |

### Game
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/submit-sentence | Submit a sentence (phase 2) |
| GET | /api/sentences | Get shuffled sentences and student list (phase 3+) |
| POST | /api/submit-guesses | Submit guess mapping (phase 3) |
| GET | /api/results | Scoreboard and answer key (phase 4) |

### Admin
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/admin/status | Game state summary |
| POST | /api/admin/set-phase | Advance to next phase |
| POST | /api/admin/reset | Reset all data |

## Tech

- Node.js + Express
- Plain HTML/CSS/JS frontend
- Data stored in a JSON file (no database)
- Sessions via signed cookies
