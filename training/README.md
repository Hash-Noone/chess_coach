# Reproduce the Lichess-trained engine

The engine's neural evaluation is trained offline; neither the Python environment nor the archive downloads are needed to play it. The app ships the model, book, and metrics under `public/lichess-engine/`.

Run from the repository root with Python 3.12:

```sh
python -m venv .venv
. .venv/bin/activate
pip install -r training/requirements.txt
OPENBLAS_NUM_THREADS=4 python training/train.py
```

The reproducible configuration uses a fixed seed, the first 300,000 records from the [Lichess evaluated positions export](https://database.lichess.org/#evals), and 12,000 games from [January 2025 rated standard games](https://database.lichess.org/#standard_games). Both exports are CC0. The evaluation archive is updated by Lichess; these weights used the November 11, 2026 snapshot, so a newer download can yield different results. The script uses bounded HTTP byte ranges and streams decompression, stopping when it has enough records. It never downloads either full archive.

The 773 features encode the piece-square pairs, side to move, and castling rights. A 64-unit clipped ReLU layer learns a correction to base material, supervised on the deepest Lichess Stockfish evaluations (mates represented by ±3,000 centipawns). Six sampled positions per eligible rated game are weakly supervised by the actual game result (weight 0.12). A FEN hash holds roughly 5% of the evaluation export out of training; trained candidates are selected on that validation set. Error metrics compare the reloaded quantized weights against capped target residuals (±2,400 cp), not against uncapped scores or an independent test set.

The checked-in model was trained on **284,810 evaluated positions** and **65,209 positions from rated games**. On **15,190 validation positions**, mean absolute error was **272.8 cp** versus **564.7 cp** for material alone; **50.3%** of predictions were within 100 cp of their target. This is a small training engine, not an Elo-matched replacement for Stockfish. The opening book has 2,320 positions from the first ten plies, with legal moves sampled by observed frequency. Once out of book, the browser uses iterative deepening, negamax alpha-beta, and tactical quiescence search.

The exported weights are 16-bit integers at scale 4,096. The file stores the input-to-hidden matrix in feature-major order, hidden bias, hidden-to-output weights, and output bias, all little-endian. The book stores normalized four-field FEN keys and UCI move/count pairs.

## Engine sanity benchmark

Run `node training/benchmark.mjs` after `npm ci` to play two games against seeded random legal moves and two against the included Stockfish lite at skill 0 and depth 5. It uses the same search, weights, and opening book as the browser. Time-limited search can vary across machines; if a game reaches its ply cap, the script reports it as unfinished, with its material margin. Four games are a sanity check, not a strength rating.

In the initial run, the trained engine checkmated random play in 37 plies as White and 22 as Black. Stockfish checkmated it in 20 plies as White; the game with the trained engine playing Black reached the 90-ply cap unfinished, with the trained engine down three points of material.
