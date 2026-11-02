/*
 * Browser end-to-end test of the game modes (real clicks in headless Chromium): every variant is
 * started from the new-game panel, played to a win, undone / restarted / exported / imported
 * (with the overwrite confirmation), plus regression checks for the basic modes and layouts at
 * phone, tablet and small-desktop widths.
 *
 * Run (dev server on :5199 serves the app and the engine modules the test mirrors the game with):
 *   npm i --no-save playwright-core
 *   npx vite --port 5199 &
 *   node e2e/variants.e2e.mjs
 * Against a deployed site, serve the mirror modules from a local dev server of the SAME commit:
 *   BASE=https://oyueo-mm.github.io/QuoridorAI/ MIRROR_FROM=http://localhost:5199 node e2e/variants.e2e.mjs
 * Env: BASE, OUT (screenshot / download folder), CHROME (browser executable), MIRROR_FROM.
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { createDiagnostics } from './diagnostics.mjs';

const BASE = process.env.BASE || 'http://localhost:5199/QuoridorAI/';
const OUT = path.resolve(process.env.OUT || './shots');
fs.mkdirSync(OUT, { recursive: true });
// Failure screenshots, browser console / request errors and a JSON report (see diagnostics.mjs).
const diag = createDiagnostics({ name: 'variants', out: OUT, base: BASE });
const ORIGIN = new URL(BASE).origin;
const SRC = process.env.SRC_PREFIX ?? '/QuoridorAI/src'; // only valid against the dev server

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(process.env.LOCALAPPDATA || `${process.env.HOME}/.cache`, 'ms-playwright');
  const dirs = fs.readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse();
  for (const d of dirs) for (const rel of ['chrome-win64/chrome.exe', 'chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
    const p = path.join(root, d, rel);
    if (fs.existsSync(p)) return p;
  }
  throw new Error('No Chromium found: set CHROME');
}
const exe = findChrome();
const browser = await chromium.launch({ executablePath: exe, headless: true });

const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok });
  if (!ok) diag.failure(name, extra);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
};

const CELL = 56, GAP = 12, PITCH = CELL + GAP, PAD = 28, BOARD_PX = 9 * CELL + 8 * GAP, VIEW_PX = BOARD_PX + 2 * PAD;

async function newPage(viewport = { width: 1440, height: 1000 }) {
  const ctx = await browser.newContext({ viewport, acceptDownloads: true });
  if (process.env.MIRROR_FROM) {
    // The deployed site ships no TypeScript sources; fetch them from a dev server of the same commit.
    await ctx.route('**/QuoridorAI/src/**', async (route) => {
      const url = new URL(route.request().url());
      const res = await fetch(process.env.MIRROR_FROM + url.pathname);
      await route.fulfill({ status: res.status, contentType: 'text/javascript', body: await res.text() });
    });
  }
  const page = await ctx.newPage();
  diag.attach(page);
  page.on('pageerror', (e) => check('no page error', false, String(e)));
  page.on('console', (m) => { if (m.type() === 'error') console.log('console.error:', m.text()); });
  return { ctx, page };
}

const multiMain = (page) => page.locator('main[data-view="multi"]');
const boardSvg = (page) => multiMain(page).locator('svg[aria-label="쿼리도 보드"]');

async function openSetup(page) {
  await page.goto(BASE + '#/play');
  await page.waitForSelector('main:visible');
  // the play view's "모드 변경" opens the mode browser (the game behind it stays untouched)
  await page.locator('[data-open-mode-browser]:visible').first().click();
  await page.waitForSelector('main[data-view="mode-browser"]');
}

const BASIC_MODES = ['vs-ai', 'local-2p', 'four-player'];
async function pickMode(page, mode) {
  // the mode browser lists 기본 대전 and 변형 대전 on separate tabs
  await page.locator('main[data-view="mode-browser"] [role=tab]', { hasText: BASIC_MODES.includes(mode) ? '기본 대전' : '변형 대전' }).click();
  await page.locator(`[data-mode="${mode}"][role=radio]:visible`).first().click();
}

/** Starts the selected mode; answers the "end the running game?" confirmation when it appears. */
async function confirmIfAsked(page) {
  const ok = page.locator('[data-confirm-ok]');
  if (await ok.count()) await ok.click();
}

