/*
 * Browser end-to-end test of the multi-player AIs (real clicks in headless Chromium): people and AIs
 * are seated per player in the mode browser, then every playable mode is run with a mix of seats —
 * person + AIs taking turns, AI-only games with pause / one step / resume, restart and undo while an
 * AI is thinking, the analysis tab and its board preview, the record with AI seats, and the mode
 * browser at phone width (the sticky start button must not cover the last setting).
 *
 * Run (the dev server serves the app; copy this folder's *.mjs next to a playwright-core install):
 *   npm i --no-save playwright-core
 *   npx vite --port 5199 &
 *   node e2e/multi-ai.e2e.mjs
 * Env: BASE (default http://localhost:5199/QuoridorAI/; use http://[::1]:… if localhost does not
 * resolve for the browser), OUT (screenshots, report), CHROME (browser executable).
 * Failures leave screenshots, console / request errors and e2e-report-multi-ai.json in OUT.
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { createDiagnostics } from './diagnostics.mjs';

const BASE = process.env.BASE || 'http://localhost:5199/QuoridorAI/';
const OUT = path.resolve(process.env.OUT || './shots');
fs.mkdirSync(OUT, { recursive: true });
const diag = createDiagnostics({ name: 'multi-ai', out: OUT, base: BASE });

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(process.env.LOCALAPPDATA || `${process.env.HOME}/.cache`, 'ms-playwright');
  const dirs = fs.readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse();
  for (const d of dirs) for (const rel of ['chrome-win64/chrome.exe', 'chrome-win/chrome.exe', 'chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
    const p = path.join(root, d, rel);
    if (fs.existsSync(p)) return p;
  }
  throw new Error('No Chromium found: set CHROME');
}
const browser = await chromium.launch({ executablePath: findChrome(), headless: true });

let passed = 0;
let failed = 0;
const check = (name, ok, extra = '') => {
  if (ok) passed++;
  else {
    failed++;
    diag.failure(name, extra);
  }
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
};

const CELL = 56, GAP = 12, PITCH = CELL + GAP, PAD = 28;
const MB = 'main[data-view="mode-browser"]';
const MM = 'main[data-view="multi"]';
const BASIC = ['vs-ai', 'local-2p', 'four-player'];
const boardSvg = (page) => page.locator(`${MM} svg[aria-label="쿼리도 보드"]`);

async function newPage(viewport = { width: 1440, height: 1000 }, label) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  diag.attach(page, label);
  page.on('pageerror', (e) => check('no page error', false, String(e)));
  await page.goto(BASE + '#/play');
  await page.waitForSelector('main:visible');
  return { ctx, page };
}

async function openBrowser(page) {
  await page.locator('[data-open-mode-browser]:visible').first().click();
  await page.waitForSelector(MB);
}

async function pickMode(page, mode) {
  await page.locator(`${MB} [role=tab]`, { hasText: BASIC.includes(mode) ? '기본 대전' : '변형 대전' }).click();
  await page.locator(`[data-mode="${mode}"][role=radio]:visible`).first().click();
}

/** Seats: one entry per slot — 'human' or 'random' | 'greedy' | 'maxn'; AI seats get the easy preset (fast, deterministic enough). */
async function seat(page, kinds, preset = 'easy') {
  for (let slot = 0; slot < kinds.length; slot++) {
    await page.locator(`[data-seat-kind="${slot}"]`).selectOption(kinds[slot]);
    if (kinds[slot] !== 'human' && kinds[slot] !== 'random') await page.locator(`[data-agent-fields="${slot}"] [data-agent-preset="${preset}"]`).click();
  }
}

async function start(page) {
  await page.locator('[data-start-game]:visible').first().click();
  const ok = page.locator('[data-confirm-ok]');
  if (await ok.count()) await ok.click();
  await page.waitForSelector(`${MM}:visible`);
}

/** Opens the browser, picks a mode, seats the players, starts. */
async function startMode(page, mode, kinds, { preset, before } = {}) {
  await openBrowser(page);
  await pickMode(page, mode);
  if (before) await before(page);
  await seat(page, kinds, preset);
  await start(page);
}

