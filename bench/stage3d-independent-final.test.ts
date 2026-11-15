/** Terminal offline audit; never runs games or changes the frozen plan/old evidence. */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { DEFAULT_SPRT, countPairs, llrTrinomial, sequentialTest } from '../src/arena/sprt';
import { loadIndependentSchedule, fileSha256 } from './lib/openingRegistry';
import { effectiveGames, isSuspect, pairPrefix, readGames } from './lib/suite';
import { hashOf } from './lib/provenance';
import type { TournamentConfig } from '../src/arena/tournament';

it('audits the single terminal independent confirmation against the frozen plan', () => {
  const root = 'bench/results/stage3d-independent';
  const dir = `${root}/stage3d-independent/C-D-300-independent-1`;
  const config = JSON.parse(readFileSync(`${root}/frozen-config.json`, 'utf8')) as TournamentConfig;
  const preregistration = JSON.parse(readFileSync(`${root}/preregistration.json`, 'utf8'));
  const plan = loadIndependentSchedule(config, 1200);
  const saved = JSON.parse(readFileSync(`${dir}/config.json`, 'utf8'));
  const summary = JSON.parse(readFileSync(`${dir}/summary.json`, 'utf8'));
  const raw = readGames(dir);
  const inputFiles = [...readdirSync(dir).filter((name) => /^(games\.s.*\.jsonl|sessions\.jsonl|config\.json|summary\.json)$/.test(name)).map((name) => `${dir}/${name}`),
    `${root}/frozen-config.json`, `${root}/preregistration.json`, `${root}/terminal.txt`, config.independentOpeningPlan!.file,
    `${root}/opening-registry.json`];
  const inputSha256 = Object.fromEntries(inputFiles.map((file) => [file, fileSha256(file)]));
  const games = effectiveGames(raw);
  expect(saved.config).toEqual(config);
  expect(saved.configHash).toBe(hashOf(config));
  expect(preregistration.configHash).toBe(saved.configHash);
  expect(preregistration.hypotheses).toEqual(DEFAULT_SPRT);
  expect(preregistration.planSha256).toBe(fileSha256(config.independentOpeningPlan!.file));
  expect(games.length).toBe(summary.completed);
  for (const game of raw) {
    expect(game.configHash).toBe(saved.configHash);
    expect(game.opening).toEqual(plan[game.index].opening);
    expect(game.agentSeeds).toEqual(plan[game.index].agentSeeds);
    expect(game.aSeat).toBe(plan[game.index].aSeat);
    expect(game.pair).toBe(plan[game.index].pair);
    expect(game.openingPlanSha256).toBe(preregistration.planSha256);
    const over = game.agents.flatMap((agent) => agent.moves).filter((move) => move.ms > 900).length;
    expect(over).toBe(game.overBudgetMoves);
  }
  const prefix = pairPrefix(raw, 600);
  const result = sequentialTest(prefix.scores, DEFAULT_SPRT);
  const terminal = result.status === 'continue' && prefix.nextPair === 600 ? { ...result, status: 'inconclusive' } : result;
  expect(terminal.status).not.toBe('continue');
  expect(terminal).toEqual(summary.sprt);
  expect(readFileSync(`${root}/terminal.txt`, 'utf8').replace(/^\uFEFF/, '').trim()).toBe(terminal.status);
  const sessions = readFileSync(`${dir}/sessions.jsonl`, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  const measured = execFileSync('git', ['rev-parse', 'd53d052'], { encoding: 'utf8' }).trim();
  expect(sessions.every((session) => session.provenance.git.commit === measured && !session.provenance.git.srcDirty)).toBe(true);
  // The preregistration commit contains no change to AI/search/evaluation or engine code.
  expect(execFileSync('git', ['diff', '--name-only', '9c2d530', measured, '--', 'src/ai', 'src/engine'], { encoding: 'utf8' }).trim()).toBe('');
  const power = (records: typeof games) => Object.fromEntries([...new Set(records.map((game) => game.power ?? 'missing'))].map((value) => [value, records.filter((game) => (game.power ?? 'missing') === value).length]));
  const validUsed = games.filter((game) => game.pair < prefix.nextPair && !isSuspect(game) && ['a-win', 'b-win'].includes(game.outcome));
  expect(validUsed.every((game) => game.power === 'ac')).toBe(true);
  const runningScores: number[] = [];
  const pairRows = [...new Set(games.map((game) => game.pair))].sort((a, b) => a - b).map((pair) => {
    const records = games.filter((game) => game.pair === pair);
    const status = records.length < 2 ? 'incomplete' : records.some(isSuspect) ? 'excluded-suspect' : records.some((game) => !['a-win', 'b-win'].includes(game.outcome)) ? 'excluded-halt' : 'valid';
    const score = status === 'valid' ? records.filter((game) => game.outcome === 'a-win').length / 2 : null;
    if (pair < prefix.nextPair && score !== null) runningScores.push(score);
    return { pair, aFirst: records.find((game) => game.aSeat === 0)?.outcome ?? '', aSecond: records.find((game) => game.aSeat === 1)?.outcome ?? '', status, score,
      usedInDecision: pair < prefix.nextPair && score !== null && runningScores.length <= terminal.pairs,
      prefixValidPairs: runningScores.length, prefixLlr: llrTrinomial(countPairs(runningScores), DEFAULT_SPRT.elo0, DEFAULT_SPRT.elo1) };
  });
  expect(pairRows.filter((pair) => pair.usedInDecision)).toHaveLength(terminal.pairs);
  const decisionWins = terminal.counts.split + 2 * terminal.counts.ww;
  const audit = {
    measuredCommit: measured, configHash: saved.configHash, planSha256: preregistration.planSha256,
    result: terminal, prefix, rawRecords: raw.length, effectiveGames: games.length,
    rawPower: power(raw), finalPower: power(games),
    retries: raw.filter((game) => (game.attempt ?? 1) > 1).map((game) => ({ index: game.index, attempt: game.attempt, power: game.power, outcome: game.outcome })),
    suspectAttempts: raw.filter(isSuspect).map((game) => ({ index: game.index, attempt: game.attempt, power: game.power, outcome: game.outcome, overBudgetMoves: game.overBudgetMoves })),
    decisionGames: terminal.pairs * 2, decisionWins, decisionLosses: terminal.pairs * 2 - decisionWins,
    originalDecisionPairIndex: pairRows.filter((pair) => pair.usedInDecision).at(-1)?.pair,
    inputSha256,
    decisions: 'Only one new confirmation was run. Old C was neither resumed nor pooled. The first bound crossing is preserved; no new seed or second test follows H0/inconclusive.',
    existingSummary: { halted: summary.summary.halted, agents: summary.summary.agents, pairScore: summary.summary.aPairScore, winRate: summary.summary.aWinRate, cpuBusy: summary.cpuBusy },
  };
  for (const [file, sha] of Object.entries(inputSha256)) expect(fileSha256(file)).toBe(sha);
  writeFileSync(`${root}/pair-scores.csv`, 'pair,aFirst,aSecond,status,score,usedInDecision,prefixValidPairs,prefixLlr\n' + pairRows.map((pair) => [pair.pair,pair.aFirst,pair.aSecond,pair.status,pair.score ?? '',pair.usedInDecision,pair.prefixValidPairs,pair.prefixLlr].join(',')).join('\n') + '\n');
  writeFileSync(`${root}/final-audit.json`, JSON.stringify(audit, null, 2) + '\n');
  console.log(JSON.stringify({ result: terminal, rawRecords: raw.length, effectiveGames: games.length, power: power(games) }));
}, 120_000);