async function startGame(page) {
  await page.locator('[data-start-game]:visible').first().click();
  await confirmIfAsked(page);
  await page.waitForSelector('main[data-view="multi"]:visible');
}

async function logCount(page) {
  const t = await multiMain(page).locator('[role=tab]', { hasText: '기보' }).first().innerText();
  return Number(t.replace(/\D/g, '')) || 0;
}

/** Installs a mirror of the running game inside the page (same rules as the app, built from the same config). */
async function installMirror(page, config) {
  await page.evaluate(async ({ config, SRC }) => {
    const eng = await import(`${SRC}/engine/index.ts`);
    const mc = await import(`${SRC}/session/MultiController.ts`);
    const rec = await import(`${SRC}/match/multiRecord.ts`);
    const setup = mc.buildMultiSetup(config);
    window.__M = { eng, setup, state: rec.initialMultiState(setup), turn: 0 };
  }, { config, SRC });
}

async function pickAction(page, wallEvery) {
  return page.evaluate((wallEvery) => {
    const { eng, state, turn } = window.__M;
    const me = state.currentPlayer;
    const scored = eng.legalPawnMovesMulti(state).map((to) => ({ to, d: eng.goalDistanceMulti({ ...state, pawns: state.pawns.map((p, i) => (i === me ? to : p)) }, me) }));
    scored.sort((a, b) => a.d - b.d);
    if (wallEvery && turn % wallEvery === wallEvery - 1 && state.wallsRemaining[me] > 0) {
      const walls = eng.legalWallPlacementsMulti(state);
      if (walls.length) return walls[(turn * 13) % walls.length];
    }
    return { type: 'move', to: scored[0].to };
  }, wallEvery);
}

async function screenPoint(page, bx, by) {
  const box = await boardSvg(page).boundingBox();
  const k = box.width / VIEW_PX;
  return { x: box.x + (PAD + bx) * k, y: box.y + (PAD + by) * k };
}

async function clickAction(page, a) {
  let bx, by;
  if (a.type === 'move') {
    bx = a.to.col * PITCH + CELL / 2;
    by = a.to.row * PITCH + CELL / 2;
  } else {
    const cx = (a.col + 1) * PITCH - GAP / 2;
    const cy = (a.row + 1) * PITCH - GAP / 2;
    bx = a.orientation === 'h' ? cx + 14 : cx;
    by = a.orientation === 'h' ? cy : cy + 14;
  }
  const p = await screenPoint(page, bx, by);
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y);
}

async function mirrorApply(page, a) {
  return page.evaluate((a) => {
    const M = window.__M;
    M.state = M.eng.applyActionMulti(M.state, a);
    M.turn++;
    return { winner: M.state.winner, turn: M.turn };
  }, a);
}

/** Plays until somebody wins (mirror decides the moves, the UI must accept every one of them). */
async function playOut(page, { wallEvery = 4, maxTurns = 500 } = {}) {
  let winner = null;
  for (let i = 0; i < maxTurns && winner === null; i++) {
    const before = await logCount(page);
    const a = await pickAction(page, wallEvery);
    await clickAction(page, a);
    try {
      await page.waitForFunction(
        (n) => {
          const el = [...document.querySelectorAll('main[data-view="multi"] [role=tab]')].find((t) => t.textContent.includes('기보'));
          return Number((el?.textContent ?? '').replace(/\D/g, '')) > n;
        },
        before,
        { timeout: 3000 },
      );
    } catch {
      check(`UI accepted ${JSON.stringify(a)} at ply ${i}`, false);
      return null;
    }
    ({ winner } = await mirrorApply(page, a));
  }
  return winner;
}

async function statusText(page) {
  return (await multiMain(page).locator('[data-status-side]:visible, [data-status]:visible').first().innerText()).replace(/\s+/g, ' ').trim();
}

