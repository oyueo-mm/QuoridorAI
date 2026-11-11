"""Equal-time results with and without "suspect" games (a move > 3x the time budget: machine
sleep or stall). A pair is dropped when either of its games is suspect, so seat balance holds.

    python -X utf8 bench/lib/analyze-clean.py bench/results/stage2/stage2 [matchup ...]
"""
import glob, json, math, os, sys

Z = 1.959964


def wilson(k, n):
    if n == 0:
        return None
    p = k / n
    d = 1 + Z * Z / n
    c = (p + Z * Z / (2 * n)) / d
    h = Z * math.sqrt(p * (1 - p) / n + Z * Z / (4 * n * n)) / d
    return p, max(0.0, c - h), min(1.0, c + h)


def elo(p):
    return None if p <= 0 or p >= 1 else -400 * math.log10(1 / p - 1)


def summarize(games):
    dec = [g for g in games if g['outcome'] in ('a-win', 'b-win')]
    a = sum(g['outcome'] == 'a-win' for g in dec)
    w = wilson(a, len(dec))
    pairs = {}
    for g in games:
        pairs.setdefault(g['pair'], []).append(g)
    scores = [sum(x['outcome'] == 'a-win' for x in v) / 2 for v in pairs.values()
              if len(v) == 2 and all(x['outcome'] in ('a-win', 'b-win') for x in v)]
    m = sum(scores) / len(scores) if scores else float('nan')
    sd = math.sqrt(sum((s - m) ** 2 for s in scores) / (len(scores) - 1)) if len(scores) > 1 else 0
    half = Z * sd / math.sqrt(len(scores)) if scores else float('nan')
    def ms(who):
        xs = [mv['ms'] for g in games for mv in g['agents'][who]['moves']]
        return sum(xs) / len(xs) if xs else float('nan')
    def depth(who):
        xs = [mv['depth'] for g in games for mv in g['agents'][who]['moves'] if mv['depth'] is not None]
        return sum(xs) / len(xs) if xs else float('nan')
    def nps(who):
        n = sum(mv['nodes'] or 0 for g in games for mv in g['agents'][who]['moves'])
        t = sum(mv['ms'] for g in games for mv in g['agents'][who]['moves'] if mv['nodes'] is not None)
        return 1000 * n / t if t else float('nan')
    return {
        'games': len(games), 'decisive': len(dec), 'aWins': a,
        'p': w[0] if w else None, 'low': w[1] if w else None, 'high': w[2] if w else None,
        'elo': elo(w[0]) if w else None, 'eloLow': elo(w[1]) if w else None, 'eloHigh': elo(w[2]) if w else None,
        'pairScore': m, 'pairLow': max(0, m - half), 'pairHigh': min(1, m + half), 'pairs': len(scores),
        'msA': ms(0), 'msB': ms(1), 'depthA': depth(0), 'depthB': depth(1), 'npsA': nps(0), 'npsB': nps(1),
    }


def main():
    root = sys.argv[1]
    ids = sys.argv[2:] or sorted(d for d in os.listdir(root) if os.path.isdir(os.path.join(root, d)))
    out = {}
    for mid in ids:
        games = [json.loads(l) for f in glob.glob(os.path.join(root, mid, 'games.*.jsonl')) for l in open(f, encoding='utf-8') if l.strip()]
        if not games:
            continue
        bad = {g['pair'] for g in games if g.get('overBudgetMoves', 0) > 0}
        clean = [g for g in games if g['pair'] not in bad]
        out[mid] = {'all': summarize(games), 'clean': summarize(clean), 'suspectPairs': len(bad)}
        for k in ('all', 'clean'):
            s = out[mid][k]
            fmt = lambda x, d=1: '—' if x is None or (isinstance(x, float) and math.isnan(x)) else f'{x:.{d}f}'
            print(f"{mid} [{k}] games {s['games']} A {s['aWins']}/{s['decisive']} = {fmt(100*s['p'] if s['p'] is not None else None)}% "
                  f"(CI {fmt(100*s['low'] if s['low'] is not None else None)}–{fmt(100*s['high'] if s['high'] is not None else None)}) "
                  f"Elo {fmt(s['elo'],0)} ({fmt(s['eloLow'],0)}…{fmt(s['eloHigh'],0)}) pair {fmt(s['pairScore'],3)} "
                  f"({fmt(s['pairLow'],3)}–{fmt(s['pairHigh'],3)}, n={s['pairs']}) ms {fmt(s['msA'],0)}/{fmt(s['msB'],0)} "
                  f"depth {fmt(s['depthA'],2)}/{fmt(s['depthB'],2)} kN/s {fmt(s['npsA']/1000)}/{fmt(s['npsB']/1000)}")
        print(f"{mid} suspect pairs dropped: {len(bad)}")
    json.dump(out, open(os.path.join(root, 'clean-analysis.json'), 'w', encoding='utf-8'), indent=1)


if __name__ == '__main__':
    main()
