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

- **Play:** Choose the default Lichess-trained engine or Stockfish, White or Black, and one of six strength levels. Use **Load position (FEN)** to start from a custom position. The trained engine uses an opening book from rated games and a compact neural evaluation trained on Lichess data. Both engines run in browser workers. See [Training](training/README.md) for data, metrics, and reproduction steps.
- **Game library:** Load up to 20 recent public standard games by Lichess or Chess.com username, paste a PGN, or open a practice game. Imported games are saved in this browser's local storage. If Lichess doesn't provide the bulk export, the app tries its latest-game endpoint and labels the result.
- **AI coach:** Stockfish searches up to 12 individual turns ahead for a move-by-move review. Switch between Beginner (plain language and notation explanations) and Advanced (standard chess terms). The free coach explains threats and alternatives, shows a best-move arrow, and offers practice tips. Reviews and selected moves are kept per game while the app is open. Win chances and accuracy are estimates, not official Lichess measurements.
- **Opening explorer:** See the current position’s opening and ECO code when available, plus win, draw, and loss rates for up to eight moves. Click a move to play it on your turn or explore a variation in the coach without changing the recorded game. If the Lichess community database isn't available anonymously, the app uses the Lichess Masters database instead.

## Optional LLM coach

In **AI coach → Coach settings**, enable an OpenAI-compatible Chat Completions endpoint or Anthropic Messages with your own model and API key. For an OpenAI-compatible provider, enter the API base URL (for example, `https://api.openai.com/v1`, not the full completions route). The provider must allow cross-origin browser requests from the app’s URL. Anthropic uses its explicit direct-browser-access header. Hosted API requests may use your provider credits or incur charges.

Enabling the LLM sends engine facts for the game recap and each analyzed move you select; **Ask the coach** sends your question and the position you are viewing. It includes FEN, legal engine lines in SAN, evaluations, and local tactical findings, and instructs the model not to invent variations. Model text can still be wrong; the board, Stockfish output, and rule-based explanation remain visible. The API key is kept only in tab memory, never written to storage, and removed on disconnect or reload. The provider, URL, and model are remembered in local storage.

## Deploy

Set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**. The Pages workflow checks PRs and deploys builds from `main`. Relative asset URLs support the project site at `https://hash-noone.github.io/chess-coach/`.

Stockfish.js binaries are copied from the npm package on install. Stockfish and its browser port are GPLv3; the [matching browser-port source (v18.0.8)](https://github.com/nmrugg/stockfish.js/tree/v18.0.8) and the GPL notice included in `dist/engine/COPYING.txt` apply to the distributed engine. Lichess games and opening data come from the [Lichess API](https://lichess.org/api); Chess.com games come from the [Chess.com Published Data API](https://www.chess.com/news/view/published-data-api).
