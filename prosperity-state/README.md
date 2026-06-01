# Prosperity State

A multiplayer economic & political strategy game. You are a citizen of a shared
nation. Everyone benefits when the country prospers — but the game only ends when
national **Prosperity** reaches **100**, and at that moment only the **richest
surviving citizen wins**.

Play online from any device with a 4-letter room code. Empty seats are filled by
AI citizens with distinct personalities (builders, strategists, opportunists,
free-riders).

## Quick start

```bash
npm install
npm start
```

Then open <http://localhost:3000>. Create a game, share the room code, and start
when ready — any empty seats become AI players.

### Play with friends on other devices
The server must be reachable by the other players. On the same LAN they can use
your machine's IP (`http://<your-ip>:3000`). To play over the internet, deploy to
any Node host (Render / Railway / Fly.io / a VPS) — it's a single `npm start`
process with no database.

## How a round works

1. **Income** — each citizen earns `floor(BaseIncome × (1 + Prosperity/40))`.
   Income rises as the nation prospers (and with the Roads project).
2. **Contribute** — secretly split your income between *keep* and *contribute*.
   Contributions are revealed only after everyone has locked in.
3. **Resolve** — the shared pool raises Prosperity. Generous rounds are far more
   efficient: `K = max(4, 16 − floor(C/3))`, `ΔP = floor(C/K)` (boosted by
   Education). The single biggest giver gets a **20% Top Contributor refund**.
4. **Vote** — every 3 rounds, citizens vote on policy (infrastructure focus, tax,
   welfare). Votes are weighted by **Influence**, which you earn by contributing
   and which decays 20% per round.

Hit **0 Coins** and you go bankrupt — out of the final ranking. If Prosperity
ever falls to **0**, society collapses and everyone loses.

## Systems implemented (GDD v1.1)

- Personal economy (income, keep/contribute, bankruptcy floor at 0)
- Prosperity growth with the efficiency curve `K`/`ΔP`
- Top Contributor bonus (20% refund, ties share it)
- Influence with 20%/round decay and a permanent floor of 1
- Influence-weighted voting every 3 rounds
- All 5 infrastructure tracks (Roads, Education, Energy, Healthcare, Industry),
  levels 1–5, funded by contributions toward the voted focus
- Tax (flat / progressive) and welfare / expansion policies
- Random negative events, mitigated by Healthcare
- Win at Prosperity 100 → wealth ranking · collapse at Prosperity 0

All tuning constants live in [`server/constants.js`](server/constants.js).

## Project layout

```
server/
  constants.js   tuning parameters (single source of truth)
  engine.js      pure game logic — all formulas & the phase machine
  ai.js          bot decision-making (contributions + voting)
  rooms.js       lobby, sessions, timed simultaneous-turn orchestration
  index.js       HTTP static server + WebSocket protocol
  sim.js         headless all-bot simulation  (npm run sim [players])
  test-ws.js     end-to-end protocol test     (PS_FAST=1 npm start, then run)
public/
  index.html, styles.css, client.js   the web client
```

## Dev tools

```bash
npm run sim 6      # simulate a full 6-bot game in the terminal
PS_FAST=1 npm start  # collapse phase delays for fast local testing
```
