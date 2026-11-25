import argparse
from collections import Counter, defaultdict
from contextlib import contextmanager
import hashlib
import io
from itertools import islice
import json
from pathlib import Path
from urllib.request import Request, urlopen

import chess
import chess.pgn
import numpy as np
import zstandard

DATABASE = "https://database.lichess.org"
EVALS = f"{DATABASE}/lichess_db_eval.jsonl.zst"
MONTH = "2025-01"
FEATURES = 773
WIDTH = 64
SEED = 1701
SCALE = 4096
VALUES = (100, 320, 330, 500, 900, 0)


@contextmanager
def stream(url, limit):
    request = Request(url, headers={
        "User-Agent": "ChessCoach-training/1.0 (bounded public dataset sample)",
        "Range": f"bytes=0-{limit - 1}",
    })
    with urlopen(request, timeout=45) as compressed:
        with zstandard.ZstdDecompressor().stream_reader(compressed) as decompressed:
            with io.TextIOWrapper(decompressed, encoding="utf-8") as text:
                yield text


def encode(fen, features):
    pieces, turn, castling, *_ = fen.split()
    rank, file = 7, 0
    material = 0
    for symbol in pieces:
        if symbol == "/":
            rank -= 1
            file = 0
        elif symbol.isdigit():
            file += int(symbol)
        else:
            kind = "pnbrqk".index(symbol.lower())
            black = symbol.islower()
            features[(6 * black + kind) * 64 + rank * 8 + file] = 1
            material += (-1 if black else 1) * VALUES[kind]
            file += 1
    features[768] = turn == "w"
    for index, right in enumerate("KQkq"):
        features[769 + index] = right in castling
    return material


def load_evaluations(rows):
    features = np.empty((rows, FEATURES), dtype=np.uint8)
    targets = np.empty(rows, dtype=np.float32)
    validation = np.empty(rows, dtype=bool)
    with stream(EVALS, 250 * 1024 * 1024) as source:
        for index, line in enumerate(islice(source, rows)):
            record = json.loads(line)
            fen = record["fen"]
            features[index].fill(0)
            material = encode(fen, features[index])
            deepest = max(record["evals"], key=lambda item: (item["depth"], -len(item["pvs"])))["pvs"][0]
            cp = deepest.get("cp", 3000 if deepest.get("mate", 0) > 0 else -3000)
            targets[index] = np.clip((cp - material) / 800, -3, 3)
            validation[index] = int.from_bytes(hashlib.blake2s(fen.encode(), digest_size=2).digest(), "big") % 20 == 0
            if (index + 1) % 50000 == 0:
                print(f"Read {index + 1:,} Lichess evaluations", flush=True)
        if index + 1 != rows:
            raise RuntimeError("Evaluation stream did not contain the requested sample")
    return features, targets, validation


def load_games(count, month):
    url = f"{DATABASE}/standard/lichess_db_standard_rated_{month}.pgn.zst"
    book = defaultdict(Counter)
    fens, results = [], []
    games = 0
    with stream(url, 60 * 1024 * 1024) as source:
        while games < count:
            game = chess.pgn.read_game(source)
            if game is None:
                break
            if game.errors:
                continue
            result = {"1-0": 180, "0-1": -180, "1/2-1/2": 0}.get(game.headers.get("Result"))
            if result is None:
                continue
            board = game.board()
            if board.fen() != chess.STARTING_FEN:
                continue
            for ply, move in enumerate(game.mainline_moves()):
                if ply < 10:
                    book[" ".join(board.fen().split()[:4])][move.uci()] += 1
                if ply in (12, 18, 24, 30, 36, 42):
                    fens.append(board.fen())
                    results.append(result)
                board.push(move)
                if ply >= 42:
                    break
            games += 1
    if games != count:
        raise RuntimeError("Game stream did not contain the requested sample")
    compact = {}
    for fen, counts in sorted(book.items(), key=lambda pair: -sum(pair[1].values()))[:3000]:
        candidates = [(move, n) for move, n in counts.most_common(6) if n >= 3 and n * 40 >= sum(counts.values())]
        if candidates:
            compact[fen] = candidates
    features = np.zeros((len(fens), FEATURES), dtype=np.uint8)
    targets = np.empty(len(fens), dtype=np.float32)
    for index, fen in enumerate(fens):
        material = encode(fen, features[index])
        targets[index] = np.clip((results[index] - material) / 800, -3, 3)
    print(f"Read {games:,} games, {len(fens):,} training positions, {len(compact):,} book positions", flush=True)
    return compact, features, targets