const logCount = async (page) => Number((await page.locator(`${MM} [role=tab]`, { hasText: '기보' }).first().innerText()).replace(/\D/g, '')) || 0;
const won = async (page) => (await page.locator(`${MM} [data-status-side="win"]`).count()) > 0;
const turnText = async (page) => (await page.locator(`${MM} [data-status-side]`).first().innerText()).trim();
const cardText = (page, slot) => page.locator(`${MM} [data-player-card="${slot}"]`).first().innerText();
const wallsOf = async (page, slot) => Number(/벽\s*(\d+)/.exec(await cardText(page, slot))?.[1] ?? -1);

async function setSpeed(page, label) {
  await page.locator(`${MM} [role=radiogroup][aria-label="AI 속도"] [role=radio]`, { hasText: label }).click();
}

async function waitFor(page, fn, arg, timeout = 30000) {
  try {
    await page.waitForFunction(fn, arg, { timeout, polling: 100 });
    return true;
  } catch {
    return false;
  }
}

/** Waits until it is `slot`'s turn (P1…) or the game is over. */
const waitTurn = (page, slot, timeout) =>
  waitFor(page, ({ slot, MM }) => {
    const el = document.querySelector(`${MM} [data-status-side]`);
    return !!el && (el.getAttribute('data-status-side') === 'win' || new RegExp(`P${slot} 차례`).test(el.textContent));
  }, { slot, MM }, timeout);

/** Cell (row, col) of a pawn read from the drawn board. */
async function pawnCell(page, seatId) {
  return boardSvg(page).evaluate((svg, { seatId, PAD, CELL, PITCH }) => {
    const g = svg.querySelector(`[data-pawn="${seatId}"]`);
    if (!g) return null;
    // the pawn is the largest circle of its group (team games add a small letter badge)
    const m = [...g.querySelectorAll('circle')].sort((a, b) => +b.getAttribute('r') - +a.getAttribute('r'))[0];
    return { row: Math.round((+m.getAttribute('cy') - PAD - CELL / 2) / PITCH), col: Math.round((+m.getAttribute('cx') - PAD - CELL / 2) / PITCH) };
  }, { seatId, PAD, CELL, PITCH });
}

async function clickCell(page, row, col) {
  const box = await boardSvg(page).boundingBox();
  const k = box.width / (9 * CELL + 8 * GAP + 2 * PAD);
  await page.mouse.click(box.x + (PAD + col * PITCH + CELL / 2) * k, box.y + (PAD + row * PITCH + CELL / 2) * k);
}

/** The person moves their pawn one step toward `goal` ('up' | 'down'); an illegal cell is simply ignored by the UI, so try the likely ones in order. */
async function humanStep(page, seatId, goal) {
  const pos = await pawnCell(page, seatId);
  const f = goal === 'up' ? -1 : 1;
  const tries = [[f, 0], [2 * f, 0], [f, -1], [f, 1], [0, -1], [0, 1], [-f, 0]];
  const before = await logCount(page);
  for (const [dr, dc] of tries) {
    const r = pos.row + dr, c = pos.col + dc;
    if (r < 0 || r > 8 || c < 0 || c > 8) continue;
    await clickCell(page, r, c);
    if (await waitFor(page, ({ before, MM }) => {
      const el = [...document.querySelectorAll(`${MM} [role=tab]`)].find((t) => t.textContent.includes('기보'));
      return Number((el?.textContent ?? '').replace(/\D/g, '')) > before;
    }, { before, MM }, 700)) return true;
  }
  return false;
}

