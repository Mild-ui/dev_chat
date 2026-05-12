# 🔒 DevChat — Encrypted Developer Chat System

A full-stack real-time encrypted chat application for developers.
Built with **React**, **Node.js/Express**, **MySQL**, and **Socket.IO**.
Messages are encrypted with **AES-256-CBC** before storage.

---

## 📁 Project Structure

```
devchat/
├── backend/
│   ├── config/
│   │   └── database.js        # MySQL pool (mysql2)
│   ├── middleware/
│   │   └── auth.js            # JWT verification middleware
│   ├── routes/
│   │   ├── auth.js            # POST /register, POST /login
│   │   └── messages.js        # GET/POST messages, decrypt
│   ├── socket/
│   │   └── socketHandler.js   # Socket.IO events
│   ├── utils/
│   │   └── encryption.js      # AES-256 encrypt/decrypt
│   ├── schema.sql             # MySQL table definitions
│   ├── server.js              # Express entry point
│   ├── Dockerfile
│   └── .env
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── chat/
│   │   │   │   ├── ChatWindow.js    # Conversation view
│   │   │   │   ├── MessageBubble.js # Single message + decrypt button
│   │   │   │   ├── MessageInput.js  # Encrypt & Send bar
│   │   │   │   └── Sidebar.js       # Chat list + user list
│   │   │   └── ui/
│   │   │       └── Avatar.js        # User avatar component
│   │   ├── contexts/
│   │   │   └── AuthContext.js       # Global auth state
│   │   ├── pages/
│   │   │   ├── LoginPage.js
│   │   │   ├── RegisterPage.js
│   │   │   └── ChatPage.js          # Main chat orchestrator
│   │   └── utils/
│   │       ├── api.js               # Axios instance + JWT interceptor
│   │       └── socket.js            # Socket.IO singleton
│   ├── Dockerfile
│   └── .env.example
│
└── docker-compose.yml         # Run everything locally
```

---

## 🔐 Encryption Flow

```
SENDER:
  1. Types message → clicks "Encrypt & Send"
  2. POST /api/messages/send { receiverId, plaintext }
  3. Server: encryptMessage(plaintext) → { ciphertext, iv }
  4. MySQL stores: encrypted_message (hex), encryption_iv (hex)
  5. Plaintext is NEVER stored anywhere

RECEIVER:
  1. Sees ciphertext preview in UI (e.g. "a3f9c1b2...")
  2. Clicks "Decrypt" → POST /api/messages/decrypt { messageId }
  3. Server verifies JWT (must be sender OR receiver)
  4. Server: decryptMessage(ciphertext, iv) → plaintext
  5. Plaintext shown in UI (never persisted on client)
```

---

## 🚀 Local Setup (Without Docker)

### 1. MySQL Setup

```bash
# Install MySQL 8.0 and run:
mysql -u root -p < backend/schema.sql
```

### 2. Backend

```bash
cd backend
npm install

# Copy and fill in env vars
cp .env.example .env
# Edit .env: set DB_HOST, DB_PASSWORD, JWT_SECRET, ENCRYPTION_KEY

npm run dev    # starts with nodemon on port 5000
```

Generate a secure encryption key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Frontend

```bash
cd frontend
npm install

# Copy and fill in env vars
cp .env.example .env
# Set REACT_APP_API_URL=http://localhost:5000

npm start      # starts on port 3000
```

---

## 🐳 Docker Setup (Easiest)

```bash
# From project root:
docker-compose up --build

# Open http://localhost:3000
# Demo: alice@demo.com / password123
```

---

## ☁️ Production Deployment (Global Access)

### Step 1: Deploy MySQL Database

**Option A — Railway (recommended, free tier)**
1. Go to https://railway.app → New Project → MySQL
2. Copy the `DATABASE_URL` or individual connection vars

**Option B — PlanetScale**
1. https://planetscale.com → new database
2. Create a password and get connection string
3. Note: PlanetScale requires SSL (`ssl: { rejectUnauthorized: true }` — already in code)

**Option C — Aiven**
1. https://aiven.io → Create MySQL service (free tier)

After creating database, run the schema:
```bash
mysql -h <host> -u <user> -p <dbname> < backend/schema.sql
```

---

### Step 2: Deploy Backend to Render

1. Push code to GitHub
2. Go to https://render.com → New Web Service
3. Connect your repo, set **Root Directory** to `backend`
4. Build command: `npm install`
5. Start command: `node server.js`
6. Add environment variables:

