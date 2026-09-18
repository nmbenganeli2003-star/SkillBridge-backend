# SkillBridge API

Node.js, Express, MongoDB/Mongoose, and strict TypeScript. Authentication uses a signed JWT in an HttpOnly, SameSite cookie; bcrypt hashes passwords.

## Setup

```sh
npm install
cp .env.example .env
# Configure a random JWT_SECRET (32+ characters).
npm run dev:local
```

For existing MongoDB, configure `MONGODB_URI` and use `npm run dev`. Local mode runs a real MongoDB process with persistent files in `.data/mongodb`.

| Variable | Purpose |
|---|---|
| `PORT` | API port; default 4000 |
| `MONGODB_URI` | Local MongoDB or Atlas URI |
| `CLIENT_ORIGIN` | Allowed browser origin; default http://localhost:5173 |
| `JWT_SECRET` | Stable random secret, minimum 32 characters; required in production |
| `NODE_ENV` | `production` enables secure cookies |
| `SEED_DEMO` | Enable fictional sample accounts; never use for public production |

Without a secret, development uses a temporary value that signs users out on restart.

## Scripts

- `npm run dev`: TypeScript watch mode, configured MongoDB.
- `npm run dev:local`: Watch mode with a locally managed MongoDB process.
- `npm run build`: Compile TypeScript into `dist`.
- `npm start`: Run compiled API.
- `npm run seed`: Add demo data once.
- `npm test`: Integration tests against isolated MongoDB.

## API

Paths are prefixed with `/api`. Except health and authentication, endpoints require the session cookie. Errors use `{ "error": "message" }`.

| Area | Endpoints |
|---|---|
| Health | `GET /health` |
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `GET /auth/session` |
| Profiles | `GET /users?q=&category=&location=`, `GET /users/:id`, `PATCH /users/me`, `POST /users/:id/connect` |
| Sessions | `GET/POST /sessions`, `PATCH /sessions/:id` |
| Reviews | `GET /users/:id/reviews`, `POST /sessions/:id/review` |
| Posts | `GET/POST /posts`, `POST /posts/:id/like`, `POST /posts/:id/comments` |
| Groups | `GET /groups`, `POST /groups/:id/join` |
| Resources | `GET/POST /resources`, `GET /resources/:id`, `GET /resources/:id/download`, `POST /resources/:id/save` |
| Messages | `GET/POST /messages/:id` (peer ID) |
| Notifications | `GET /notifications`, `PATCH /notifications/read` |

Sessions accept `recipient`, `title`, an ISO UTC `startsAt`, `duration` (15–240 minutes), `format` (`Online` or `In person`), and optional `notes`. Only recipients may confirm; either participant may cancel. Confirmed sessions may be completed after their start time. Reviews require completed sessions and are limited to one per participant per session.

Resources accept `title`, `description`, `category`, `tags` (up to four), and text/Markdown `content`. Downloads are Markdown attachments. Messages are private to their two participants.

For scaling, replace the per-process rate limiter with a shared store and add indexed search/pagination. Peer search currently considers up to 200 profiles; other lists are bounded. Use HTTPS and a private database in production.