async function mirrorMatchesBoard(page) {
  // pawns drawn on the board must sit where the mirror says (checked through cell centres)
  const box = await boardSvg(page).boundingBox();
  const k = box.width / VIEW_PX;
  const pawns = await page.evaluate(() => window.__M.state.pawns);
  for (let seat = 0; seat < pawns.length; seat++) {
    const c = await boardSvg(page).locator(`[data-pawn="${seat}"] circle[stroke="#f6f0e6"]`).first().boundingBox().catch(() => null);
    if (!c) return false;
    const cx = (c.x + c.width / 2 - box.x) / k - PAD;
    const cy = (c.y + c.height / 2 - box.y) / k - PAD;
    const col = Math.floor(cx / PITCH), row = Math.floor(cy / PITCH);
    if (col !== pawns[seat].col || row !== pawns[seat].row) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------------------------
const MODES = [
  { id: 'race-2', title: '동방향 2인 경주', config: { mode: 'race-2', names: [], firstPlayer: 0, walls: 10 }, players: 2, wallEvery: 4 },
  { id: 'race-4', title: '동방향 4인 경주', config: { mode: 'race-4', names: [], firstPlayer: 0, walls: 5 }, players: 4, wallEvery: 5 },
  { id: 'three-player', title: '3인 개인전', config: { mode: 'three-player', names: [], firstPlayer: 0, walls: 5 }, players: 3, wallEvery: 4 },
  { id: 'team-2v2', title: '2 vs 2 팀전', config: { mode: 'team-2v2', names: [], firstPlayer: 0, walls: 5 }, players: 4, wallEvery: 5 },
];

for (const m of MODES) {
  console.log(`\n=== ${m.title} ===`);
  const { ctx, page } = await newPage();
  await openSetup(page);
  await pickMode(page, m.id);
  await page.screenshot({ path: `${OUT}/${m.id}-setup.png` });
  await startGame(page);
  check(`${m.id}: game view shows the mode`, (await multiMain(page).getAttribute('data-mode')) === m.id);
  check(`${m.id}: ${m.players} player cards`, (await multiMain(page).locator('[data-player-card]:visible').count()) === m.players);
  await installMirror(page, m.config);
  check(`${m.id}: start position matches the rules`, await mirrorMatchesBoard(page));
  check(`${m.id}: goal bars drawn per seat`, (await boardSvg(page).locator('[data-goal]').count()) === m.players);
  check(`${m.id}: start rings drawn`, (await boardSvg(page).locator('[data-start]').count()) === m.players);
  if (m.id === 'team-2v2') check('team-2v2: team badges on pawns and cards', (await boardSvg(page).locator('[data-team-badge]').count()) === 4 && (await multiMain(page).locator('[data-team]:visible').count()) >= 4);

  // an illegal click changes nothing
  const p0 = await screenPoint(page, 0 * PITCH + CELL / 2, 0 * PITCH + CELL / 2);
  await page.mouse.click(p0.x, p0.y);
  check(`${m.id}: illegal click ignored`, (await logCount(page)) === 0);

  // a few moves, undo, then show paths and take a screenshot
  for (let i = 0; i < 6; i++) {
    const a = await pickAction(page, m.wallEvery);
    await clickAction(page, a);
    await mirrorApply(page, a);
  }
  check(`${m.id}: moves recorded`, (await logCount(page)) === 6);
  await multiMain(page).getByRole('button', { name: /최단 경로/ }).click();
  check(`${m.id}: shortest paths for every player`, (await boardSvg(page).locator('[data-path]').count()) === m.players);
  await page.screenshot({ path: `${OUT}/${m.id}-midgame.png` });
  await multiMain(page).getByRole('button', { name: /무르기/ }).click();
  await page.evaluate(() => { const M = window.__M; /* rebuild the mirror without the last action */ });
  check(`${m.id}: undo takes back one move`, (await logCount(page)) === 5);
  // rebuild mirror from scratch to the same 5 plies by replaying the recorded actions
  await page.evaluate(async () => {
    const M = window.__M;
    const hist = M.hist ?? null;
    void hist;
  });
  await installMirror(page, m.config);
  // replay the 5 remaining plies in the mirror by re-deriving them from the app's record (JSON export)
  const dl1 = page.waitForEvent('download');
  await multiMain(page).getByRole('button', { name: 'JSON', exact: true }).click();
  const file = JSON.parse(fs.readFileSync(await (await dl1).path(), 'utf8'));
  check(`${m.id}: export carries mode ${m.id}, version ${m.id === 'four-player' ? 2 : 3}`, file.mode === m.id && file.version === 3 && file.moves.length === 5);
  fs.writeFileSync(`${OUT}/${m.id}-5plies.json`, JSON.stringify(file, null, 2));
  // restart the mirror to the exported 5 plies
  await page.evaluate(async (notations) => {
    const M = window.__M;
    for (const n of notations) {
      const a = M.eng.legalActionsMulti(M.state).find((x) => M.eng.formatAction(x) === n);
      M.state = M.eng.applyActionMulti(M.state, a);
      M.turn++;
    }
  }, file.moves.map((x) => x.notation));

  const winner = await playOut(page, { wallEvery: m.wallEvery });
  check(`${m.id}: played to a win`, winner !== null);
  const st = await statusText(page);
  console.log('   status:', st);
  check(`${m.id}: win announced`, /승리/.test(st));
  if (m.id === 'team-2v2') check('team-2v2: team win text', /팀 승리/.test(st));
  const wins = await boardSvg(page).locator('[data-win-ring]').count();
  check(`${m.id}: winner highlighted on the board (${wins} ring${wins === 1 ? '' : 's'})`, wins === (m.id === 'team-2v2' ? 2 : 1));
  check(`${m.id}: pawns on the board match the mirror at the end`, await mirrorMatchesBoard(page));
  await page.screenshot({ path: `${OUT}/${m.id}-win.png` });

  // export the finished game, restart, then import it back mid-game (cancel keeps; confirm replaces)
  const dl2 = page.waitForEvent('download');
  await multiMain(page).getByRole('button', { name: 'JSON', exact: true }).click();
  const finished = JSON.parse(fs.readFileSync(await (await dl2).path(), 'utf8'));
  check(`${m.id}: finished export has result win`, finished.result.kind === 'win' && finished.final.winner === winner);
  const finishedPath = `${OUT}/${m.id}-finished.json`;
  fs.writeFileSync(finishedPath, JSON.stringify(finished));
  const total = finished.moves.length;

  await multiMain(page).getByRole('button', { name: /재시작|정말/ }).first().click();
  if (await multiMain(page).getByRole('button', { name: '정말 처음부터?' }).count()) await multiMain(page).getByRole('button', { name: '정말 처음부터?' }).click();
  check(`${m.id}: restart clears the record`, (await logCount(page)) === 0);
  // play 2 plies so a game is "in progress"
  await installMirror(page, m.config);
  for (let i = 0; i < 2; i++) { const a = await pickAction(page, 0); await clickAction(page, a); await mirrorApply(page, a); }
  const importInput = multiMain(page).locator('input[type=file]');
  await importInput.setInputFiles(finishedPath);
  await page.waitForSelector('[data-confirm-dialog]');
  await page.screenshot({ path: `${OUT}/${m.id}-import-confirm.png` });
  await page.locator('[data-confirm-cancel]').click();
  check(`${m.id}: cancelling the import keeps the running game`, (await logCount(page)) === 2 && (await page.locator('[data-confirm-dialog]').count()) === 0);
  await importInput.setInputFiles(finishedPath);
  await page.waitForSelector('[data-confirm-dialog]');
  await page.locator('[data-confirm-ok]').click();
  await page.waitForFunction((n) => [...document.querySelectorAll('main[data-view="multi"] [role=tab]')].some((t) => t.textContent.includes('기보') && Number(t.textContent.replace(/\D/g, '')) === n), total);
  check(`${m.id}: import restores all ${total} moves`, (await logCount(page)) === total);
  check(`${m.id}: imported game is shown as won`, /승리/.test(await statusText(page)));
  const imported = await (async () => {
    const dl = page.waitForEvent('download');
    await multiMain(page).getByRole('button', { name: 'JSON', exact: true }).click();
    return JSON.parse(fs.readFileSync(await (await dl).path(), 'utf8'));
  })();
  check(`${m.id}: export → import → export keeps rules and moves`, JSON.stringify(imported.rules) === JSON.stringify(finished.rules) && JSON.stringify(imported.moves) === JSON.stringify(finished.moves) && JSON.stringify(imported.wallsPerPlayer) === JSON.stringify(finished.wallsPerPlayer));

  // replay controls
  await multiMain(page).getByRole('button', { name: '⏮' }).click();
  check(`${m.id}: replay jumps to the start`, /기보 보기 — 0수/.test(await multiMain(page).innerText()) || /선택: 0수/.test(await multiMain(page).innerText()));
  await multiMain(page).getByRole('button', { name: '▶', exact: true }).click();
  check(`${m.id}: replay steps forward`, /선택: 1수/.test(await multiMain(page).innerText()));
  await ctx.close();
}

// ============================================================================ asymmetric
console.log('\n=== 비대칭 대전 ===');
{
  const { ctx, page } = await newPage();
  await openSetup(page);
  await pickMode(page, 'asymmetric');
  check('asym: two player editors by default', (await page.locator('[data-asym-player]:visible').count()) === 2);
  await page.locator('input[aria-label="P1 벽 개수"]').fill('6');
  await page.locator('input[aria-label="P2 벽 개수"]').fill('3');
  // duplicate start -> error, start disabled
  await page.locator('select[aria-label="P2 시작 행"]').selectOption('8');
  check('asym: duplicate start is reported', (await page.locator('[data-setup-errors]').innerText()).includes('시작 위치가 같습니다'));
  check('asym: start button disabled while invalid', await page.locator('[data-start-game]:visible').first().isDisabled());
  // goal == start line
  await page.locator('select[aria-label="P2 시작 행"]').selectOption('1');
  await page.locator('select[aria-label="P2 시작 열"]').selectOption('2');
  await page.locator('select[aria-label="P1 목표선"]').selectOption('row8');
  check('asym: pawn already on its goal line is reported', (await page.locator('[data-setup-errors]').innerText()).includes('이미 목표선'));
  await page.locator('select[aria-label="P1 목표선"]').selectOption('row0');
  await page.locator('input[aria-label="P2 벽 개수"]').fill('25');
  check('asym: wall count above 20 is reported', (await page.locator('[data-setup-errors]').innerText()).includes('벽 개수'));
  await page.locator('input[aria-label="P2 벽 개수"]').fill('3');
  check('asym: no errors left', (await page.locator('[data-setup-errors]').count()) === 0);
  await page.screenshot({ path: `${OUT}/asymmetric-setup.png`, fullPage: true });
  await startGame(page);
  const cfg = {
    mode: 'asymmetric', names: [], firstPlayer: 0,
    asymmetric: [
      { start: { row: 8, col: 4 }, goal: { axis: 'row', index: 0 }, walls: 6 },
      { start: { row: 1, col: 2 }, goal: { axis: 'row', index: 8 }, walls: 3 },
    ],
  };
  await installMirror(page, cfg);
  check('asym: start positions follow the settings', await mirrorMatchesBoard(page));
  const cards = await multiMain(page).locator('[data-player-card]:visible').allInnerTexts();
  const flat = cards.map((c) => c.replace(/\s+/g, ' '));
  check('asym: cards show 6 and 3 walls', /벽 6/.test(flat[0]) && /벽 3/.test(flat[1]), flat.join(' | '));
  await page.screenshot({ path: `${OUT}/asymmetric-start.png` });
  const winner = await playOut(page, { wallEvery: 3 });
  check('asym: played to a win', winner !== null);
  const walls = await page.evaluate(() => window.__M.state.wallsRemaining);
  check('asym: wall counts only went down from their own start', walls[0] <= 6 && walls[1] <= 3 && walls[1] >= 0, JSON.stringify(walls));
  const dl = page.waitForEvent('download');
  await multiMain(page).getByRole('button', { name: 'JSON', exact: true }).click();
  const f = JSON.parse(fs.readFileSync(await (await dl).path(), 'utf8'));
  check('asym: record keeps walls, starts, goals', JSON.stringify(f.wallsPerPlayer) === '[6,3]' && JSON.stringify(f.rules.players.map((p) => p.start)) === '[[8,4],[1,2]]' && f.mode === 'asymmetric' && f.version === 3);
  await multiMain(page).getByRole('button', { name: /재시작/ }).first().click();
  await multiMain(page).getByRole('button', { name: '정말 처음부터?' }).click();
  check('asym: restart keeps the settings', (await logCount(page)) === 0 && /벽 6/.test((await multiMain(page).locator('[data-player-card]:visible').first().innerText()).replace(/\s+/g, ' ')));
  await ctx.close();
}

// ============================================================================ obstacle
console.log('\n=== 장애물 경주 ===');
{
  const { ctx, page } = await newPage();
  await openSetup(page);
  await pickMode(page, 'obstacle');
  await page.locator('[aria-label="참가자 수"]:visible').getByRole('radio', { name: '3인' }).click();
  await page.locator('[data-preset="hard"]').click();
  await page.locator('input[aria-label="장애물 시드"]:visible').fill('12345');
  await page.screenshot({ path: `${OUT}/obstacle-setup.png`, fullPage: true });
  await startGame(page);
  const keysOf = async () => (await boardSvg(page).locator('[data-wall-kind="obstacle"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-wall')))).sort();
  const map1 = await keysOf();
  check(`obstacle: neutral walls drawn in their own style (${map1.length})`, map1.length >= 8);
  check('obstacle: legend counts them', (await multiMain(page).locator('[data-obstacle-legend]:visible').innerText()).includes(`${map1.length}`));
  check('obstacle: three players', (await multiMain(page).locator('[data-player-card]:visible').count()) === 3);
  await page.screenshot({ path: `${OUT}/obstacle-start.png` });
  await multiMain(page).locator('[role=tab]', { hasText: '규칙' }).click();
  const info = await multiMain(page).locator('[data-obstacle-info]').innerText();
  check('obstacle: rules tab shows preset and seed', info.includes('어려움') && info.includes('12345'), info.replace(/\s+/g, ' '));
  await multiMain(page).locator('[role=tab]', { hasText: '기보' }).click();
  // same seed again = same map; other seed = other map
  await page.locator('[data-open-mode-browser]:visible').first().click();
  await pickMode(page, 'obstacle');
  const seedBox = page.locator('input[aria-label="장애물 시드"]:visible');
  check('obstacle: setup remembers the running configuration', (await seedBox.inputValue()) === '12345');
  await page.locator('[data-start-game]:visible').first().click();
  await confirmIfAsked(page);
  check('obstacle: same seed → same map', JSON.stringify(await keysOf()) === JSON.stringify(map1));
  await page.locator('[data-open-mode-browser]:visible').first().click();
  await page.locator('input[aria-label="장애물 시드"]:visible').fill('777');
  await page.locator('[data-start-game]:visible').first().click();
  await confirmIfAsked(page);
  check('obstacle: other seed → other map', JSON.stringify(await keysOf()) !== JSON.stringify(map1));
  await page.locator('[data-open-mode-browser]:visible').first().click();
  await page.locator('input[aria-label="장애물 시드"]:visible').fill('12345');
  await page.locator('[data-start-game]:visible').first().click();
  await confirmIfAsked(page);
  check('obstacle: seed back → map back', JSON.stringify(await keysOf()) === JSON.stringify(map1));

  await installMirror(page, { mode: 'obstacle', names: [], firstPlayer: 0, walls: 5, obstacle: { players: 3, preset: 'hard', seed: 12345 } });
  check('obstacle: pawns at their starts', await mirrorMatchesBoard(page));
  const winner = await playOut(page, { wallEvery: 4 });
  check('obstacle: played to a win', winner !== null);
  check('obstacle: neutral walls unchanged after the game', JSON.stringify(await keysOf()) === JSON.stringify(map1));
  const placed = await boardSvg(page).locator('[data-wall-kind^="p"]').count();
  console.log('   player walls placed:', placed);
  check('obstacle: player walls drawn separately from neutral ones', placed > 0);
  await page.screenshot({ path: `${OUT}/obstacle-win.png` });
  const dl = page.waitForEvent('download');
  await multiMain(page).getByRole('button', { name: 'JSON', exact: true }).click();
  const f = JSON.parse(fs.readFileSync(await (await dl).path(), 'utf8'));
  check('obstacle: record has neutral walls, seed and preset', f.rules.neutralWalls.length === map1.length && f.rules.seed === 12345 && f.rules.preset === 'hard');
  fs.writeFileSync(`${OUT}/obstacle-finished.json`, JSON.stringify(f));
  await ctx.close();

  // a fresh browser: the record alone restores the map
  const b = await newPage();
  await b.page.goto(BASE + '#/play');
  await b.page.waitForSelector('main:visible');
  await b.page.locator('[data-open-mode-browser]:visible').first().click();
  await pickMode(b.page, 'four-player');
  await startGame(b.page);
  await b.page.locator('main[data-view="multi"] input[type=file]').setInputFiles(`${OUT}/obstacle-finished.json`);
  await b.page.waitForFunction(() => document.querySelector('main[data-view="multi"]')?.getAttribute('data-mode') === 'obstacle');
  const keysB = (await boardSvg(b.page).locator('[data-wall-kind="obstacle"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-wall')))).sort();
  check('obstacle: import into a fresh game restores mode and map (empty game, no confirmation)', JSON.stringify(keysB) === JSON.stringify(map1));
  check('obstacle: imported game is a finished game', /승리/.test(await statusText(b.page)));
  await b.ctx.close();
}