```env
NODE_ENV=production
DB_HOST=<from Railway/PlanetScale>
DB_PORT=3306
DB_USER=<db user>
DB_PASSWORD=<db password>
DB_NAME=devchat
JWT_SECRET=<generate a long random string>
ENCRYPTION_KEY=<64 hex chars>
FRONTEND_URL=https://your-app.vercel.app
```

Copy your Render URL (e.g. `https://devchat-api.onrender.com`)

---

### Step 3: Deploy Frontend to Vercel

1. Go to https://vercel.com → Import Git Repository
2. Set **Root Directory** to `frontend`
3. Add environment variables:

```env
REACT_APP_API_URL=https://devchat-api.onrender.com
REACT_APP_SOCKET_URL=https://devchat-api.onrender.com
```

4. Deploy → copy your Vercel URL
5. Go back to Render → update `FRONTEND_URL` to your Vercel URL

---

## 🔑 Environment Variables Reference

### Backend `.env`

| Variable | Description | Example |
|---|---|---|
| `PORT` | Server port | `5000` |
| `DB_HOST` | MySQL host | `localhost` |
| `DB_PORT` | MySQL port | `3306` |
| `DB_USER` | MySQL username | `root` |
| `DB_PASSWORD` | MySQL password | `secret` |
| `DB_NAME` | Database name | `devchat` |
| `JWT_SECRET` | JWT signing secret (32+ chars) | `random_long_string` |
| `JWT_EXPIRES_IN` | Token expiry | `7d` |
| `ENCRYPTION_KEY` | AES-256 key (64 hex chars) | `a1b2c3...` |
| `FRONTEND_URL` | CORS allowed origin | `http://localhost:3000` |

### Frontend `.env`

| Variable | Description | Example |
|---|---|---|
| `REACT_APP_API_URL` | Backend REST URL | `http://localhost:5000` |
| `REACT_APP_SOCKET_URL` | Backend Socket.IO URL | `http://localhost:5000` |

---

## 📡 API Reference

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | No | Register new user |
| POST | `/api/auth/login` | No | Login, get JWT |
| GET | `/api/messages/chats` | Yes | Get chat list |
| GET | `/api/messages/users` | Yes | Get all users |
| GET | `/api/messages/:userId` | Yes | Get conversation |
| POST | `/api/messages/send` | Yes | Send encrypted message |
| POST | `/api/messages/decrypt` | Yes | Decrypt a message |
| PATCH | `/api/messages/read/:senderId` | Yes | Mark messages as read |

---

## ⚡ Socket.IO Events

### Client → Server
| Event | Payload | Description |
|---|---|---|
| `deliver_message` | `{ message, receiverId }` | Push message to receiver |
| `typing_start` | `{ receiverId }` | Show typing indicator |
| `typing_stop` | `{ receiverId }` | Hide typing indicator |
| `messages_read` | `{ senderId }` | Mark as seen |

### Server → Client
| Event | Payload | Description |
|---|---|---|
| `new_message` | message object | New message arrived |
| `online_users` | `[userId, ...]` | List of online user IDs |
| `user_status_change` | `{ userId, status }` | User went online/offline |
| `user_typing` | `{ userId }` | Someone is typing |
| `user_stopped_typing` | `{ userId }` | Stopped typing |
| `messages_seen` | `{ readBy }` | Your message was read |

---

## 🔧 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Tailwind CSS, Socket.IO Client |
| Backend | Node.js, Express 4, Socket.IO Server |
| Database | MySQL 8.0 with mysql2 (connection pooling) |
| Auth | JWT + bcrypt (12 salt rounds) |
| Encryption | AES-256-CBC (Node.js crypto module) |
| Deployment | Vercel (frontend) + Render (backend) + Railway (MySQL) |

---

## 🎯 Demo Credentials

```
Email:    alice@demo.com
Password: password123

Email:    bob@demo.com
Password: password123
```

---

## 🛡️ Security Features

- AES-256-CBC message encryption (plaintext never stored)
- Per-message random IV (prevents pattern attacks)
- JWT authentication with expiry
- bcrypt password hashing (12 rounds)
- Rate limiting (100 req/15min, stricter on auth)
- Input validation + sanitization (express-validator)
- CORS with origin whitelist
- Helmet.js security headers
- Authorization check before decryption (sender/receiver only)
