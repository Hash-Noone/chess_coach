# Chess Coach

Play Stockfish, build a library of games, and review each move with plain-language coaching. The rule-based coach, engines, and library work without an account or API key. An optional Node server provides a built-in Gemini coach.

## Run locally

Use Node.js 24 and npm:

```sh
npm ci
npm run dev
```

Open the URL printed by Vite. Run `npm test` for the coach and import tests, or `npm run build` for the browser build in `dist/`. Set `GEMINI_API_KEY` in the dev server environment before starting Vite to test built-in Gemini.

## What's inside

- **Play:** Choose the default Lichess-trained engine or Stockfish, White or Black, and one of six strength levels. Use **Load position (FEN)** to start from a custom position. The trained engine uses an opening book from rated games and a compact neural evaluation trained on Lichess data. Both engines run in browser workers. See [Training](training/README.md) for data, metrics, and reproduction steps.
- **Game library:** Load up to 20 recent public standard games by Lichess or Chess.com username, paste a PGN, or open a practice game. Imported games are saved in this browser's local storage. If Lichess doesn't provide the bulk export, the app tries its latest-game endpoint and labels the result.
- **AI coach:** Stockfish searches up to 12 individual turns ahead for a move-by-move review. Switch between Beginner (plain language and notation explanations) and Advanced (standard chess terms). The free coach explains threats and alternatives, shows a best-move arrow, and offers practice tips. Reviews and selected moves are kept per game while the app is open. Win chances and accuracy are estimates, not official Lichess measurements.
- **Opening explorer:** See the current position’s opening and ECO code when available, plus win, draw, and loss rates for up to eight moves. Click a move to play it on your turn or explore a variation in the coach without changing the recorded game. If the Lichess community database isn't available anonymously, the app uses the Lichess Masters database instead.

## Built-in Gemini and custom providers

Built-in Gemini is the default when the app server has a Gemini key. Visitors don't need a key. If the server is not configured or a request fails, the existing rule-based review remains available. Visitors can also switch to the rule-based coach in **AI coach → Coach settings**.

In **Coach settings**, visitors can alternatively connect an OpenAI-compatible Chat Completions endpoint or Anthropic Messages with their own model and API key. For an OpenAI-compatible provider, enter an API base URL such as `https://api.openai.com/v1`, not the full completions route. The provider must allow cross-origin browser requests; Anthropic uses its explicit direct-browser-access header. A visitor's key is kept only in tab memory and removed on disconnect or reload; the provider, URL, and model are remembered in local storage.

The LLM receives engine facts for the game recap and each analyzed move you select. **Ask the coach** also sends your question and the position you are viewing. Prompts include FEN, engine lines in SAN, evaluations, and local tactical findings, and instruct the model not to invent variations. Model text can still be wrong; the board, Stockfish output, and rule-based explanation remain visible. Requests may incur charges for the operator of the configured key.

## Deploy

For **built-in Gemini**, deploy to a Node.js 24 host. Configure `GEMINI_API_KEY` as a server secret; never put it in a `VITE_*` variable. Then run:

```sh
npm ci
npm run build
npm start
```

`npm start` serves `dist/` and the coach API on the same origin (default `0.0.0.0:5173`; override with `HOST` and `PORT`). Set `GEMINI_MODEL` to override `gemini-2.5-flash`. The API caps requests at 32 KiB, allows 15 coaching requests per minute per connection IP, and times out upstream calls after 15 seconds. Clients behind a reverse proxy share its IP limit; for public deployments, serve over HTTPS and configure provider spend limits.

For **static hosting**, set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**. The Pages workflow checks PRs and deploys builds from `main`. Relative asset URLs support the project site. GitHub Pages does not run the Node coach server; visitors still have rule-based coaching and custom providers there.

Stockfish.js binaries are copied from the npm package on install. Stockfish and its browser port are GPLv3; the [matching browser-port source (v18.0.8)](https://github.com/nmrugg/stockfish.js/tree/v18.0.8) and the GPL notice included in `dist/engine/COPYING.txt` apply to the distributed engine. Lichess games and opening data come from the [Lichess API](https://lichess.org/api); Chess.com games come from the [Chess.com Published Data API](https://www.chess.com/news/view/published-data-api).