// ============================================================================ invalid imports
console.log('\n=== 잘못된 기보 ===');
{
  const { ctx, page } = await newPage();
  await openSetup(page);
  await pickMode(page, 'team-2v2');
  await startGame(page);
  await installMirror(page, { mode: 'team-2v2', names: [], firstPlayer: 0, walls: 5 });
  for (let i = 0; i < 3; i++) { const a = await pickAction(page, 0); await clickAction(page, a); await mirrorApply(page, a); }
  const good = JSON.parse(fs.readFileSync(`${OUT}/team-2v2-finished.json`, 'utf8'));
  const bad = structuredClone(good);
  bad.moves[3].notation = 'a1';
  fs.writeFileSync(`${OUT}/bad.json`, JSON.stringify(bad));
  await multiMain(page).locator('input[type=file]').setInputFiles(`${OUT}/bad.json`);
  await page.waitForTimeout(300);
  check('invalid record: no dialog, game untouched, reason shown', (await page.locator('[data-confirm-dialog]').count()) === 0 && (await logCount(page)) === 3 && /가져오기 실패/.test(await multiMain(page).innerText()));
  fs.writeFileSync(`${OUT}/garbage.json`, '{ nope');
  await multiMain(page).locator('input[type=file]').setInputFiles(`${OUT}/garbage.json`);
  await page.waitForTimeout(300);
  check('garbage file: game untouched', (await logCount(page)) === 3);
  fs.writeFileSync(`${OUT}/v1.json`, JSON.stringify({ format: good.format, version: 1, start: 'standard', moves: [{ ply: 1, player: 0, notation: 'e2' }], ply: 1 }));
  await multiMain(page).locator('input[type=file]').setInputFiles(`${OUT}/v1.json`);
  await page.waitForTimeout(300);
  check('v1 record: refused with a reason, game untouched', (await logCount(page)) === 3 && /2인전/.test(await multiMain(page).innerText()));
  await ctx.close();
}

