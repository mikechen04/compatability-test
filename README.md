# osu! compatibility test (static UI + Node API)

## Run locally

1. Copy `.env.example` to `.env` and add osu! API credentials ([osu! OAuth](https://osu.ppy.sh/home/account/edit#oauth) — client credentials + secret, or legacy `OSU_API_KEY`).
2. `npm install`
3. `npm start` — open **http://localhost:3000** (same origin as `/api`; do not use `python -m http.server` alone).

## Project layout

| File | Role |
|------|------|
| `server.js` | Express: `GET /api/compat`, static files, `index.html` at `/` |
| `osuApi.js` | Fetch osu! user + best scores (v2 OAuth or legacy key) |
| `compatibility.js` | Score + optional `MANUAL_OVERRIDES` pairs; `verdict.pairKey` helps match overrides |
| `compat.js` | Browser: calls API, fills the result card |
| `index.html` | Page shell |
| `styles.css` | Styles |

## API

`GET /api/compat?usernameA=&usernameB=` → JSON with `userA`, `userB`, `verdict` (`title`, `percentShown`, `pairKey`, …).