/** Plays `rounds` rounds: each person in `humans` ({slot, seatId, goal}) moves when it is their turn, AIs answer on their own. */
async function playRounds(page, humans, rounds) {
  for (let i = 0; i < rounds; i++) {
    for (const h of humans) {
      if (!(await waitTurn(page, h.slot, 40000))) return false;
      if (await won(page)) return true;
      if (!(await humanStep(page, h.seatId, h.goal))) return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------- scenarios

async function scenarioFourPlayerHumanPlusThreeAi() {
  const { ctx, page } = await newPage(undefined, 'four-1h3ai');
  await openBrowser(page);
  await pickMode(page, 'four-player');
  await seat(page, ['human', 'greedy', 'random', 'maxn']);
  const names = await page.locator(`${MB} [data-player-card]`).allInnerTexts();
  check('preview shows the AIs by name before starting', names.some((t) => t.includes('Greedy AI')) && names.some((t) => t.includes('Random AI')) && names.some((t) => t.includes('Max-N AI')), names.join(' | ').replace(/\n/g, ' '));
  const boardBefore = await page.locator(`${MB} svg[aria-label="쿼리도 보드"]`).first().innerHTML();
  await page.locator('[data-seat-kind="1"]').selectOption('maxn');
  check('changing an AI does not change the previewed board', boardBefore === (await page.locator(`${MB} svg[aria-label="쿼리도 보드"]`).first().innerHTML()));
  await page.locator('[data-seat-kind="1"]').selectOption('greedy');
  await start(page);
  await setSpeed(page, '최대');

  const cards = (await page.locator(`${MM} [data-player-card]`).allInnerTexts()).join(' ');
  check('four-player: the seats are named after their AI', /Greedy AI/.test(cards) && /Random AI/.test(cards) && /Max-N AI/.test(cards));
  const ok = await playRounds(page, [{ slot: 1, seatId: 0, goal: 'up' }], 3);
  check('four-player 1 person + 3 AI: three rounds played', ok);
  await waitTurn(page, 1, 20000);
  check('log has 4 moves per round (1 person + 3 AI)', (await logCount(page)) === 12, `moves=${await logCount(page)}`);
  await page.screenshot({ path: path.join(OUT, 'ai-four-1h3ai.png') });

  // analysis tab: every AI algorithm shows what it computed
  await page.locator(`${MM} [role=tab]`, { hasText: 'AI 분석' }).click();
  const seen = new Set();
  for (let i = 0; i < 6; i++) {
    const a = await page.locator(`${MM} [data-analysis]`).first().getAttribute('data-analysis').catch(() => null);
    if (a) seen.add(a);
    if (await page.locator(`${MM} button[aria-label="이전 결정"]`).isDisabled()) break;
    await page.locator(`${MM} button[aria-label="이전 결정"]`).click();
  }
  check('analysis tab shows Random, Greedy and Max-N traces', seen.has('multi-random') && seen.has('multi-greedy') && seen.has('multi-maxn'), [...seen].join(','));
  // go back to the latest and look at a Max-N decision
  while (await page.locator(`${MM} button[aria-label="다음 결정"]`).isEnabled()) await page.locator(`${MM} button[aria-label="다음 결정"]`).click();
  for (let i = 0; i < 3 && (await page.locator(`${MM} [data-analysis="multi-maxn"]`).count()) === 0; i++) await page.locator(`${MM} button[aria-label="이전 결정"]`).click();
  const rows = page.locator(`${MM} [data-maxn-candidate]`);
  check('Max-N analysis lists candidates with per-player value cells', (await rows.count()) > 0 && (await rows.first().locator('td').count()) === 6);
  check('Max-N analysis states the pruning heuristic', /휴리스틱/.test(await page.locator(`${MM} [data-analysis="multi-maxn"]`).innerText()));
  check('Max-N principal variation shown', ((await page.locator(`${MM} [data-maxn-pv]`).innerText()) || '').length > 1);
  await rows.nth(1).hover();
  const hint = await boardSvg(page).locator('xpath=..').innerText();
  check('hovering a candidate previews it on the board', /분석 미리보기|예상 수순/.test(hint + (await page.locator(`${MM}`).innerText())), '');
  await page.mouse.move(5, 5);
  check('leaving the candidate restores the board', !/분석 미리보기 중/.test(await boardSvg(page).locator('xpath=..').innerText()));
  await page.screenshot({ path: path.join(OUT, 'ai-analysis-maxn.png') });

  // record with AI seats
  await page.locator(`${MM} [role=tab]`, { hasText: '기보' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator(`${MM} button`, { hasText: /^JSON$/ }).click()]);
  const file = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
  const kinds = file.participants.map((p) => p.controller?.agent?.kind ?? 'human');
  check('exported record stores who played each seat', JSON.stringify(kinds) === JSON.stringify(['human', 'greedy', 'random', 'maxn']), kinds.join(','));
  check('exported record has AI summaries, not full traces', file.moves.some((m) => m.ai?.algorithm === 'multi-maxn') && JSON.stringify(file).length < 40000, `${JSON.stringify(file).length} bytes`);

  // undo returns to the person's previous turn
  const before = await logCount(page);
  await page.locator(`${MM} button`, { hasText: '무르기' }).click();
  await waitTurn(page, 1, 20000);
  const after = await logCount(page);
  check('undo goes back to the person previous turn (AI replies included)', after === before - 4 && (await turnText(page)).includes('P1 차례'), `${before} → ${after}`);
  await ctx.close();
}

async function scenarioAllAi() {
  const { ctx, page } = await newPage(undefined, 'four-4ai');
  await startMode(page, 'four-player', ['maxn', 'greedy', 'greedy', 'random']);
  await setSpeed(page, '최대');
  check('AI-only: nobody can act by hand (board not interactive)', (await page.locator(`${MM} [data-ai-controls]`).count()) === 1);
  const grew = await waitFor(page, ({ MM }) => {
    const el = [...document.querySelectorAll(`${MM} [role=tab]`)].find((t) => t.textContent.includes('기보'));
    return Number((el?.textContent ?? '').replace(/\D/g, '')) >= 24 || !!document.querySelector(`${MM} [data-status-side="win"]`);
  }, { MM }, 60000);
  check('AI-only four-player game plays on by itself', grew, `moves=${await logCount(page)}`);
  if (await won(page)) {
    const n = await logCount(page);
    await page.waitForTimeout(1500);
    check('no AI move after the game ended', (await logCount(page)) === n);
  } else {
    // pause / step / resume
    await page.locator('[data-ai-pause]').click();
    await page.waitForTimeout(1500); // a move may still be on screen
    const c1 = await logCount(page);
    await page.waitForTimeout(1500);
    check('pause holds the game', (await logCount(page)) === c1 && (await page.locator('[data-ai-pause]').getAttribute('aria-pressed')) === 'true');
    await page.locator('[data-ai-step]').click();
    await waitFor(page, ({ c1, MM }) => {
      const el = [...document.querySelectorAll(`${MM} [role=tab]`)].find((t) => t.textContent.includes('기보'));
      return Number((el?.textContent ?? '').replace(/\D/g, '')) > c1;
    }, { c1, MM }, 20000);
    await page.waitForTimeout(800);
    check('"한 수" plays exactly one move', (await logCount(page)) === c1 + 1, `${c1} → ${await logCount(page)}`);
    await page.locator('[data-ai-pause]').click();
    await page.waitForTimeout(2500);
    check('resume continues the game', (await logCount(page)) > c1 + 1 || (await won(page)));
  }
  await page.screenshot({ path: path.join(OUT, 'ai-four-4ai.png') });
  await ctx.close();
}

async function scenarioThreePlayer() {
  const { ctx, page } = await newPage(undefined, 'three-1h2ai');
  await startMode(page, 'three-player', ['human', 'greedy', 'maxn']);
  await setSpeed(page, '최대');
  check('three-player 1 person + 2 AI: two rounds', await playRounds(page, [{ slot: 1, seatId: 0, goal: 'up' }], 2));
  await waitTurn(page, 1, 20000);
  check('three-player: 3 moves per round', (await logCount(page)) === 6 || (await won(page)), `moves=${await logCount(page)}`);
  await ctx.close();
}

async function scenarioRace2() {
  const { ctx, page } = await newPage(undefined, 'race2-h-ai');
  await startMode(page, 'race-2', ['human', 'greedy']);
  await setSpeed(page, '최대');
  check('race-2 person vs AI: three rounds', await playRounds(page, [{ slot: 1, seatId: 0, goal: 'up' }], 3));
  await waitTurn(page, 1, 20000);
  check('race-2: both players moved the same number of times', (await logCount(page)) === 6 || (await won(page)), `moves=${await logCount(page)}`);
  await ctx.close();
}

async function scenarioRace4AllAi() {
  const { ctx, page } = await newPage(undefined, 'race4-4ai');
  await startMode(page, 'race-4', ['greedy', 'greedy', 'maxn', 'random']);
  await setSpeed(page, '최대');
  const ok = await waitFor(page, ({ MM }) => {
    const el = [...document.querySelectorAll(`${MM} [role=tab]`)].find((t) => t.textContent.includes('기보'));
    return Number((el?.textContent ?? '').replace(/\D/g, '')) >= 20 || !!document.querySelector(`${MM} [data-status-side="win"]`);
  }, { MM }, 60000);
  check('race-4: four AIs play on their own', ok, `moves=${await logCount(page)}`);
  await ctx.close();
}

async function scenarioTeam() {
  const { ctx, page } = await newPage(undefined, 'team-2h2ai');
  await startMode(page, 'team-2v2', ['human', 'greedy', 'human', 'maxn']);
  await setSpeed(page, '최대');
  check('team game shows the teams', /A팀/.test(await page.locator(`${MM} [data-player-card]`).first().innerText()));
  // P1 = seat 0 (bottom, heads up); P3 = seat 2 (top, heads down)
  const ok = await playRounds(page, [{ slot: 1, seatId: 0, goal: 'up' }, { slot: 3, seatId: 2, goal: 'down' }], 3);
  check('team 2 persons + 2 AI: three rounds', ok);
  const n = await logCount(page);
  check('team: 4 moves per round', n >= 12 || (await won(page)), `moves=${n}`);
  await page.screenshot({ path: path.join(OUT, 'ai-team.png') });
  await ctx.close();
}

async function scenarioAsymmetric() {
  const { ctx, page } = await newPage(undefined, 'asym-2ai');
  await startMode(page, 'asymmetric', ['greedy', 'maxn'], {
    before: async (p) => {
      await p.locator('[aria-label="P1 벽 개수"]').fill('3');
      await p.locator('[aria-label="P2 벽 개수"]').fill('12');
    },
  });
  await setSpeed(page, '최대');
  check('asymmetric: AIs start with their own wall counts', (await wallsOf(page, 0)) === 3 && (await wallsOf(page, 1)) === 12, `P1=${await wallsOf(page, 0)} P2=${await wallsOf(page, 1)}`);
  await waitFor(page, ({ MM }) => {
    const el = [...document.querySelectorAll(`${MM} [role=tab]`)].find((t) => t.textContent.includes('기보'));
    return Number((el?.textContent ?? '').replace(/\D/g, '')) >= 16 || !!document.querySelector(`${MM} [data-status-side="win"]`);
  }, { MM }, 60000);
  const w1 = await wallsOf(page, 0), w2 = await wallsOf(page, 1);
  check('asymmetric: wall counts stay within each player allowance', w1 >= 0 && w1 <= 3 && w2 >= 0 && w2 <= 12, `P1=${w1} P2=${w2}`);
  await ctx.close();
}

async function scenarioObstacle() {
  const { ctx, page } = await newPage(undefined, 'obstacle-2ai');
  await openBrowser(page);
  await pickMode(page, 'obstacle');
  await page.locator('[aria-label="장애물 시드"]').fill('42');
  await page.waitForSelector('[data-generating]', { state: 'detached', timeout: 20000 }).catch(() => undefined);
  await seat(page, ['greedy', 'greedy']);
  await page.waitForFunction(() => !document.querySelector('[data-generating]'), null, { timeout: 20000 });
  const preview = await page.locator(`${MB} [data-obstacle-legend]`).first().innerText();
  await start(page);
  await setSpeed(page, '최대');
  const legend = await page.locator(`${MM} [data-obstacle-legend]`).first().innerText();
  check('obstacle race: the game uses the previewed map', preview === legend, `${preview} / ${legend}`);
  const grew = await waitFor(page, ({ MM }) => {
    const el = [...document.querySelectorAll(`${MM} [role=tab]`)].find((t) => t.textContent.includes('기보'));
    return Number((el?.textContent ?? '').replace(/\D/g, '')) >= 12 || !!document.querySelector(`${MM} [data-status-side="win"]`);
  }, { MM }, 60000);
  check('obstacle race (seed 42): AI vs AI plays', grew);
  await ctx.close();
}

async function scenarioCancel() {
  const { ctx, page } = await newPage(undefined, 'cancel');
  await startMode(page, 'four-player', ['human', 'maxn', 'human', 'human'], { preset: 'hard' });
  await humanStep(page, 0, 'up');
  await page.waitForTimeout(150);
  check('AI is thinking after the person moved', (await page.locator(`${MM} [data-multi-thinking], ${MM}`).first().innerText()).includes('생각 중'));
  // restart while the AI computes (hard preset searches for seconds)
  const restart = page.locator(`${MM} button`, { hasText: /^재시작$|정말 처음부터/ });
  await restart.click();
  if (await page.locator(`${MM} button`, { hasText: '정말 처음부터?' }).count()) await page.locator(`${MM} button`, { hasText: '정말 처음부터?' }).click();
  await page.waitForTimeout(4500);
  check('restart during a search: the old result never lands in the new game', (await logCount(page)) === 0);
  // undo while the AI computes
  await humanStep(page, 0, 'up');
  await page.waitForTimeout(150);
  await page.locator(`${MM} button`, { hasText: '무르기' }).click();
  await page.waitForTimeout(4500);
  check('undo during a search: no stale AI move is applied', (await logCount(page)) === 0);
  await ctx.close();
}

async function scenarioChangeModeWhileThinking() {
  const { ctx, page } = await newPage(undefined, 'mode-change');
  await startMode(page, 'four-player', ['human', 'maxn', 'human', 'human'], { preset: 'hard' });
  await humanStep(page, 0, 'up');
  await page.waitForTimeout(150);
  await openBrowser(page);
  await pickMode(page, 'race-2');
  await seat(page, ['human', 'human']);
  await start(page);
  await page.waitForTimeout(4500);
  check('new mode started while an AI was thinking: nothing from the old game arrives', (await logCount(page)) === 0 && (await page.locator(`${MM}`).getAttribute('data-mode')) === 'race-2');
  await ctx.close();
}

async function scenarioMobile() {
  const { ctx, page } = await newPage({ width: 390, height: 780 }, 'mobile');
  await openBrowser(page);
  await pickMode(page, 'four-player');
  await seat(page, ['human', 'maxn', 'greedy', 'maxn']);
  await page.locator('[data-agent-fields="3"] details summary').click();
  await page.locator('#mode-settings').scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(300);
  const lastField = await page.locator('[data-agent-fields="3"] details label').last().boundingBox();
  const startBtn = await page.locator('[data-start-game]').boundingBox();
  check('mobile: the sticky start button does not cover the last setting', lastField && startBtn && lastField.y + lastField.height <= startBtn.y + 1, `last bottom=${lastField && Math.round(lastField.y + lastField.height)} button top=${startBtn && Math.round(startBtn.y)}`);
  await page.screenshot({ path: path.join(OUT, 'ai-mobile-setup.png') });
  await start(page);
  await setSpeed(page, '최대');
  const box = await boardSvg(page).boundingBox();
  check('mobile: the game board is usable with AI controls shown', box.width >= 300 && (await page.locator('[data-ai-controls]').count()) === 1);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('mobile: no horizontal overflow', overflow <= 1, `overflow=${overflow}`);
  await page.screenshot({ path: path.join(OUT, 'ai-mobile-game.png') });
  await ctx.close();
}

async function scenarioHotSeatUnchanged() {
  const { ctx, page } = await newPage(undefined, 'hotseat');
  await startMode(page, 'four-player', ['human', 'human', 'human', 'human']);
  check('all people: no AI controls and no AI tab', (await page.locator('[data-ai-controls]').count()) === 0 && (await page.locator(`${MM} [role=tab]`, { hasText: 'AI 분석' }).count()) === 0);
  check('all people: the first person can move', await humanStep(page, 0, 'up'));
  await ctx.close();
}

/** Frame gaps (requestAnimationFrame) while four hard Max-N AIs think; `noWorker` forces the capped main-thread fallback. */
async function responsiveness(noWorker) {
  const label = noWorker ? 'no-worker fallback' : 'worker';
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  if (noWorker) await ctx.addInitScript(() => { window.Worker = undefined; });
  const page = await ctx.newPage();
  diag.attach(page, noWorker ? 'fallback' : 'worker');
  page.on('pageerror', (e) => check('no page error', false, String(e)));
  await page.goto(BASE + '#/play');
  await page.waitForSelector('main:visible');
  await openBrowser(page);
  await pickMode(page, 'four-player');
  await seat(page, ['maxn', 'maxn', 'maxn', 'maxn'], 'hard');
  await start(page);
  await setSpeed(page, '최대');
  await page.evaluate(() => {
    window.__gaps = [];
    window.__big = []; // frames longer than 100 ms with the time since sampling began (to see what caused them)
    const t0 = performance.now();
    let last = t0;
    const tick = (t) => { window.__gaps.push(t - last); if (t - last > 100) window.__big.push([Math.round(t - t0), Math.round(t - last)]); last = t; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  await page.waitForTimeout(10000);
  const gaps = await page.evaluate(() => window.__gaps.slice(5));
  const sorted = [...gaps].sort((a, b) => a - b);
  const max = sorted[sorted.length - 1];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const moves = await logCount(page);
  const big = await page.evaluate(() => window.__big);
  if (big.length) console.log(`METRIC ${label}: frames over 100 ms [at ms, gap ms]: ${JSON.stringify(big)}`);
  console.log(`METRIC ${label}: ${gaps.length} frames in 10 s, p95 gap ${p95.toFixed(1)} ms, max gap ${max.toFixed(1)} ms, ${moves} AI moves (hard preset, 3 s budget per move)`);
  check(`${label}: the page keeps rendering while four hard AIs think (max frame gap ${max.toFixed(0)} ms)`, max < (noWorker ? 700 : 250));
  check(`${label}: the AIs kept playing`, moves >= 2, `moves=${moves}`);
  // cancel responsiveness: pause while a hard search runs and time how long until the UI shows it stopped
  const t0 = Date.now();
  await page.locator('[data-ai-pause]').click();
  await page.waitForFunction(() => !document.querySelector('[data-ai-pause][aria-pressed="false"]'), null, { timeout: 2000 });
  const ack = Date.now() - t0;
  console.log(`METRIC ${label}: pause acknowledged in ${ack} ms (search cancelled)`);
  check(`${label}: pausing cancels the running search quickly`, ack < 1000, `${ack} ms`);
  const n = await logCount(page);
  await page.waitForTimeout(4000);
  check(`${label}: no move arrives after the pause`, (await logCount(page)) === n);
  await ctx.close();
}

async function scenarioResponsivenessWorker() {
  await responsiveness(false);
}
async function scenarioResponsivenessFallback() {
  await responsiveness(true);
}

async function scenarioTwoPlayerViewsUnchanged() {
  const { ctx, page } = await newPage(undefined, 'regression');
  await openBrowser(page);
  await pickMode(page, 'vs-ai');
  await start(page).catch(() => undefined);
  check('사람 vs AI starts and shows the two-player AI analysis', (await page.locator('main:visible [aria-label="쿼리도 보드"]').count()) > 0 && (await page.getByText('AI 분석').count()) > 0);
  for (const route of ['arena', 'compare', 'experiments']) {
    await page.evaluate((r) => { window.location.hash = `/${r}`; }, route);
    await page.waitForTimeout(500);
    check(`#/${route} renders`, (await page.locator('main:visible, section:visible').count()) > 0);
  }
  await ctx.close();
}

const scenarios = [
  scenarioHotSeatUnchanged,
  scenarioFourPlayerHumanPlusThreeAi,
  scenarioAllAi,
  scenarioThreePlayer,
  scenarioRace2,
  scenarioRace4AllAi,
  scenarioTeam,
  scenarioAsymmetric,
  scenarioObstacle,
  scenarioCancel,
  scenarioChangeModeWhileThinking,
  scenarioMobile,
  scenarioTwoPlayerViewsUnchanged,
  scenarioResponsivenessWorker,
  scenarioResponsivenessFallback,
];
const only = process.env.ONLY;
for (const s of scenarios) {
  if (only && !s.name.toLowerCase().includes(only.toLowerCase())) continue;
  console.log(`\n# ${s.name}`);
  try {
    await s();
  } catch (e) {
    check(`${s.name} ran to completion`, false, String(e).split('\n')[0]);
  }
}

console.log(`\n${passed}/${passed + failed} checks passed`);
await diag.finish({ browserVersion: browser.version(), checks: { passed, failed } });
await browser.close();
process.exit(failed ? 1 : 0);