// ============================================================================ regression: official modes
console.log('\n=== 기존 모드 회귀 ===');
{
  const { ctx, page } = await newPage();
  await page.goto(BASE);
  await page.waitForSelector('main:visible');
  check('home: three official mode cards + one variants card', (await page.locator('[data-home-mode]').count()) === 3 && (await page.locator('[data-home-variants]').count()) === 1);
  await page.screenshot({ path: `${OUT}/home.png`, fullPage: true });
  await page.locator('[data-home-variants]').click();
  await page.waitForSelector('[data-mode="race-2"][aria-checked="true"]');
  check('home → variants opens the mode browser with a variant selected', true);
  await page.screenshot({ path: `${OUT}/variants-picker.png` });
  await page.goto(BASE);
  await page.locator('[data-home-mode="four-player"]').click();
  await page.waitForSelector('main[data-view="mode-browser"]'); // the shortcut previews the mode first
  await startGame(page);
  check('home → 정규 4인전', (await multiMain(page).getAttribute('data-mode')) === 'four-player');
  await installMirror(page, { mode: 'four-player', names: [], firstPlayer: 0 });
  for (let i = 0; i < 4; i++) { const a = await pickAction(page, 0); await clickAction(page, a); await mirrorApply(page, a); }
  const dl = page.waitForEvent('download');
  await multiMain(page).getByRole('button', { name: 'JSON', exact: true }).click();
  const f = JSON.parse(fs.readFileSync(await (await dl).path(), 'utf8'));
  check('four-player: still exports version 2', f.version === 2 && f.mode === 'four-player' && f.moves.length === 4 && !f.rules.teams);
  await ctx.close();
}
{
  const { ctx, page } = await newPage();
  await page.goto(BASE);
  await page.locator('[data-home-mode="local-2p"]').click();
  await page.waitForSelector('main[data-view="mode-browser"]');
  await page.locator('[data-start-game]:visible').first().click();
  await page.waitForSelector('main:not([data-view="mode-browser"]) svg[aria-label="쿼리도 보드"]:visible');
  const svg = page.locator('svg[aria-label="쿼리도 보드"]:visible').first();
  const click = async (row, col) => {
    const box = await svg.boundingBox();
    const k = box.width / VIEW_PX;
    await page.mouse.click(box.x + (PAD + col * PITCH + CELL / 2) * k, box.y + (PAD + row * PITCH + CELL / 2) * k);
  };
  const moveBadge = async () => Number((await page.locator('[role=tab]:visible', { hasText: '기보' }).first().innerText()).replace(/\D/g, '')) || 0;
  const before = await moveBadge();
  await click(7, 4);
  await page.waitForTimeout(200);
  const afterOne = await moveBadge();
  check('사람 vs 사람: P1 moves', afterOne === before + 1, `${before}→${afterOne}`);
  await ctx.close();
}
{
  const { ctx, page } = await newPage();
  await page.goto(BASE);
  await page.locator('[data-home-mode="vs-ai"]').click();
  await page.waitForSelector('svg[aria-label="쿼리도 보드"]:visible');
  const svg = page.locator('svg[aria-label="쿼리도 보드"]:visible').first();
  const box = await svg.boundingBox();
  const k = box.width / VIEW_PX;
  await page.mouse.click(box.x + (PAD + 4 * PITCH + CELL / 2) * k, box.y + (PAD + 7 * PITCH + CELL / 2) * k);
  await page.waitForFunction(() => [...document.querySelectorAll('[role=tab]')].some((t) => t.offsetParent && t.textContent.includes('기보') && Number(t.textContent.replace(/\D/g, '')) >= 2), null, { timeout: 20000 }).catch(() => {});
  const n = Number((await page.locator('[role=tab]:visible', { hasText: '기보' }).first().innerText()).replace(/\D/g, '')) || 0;
  check('사람 vs AI: the AI answers the first move', n >= 2, `${n} moves`);
  await ctx.close();
}

