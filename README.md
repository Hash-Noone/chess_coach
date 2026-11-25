# Chess Coach

Play Stockfish, build a library of games, and review each move with plain-language coaching. This is a static browser app: there's no server, account, or API key.

## Run locally

Use Node.js 24 and npm:

```sh
npm ci
npm run dev
```

Open the URL printed by Vite. Run `npm test` for the coach and import tests, or `npm run build` for a static build in `dist/`.

## What's inside

- **Play:** Choose White or Black and one of six strength levels. Click or drag pieces, inspect the evaluation and move list, undo a turn, or send the position to the coach.
- **Game library:** Load up to 20 recent public standard games for a Lichess username, paste a PGN, or open a practice game. Imported games are saved in this browser's local storage. If Lichess doesn't provide the bulk export, the app tries its latest-game endpoint and labels the result.
- **AI coach:** The single-threaded Stockfish WebAssembly worker analyzes positions at depth 12. The coach uses score changes, engine moves, and chess rules to explain tactical ideas, misses, and alternatives, with a best-move arrow and practice tips. Its win chances and accuracy are estimates at a fixed depth, not official Lichess measurements. Explanations use local heuristics, not an external language model.
- **Opening explorer:** Compare book moves at the position on the board. If the Lichess community database isn't available anonymously, the app uses the Lichess Masters database instead.

## Deploy

Set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**. The Pages workflow checks PRs and deploys builds from `main`. Relative asset URLs support the project site at `https://hash-noone.github.io/chess-coach/`.

Stockfish.js binaries are copied from the npm package on install. Stockfish and its browser port are GPLv3; the [matching browser-port source (v18.0.8)](https://github.com/nmrugg/stockfish.js/tree/v18.0.8) and the GPL notice included in `dist/engine/COPYING.txt` apply to the distributed engine. Lichess games and opening data come from the [Lichess API](https://lichess.org/api).