def train(features, targets, validation, games, outcomes, epochs):
    rng = np.random.default_rng(SEED)
    w1 = rng.normal(0, 0.08, (FEATURES, WIDTH)).astype(np.float32)
    b1 = np.full(WIDTH, 0.05, dtype=np.float32)
    w2 = rng.normal(0, 0.06, (WIDTH, 1)).astype(np.float32)
    b2 = np.zeros(1, dtype=np.float32)
    params = [w1, b1, w2, b2]
    first = [np.zeros_like(param) for param in params]
    second = [np.zeros_like(param) for param in params]
    indices = np.flatnonzero(~validation)
    eval_train = len(indices)
    inputs = np.concatenate((features[indices], games))
    expected = np.concatenate((targets[indices], outcomes))
    weights = np.full(len(inputs), 0.12, dtype=np.float32)
    weights[:eval_train] = 1
    valid_x = features[validation].astype(np.float32)
    valid_y = targets[validation]
    step = 0
    best = None
    best_mae = float("inf")
    baseline = float(np.abs(valid_y).mean() * 800)
    for epoch in range(1, epochs + 1):
        order = rng.permutation(len(inputs))
        for start in range(0, len(order), 1024):
            batch = order[start:start + 1024]
            x = inputs[batch].astype(np.float32)
            h = np.clip(x @ w1 + b1, 0, 3)
            prediction = (h @ w2 + b2).ravel()
            diff = (np.clip(prediction - expected[batch], -0.5, 0.5) * weights[batch] / len(batch))[:, None]
            dh = (diff @ w2.T) * ((h > 0) & (h < 3))
            grads = [x.T @ dh, dh.sum(axis=0), h.T @ diff, diff.sum(axis=0)]
            step += 1
            lr = 0.002 / (1 + 0.13 * (epoch - 1))
            for param, m, v, grad in zip(params, first, second, grads):
                m *= 0.9
                m += 0.1 * grad
                v *= 0.999
                v += 0.001 * grad ** 2
                param -= (lr / (1 - 0.9 ** step)) * m / (np.sqrt(v / (1 - 0.999 ** step)) + 1e-8)
        quantized = [np.rint(param * SCALE).astype("<i2") for param in params]
        q1, qb1, q2, qb2 = [param.astype(np.float32) / SCALE for param in quantized]
        error = np.abs((np.clip(valid_x @ q1 + qb1, 0, 3) @ q2 + qb2).ravel() - valid_y) * 800
        mae = float(error.mean())
        print(f"Epoch {epoch}: validation MAE {mae:.1f} cp (material baseline {baseline:.1f} cp)", flush=True)
        if mae < best_mae:
            best_mae = mae
            best = (quantized, float((error <= 100).mean()), epoch)
    quantized, within_pawn, best_epoch = best
    return b"".join(weights.tobytes() for weights in quantized), {
        "evaluationTrainingPositions": int(eval_train),
        "validationPositions": int(validation.sum()),
        "gameTrainingPositions": len(games),
        "validationMaeCp": round(best_mae, 1),
        "materialMaeCp": round(baseline, 1),
        "validationWithinOnePawn": round(100 * within_pawn, 1),
        "bestEpoch": best_epoch,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--positions", type=int, default=300000)
    parser.add_argument("--games", type=int, default=12000)
    parser.add_argument("--month", default=MONTH)
    parser.add_argument("--epochs", type=int, default=9)
    parser.add_argument("--out", type=Path, default=Path("public/lichess-engine"))
    args = parser.parse_args()
    if args.positions < 100 or args.games < 1 or args.epochs < 1:
        parser.error("Use at least 100 positions, one game, and one epoch")
    book, games, outcomes = load_games(args.games, args.month)
    features, targets, validation = load_evaluations(args.positions)
    model, metrics = train(features, targets, validation, games, outcomes, args.epochs)
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "model.bin").write_bytes(model)
    (args.out / "book.json").write_text(json.dumps(book, separators=(",", ":")) + "\n")
    manifest = {
        "version": 1, "seed": SEED, "features": FEATURES, "width": WIDTH, "scale": SCALE,
        "evaluationSource": EVALS, "gameArchiveMonth": args.month,
        "games": args.games, "bookPositions": len(book), **metrics,
    }
    (args.out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps(manifest), flush=True)


if __name__ == "__main__":
    main()