// ============================================================================ layouts
console.log('\n=== 레이아웃 (데스크톱·모바일) ===');
for (const [label, viewport] of [['mobile', { width: 390, height: 844 }], ['tablet', { width: 820, height: 1100 }], ['desktop-small', { width: 1100, height: 800 }]]) {
  for (const id of ['race-2', 'race-4', 'three-player', 'team-2v2', 'asymmetric', 'obstacle']) {
    const { ctx, page } = await newPage(viewport);
    await openSetup(page);
    await pickMode(page, id);
    const overflowSetup = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (label === 'mobile') await page.screenshot({ path: `${OUT}/m-${id}-setup.png`, fullPage: true });
    await startGame(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(`${label}/${id}: no horizontal overflow (setup ${overflowSetup}px, game ${overflow}px)`, overflow <= 1 && overflowSetup <= 1);
    const box = await boardSvg(page).boundingBox();
    check(`${label}/${id}: board usable (${Math.round(box.width)}px)`, box.width >= (label === 'mobile' ? 300 : 320));
    if (label === 'mobile') await page.screenshot({ path: `${OUT}/m-${id}-game.png`, fullPage: true });
    if (label === 'desktop-small' && id === 'obstacle') await page.screenshot({ path: `${OUT}/ds-${id}.png` });
    await ctx.close();
  }
}

const failed = results.filter((r) => !r.ok);
await diag.finish({ browserVersion: browser.version(), checks: { total: results.length, failed: failed.length } });
await browser.close();
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
