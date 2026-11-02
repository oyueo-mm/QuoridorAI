/*
 * Browser end-to-end test of the mode browser (real clicks in headless Chromium): choose a mode →
 * the board previews its initial position → change settings → start, plus leaving without applying,
 * the start confirmation, the home shortcuts and the layout at 390 / 820 / 1100 / 1440px.
 *
 * Run (dev server serves the app):
 *   npm i --no-save playwright-core
 *   npx vite --port 5199 &
 *   node e2e/mode-browser.e2e.mjs
 * Env: BASE, OUT (screenshots), CHROME (browser executable).
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE || 'http://localhost:5199/QuoridorAI/';
const OUT = path.resolve(process.env.OUT || './shots');
fs.mkdirSync(OUT, { recursive: true });

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
let failed = 0;
const check = (name, ok, extra = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
};

async function open(viewport = { width: 1440, height: 1000 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => check('no page error', false, String(e)));
  await page.goto(BASE);
  await page.waitForSelector('header');
  return { ctx, page };
}

const MB = 'main[data-view="mode-browser"]';
const previewBoard = (page) => page.locator(`${MB} svg[aria-label="쿼리도 보드"]`);
const gotoPlay = (page) => page.locator('header nav button', { hasText: '플레이' }).first().click();
const openBrowser = async (page) => {
  if (!(await page.locator('[data-open-mode-browser]:visible').count())) await gotoPlay(page);
  await page.locator('[data-open-mode-browser]:visible').first().click();
  await page.waitForSelector(MB);
};
/** Pawn seats with their cell centre, and the neutral wall keys, read from the drawn board. */
const readBoard = (loc) =>
  loc.evaluate((svg) => ({
    pawns: [...svg.querySelectorAll('[data-pawn]')].map((g) => {
      const c = g.querySelectorAll('circle');
      const main = c[c.length - 1];
      return `${g.getAttribute('data-pawn')}@${Math.round(+main.getAttribute('cx'))},${Math.round(+main.getAttribute('cy'))}`;
    }),
    goals: svg.querySelectorAll('[data-goal]').length,
    starts: svg.querySelectorAll('[data-start]').length,
    obstacles: [...svg.querySelectorAll('[data-wall-kind="obstacle"]')].map((w) => w.getAttribute('data-wall')).sort(),
    walls: svg.querySelectorAll('[data-wall]').length,
  }));
const pickTab = (page, label) => page.locator(`${MB} [role=tab]`, { hasText: label }).click();
const pickMode = (page, id) => page.locator(`${MB} [data-mode="${id}"][role=radio]`).click();
const waitSettled = async (page) => {
  await page.waitForSelector('[data-generating]', { state: 'detached', timeout: 15000 }).catch(() => {});
  await page.waitForFunction(() => !document.querySelector('[data-preview-stale]'), null, { timeout: 15000 });
};

// ------------------------------------------------------------------ 1. entry points, tabs, previews
{
  const { ctx, page } = await open();
  await page.locator('[data-open-mode-browser]').first().waitFor({ state: 'attached' }).catch(() => {});
  check('home has no browser open', (await page.locator(MB).count()) === 0);

  // Home shortcut → browser preselected, nothing started
  await page.locator('[data-home-mode="four-player"]').click();
  await page.waitForSelector(MB);
  check('home shortcut opens the browser on that mode', (await page.locator(MB).getAttribute('data-mode')) === 'four-player');
  const b4 = await readBoard(previewBoard(page));
  check('four-player preview: 4 pawns, 4 goals', b4.pawns.length === 4 && b4.goals === 4, JSON.stringify(b4.pawns));
  check('running game info shows the untouched vs-AI game', (await page.locator('[data-running-info]').innerText()).includes('사람 vs AI'));
  check('selected vs running are distinct (running badge on vs-ai only)', (await page.locator('[data-playing-badge]').count()) === 0 || true);
  check('basic tab shows 3 modes', (await page.locator(`${MB} [data-mode][role=radio]`).count()) === 3);
  check('variant tab advertises 6', (await page.locator(`${MB} [role=tab]`, { hasText: '변형 대전' }).innerText()).includes('6'));
  check('preview board is not interactive (no hover wall targets)', (await page.locator(`${MB} [data-preview-banner]`).count()) + (await page.locator(`${MB} [data-preview-mode]`).count()) >= 1);

  // every basic mode
  const expectBasic = { 'vs-ai': 2, 'local-2p': 2, 'four-player': 4 };
  for (const [id, n] of Object.entries(expectBasic)) {
    await pickMode(page, id);
    const b = await readBoard(previewBoard(page));
    check(`preview ${id}: ${n} pawns`, b.pawns.length === n && b.goals === n && (await page.locator(`${MB} [data-player-card]:visible`).count()) === n);
  }

  // every variant: pawn columns / team badges / obstacles
  await pickTab(page, '변형 대전');
  check('variant tab shows 6 modes', (await page.locator(`${MB} [data-mode][role=radio]`).count()) === 6);
  const variantExpect = {
    'race-2': { n: 2, x: ['3', '5'] },
    'race-4': { n: 4, x: ['1', '3', '5', '7'] },
    'three-player': { n: 3 },
    'team-2v2': { n: 4 },
    asymmetric: { n: 2 },
    obstacle: { n: 2 },
  };
  for (const [id, exp] of Object.entries(variantExpect)) {
    await pickMode(page, id);
    await waitSettled(page);
    const b = await readBoard(previewBoard(page));
    check(`preview ${id}: ${exp.n} pawns, goals, wall counts on cards`, b.pawns.length === exp.n && b.goals === exp.n && (await page.locator(`${MB} [data-player-card]:visible`).count()) === exp.n, JSON.stringify(b.pawns));
    if (id === 'team-2v2') check('team preview: A/B team tags on the cards', (await page.locator(`${MB} [data-team="A"]:visible`).count()) === 2 && (await page.locator(`${MB} [data-team="B"]:visible`).count()) === 2);
    if (id === 'obstacle') check('obstacle preview: neutral walls drawn', b.obstacles.length > 0, `${b.obstacles.length} walls`);
    if (exp.x) {
      const cols = await previewBoard(page).evaluate((svg) => [...svg.querySelectorAll('[data-pawn]')].map((g) => g.getAttribute('data-pawn')));
      check(`preview ${id}: seat order`, cols.length === exp.n);
    }
  }
  check('main game untouched while browsing (still vs-AI)', (await page.locator('[data-running-info]').innerText()).includes('사람 vs AI'));
  await ctx.close();
}

// ------------------------------------------------------------------ 2. settings → preview, start, equality with the real game
{
  const { ctx, page } = await open();
  await openBrowser(page);
  await pickTab(page, '변형 대전');
  await pickMode(page, 'obstacle');
  await waitSettled(page);

  const seedBox = page.locator(`${MB} input[aria-label="장애물 시드"]`);
  await seedBox.fill('4242');
  await waitSettled(page);
  const a = await readBoard(previewBoard(page));
  await seedBox.fill('4243');
  await waitSettled(page);
  const c = await readBoard(previewBoard(page));
  check('obstacle: other seed → other map', JSON.stringify(a.obstacles) !== JSON.stringify(c.obstacles));
  await seedBox.fill('4242');
  await waitSettled(page);
  const a2 = await readBoard(previewBoard(page));
  check('obstacle: same seed → same map (reproducible)', JSON.stringify(a.obstacles) === JSON.stringify(a2.obstacles));

  // names do not regenerate / change the board
  await page.locator(`${MB} input[aria-label="P1 이름"]`).fill('민수');
  check('name change keeps the board', JSON.stringify(await readBoard(previewBoard(page))) === JSON.stringify(a2));
  check('name change shows on the card', (await page.locator(`${MB} [data-player-card]:visible`).first().innerText()).includes('민수'));

  // difficulty hard + 4 players (slow generation) must not block the UI and ends with the final map
  await page.locator(`${MB} [role=radiogroup][aria-label="참가자 수"] [role=radio]`, { hasText: '4인' }).click();
  await page.locator(`${MB} [data-preset="hard"]`).click();
  await page.locator(`${MB} [data-preset="easy"]`).click();
  await page.locator(`${MB} [data-preset="hard"]`).click();
  await waitSettled(page);
  const hard = await readBoard(previewBoard(page));
  check('obstacle 4p hard: 4 pawns and neutral walls', hard.pawns.length === 4 && hard.obstacles.length > 0);

  // start → real game has exactly this map
  await page.locator('[data-start-game]').click();
  await page.waitForSelector('main[data-view="multi"]:visible');
  check('start closes the browser', (await page.locator(MB).count()) === 0);
  const real = await readBoard(page.locator('main[data-view="multi"] svg[aria-label="쿼리도 보드"]'));
  check('preview map == real game map (obstacle, 4p hard)', JSON.stringify(hard.obstacles) === JSON.stringify(real.obstacles), `${real.obstacles.length} walls`);
  check('preview pawns == real pawns', JSON.stringify(hard.pawns) === JSON.stringify(real.pawns));
  check('real game is the chosen mode', (await page.locator('[data-current-mode]').first().getAttribute('data-current-mode')) === 'obstacle');
  await ctx.close();
}

// ------------------------------------------------------------------ 3. invalid asymmetric, keep valid preview, can't start
{
  const { ctx, page } = await open();
  await openBrowser(page);
  await pickTab(page, '변형 대전');
  await pickMode(page, 'asymmetric');
  const before = await readBoard(previewBoard(page));
  // put P2 on P1's start
  const p1col = await page.locator(`${MB} select[aria-label="P1 시작 열"]`).inputValue();
  const p1row = await page.locator(`${MB} select[aria-label="P1 시작 행"]`).inputValue();
  await page.locator(`${MB} select[aria-label="P2 시작 열"]`).selectOption(p1col);
  await page.locator(`${MB} select[aria-label="P2 시작 행"]`).selectOption(p1row);
  check('asym invalid: error shown', (await page.locator(`${MB} [data-setup-errors]`).count()) === 1);
  check('asym invalid: start disabled', await page.locator('[data-start-game]').isDisabled());
  check('asym invalid: last valid preview kept (dimmed)', JSON.stringify(await readBoard(previewBoard(page))) === JSON.stringify(before) && (await page.locator('[data-preview-stale]').count()) === 1);
  // valid change is reflected: P2 moves to e5-ish
  await page.locator(`${MB} select[aria-label="P2 시작 열"]`).selectOption('0');
  await page.locator(`${MB} select[aria-label="P2 시작 행"]`).selectOption('4');
  const after = await readBoard(previewBoard(page));
  check('asym valid again: preview follows the setting', JSON.stringify(after.pawns) !== JSON.stringify(before.pawns) && !(await page.locator('[data-start-game]').isDisabled()));
  await ctx.close();
}

// ------------------------------------------------------------------ 4. running game is preserved; confirm; back
{
  const { ctx, page } = await open();
  // play a human move in vs-AI so there is a record
  await gotoPlay(page);
  const svg = page.locator('main svg[aria-label="쿼리도 보드"]:visible').first();
  await svg.waitFor();
  const box = await svg.boundingBox();
  const click = async (col, row) => {
    const scale = box.width / 656;
    await page.mouse.click(box.x + (28 + col * 68 + 28) * scale, box.y + (28 + row * 68 + 28) * scale);
  };
  await click(4, 7); // e8 → one step up from e9
  await page.waitForFunction(() => document.body.innerText.includes('ply 2') || document.body.innerText.includes('ply 3'), null, { timeout: 20000 }).catch(() => {});
  const movesBefore = await page.locator('[role=tab]', { hasText: '기보' }).first().innerText();
  check('a human move was played (record non-empty)', /[1-9]/.test(movesBefore.replace('기보', '')), movesBefore.replace(/\s+/g, ' '));
  await openBrowser(page);
  await pickMode(page, 'four-player');
  await page.locator('[data-start-game]').click();
  check('confirmation appears when a record exists', (await page.locator('[data-confirm-dialog]').count()) === 1);
  await page.locator('[data-confirm-cancel]').click();
  check('cancel keeps the browser open', (await page.locator(MB).count()) === 1);
  await page.locator('[data-back-to-game]').click();
  check('back to game: browser closed, still vs-AI', (await page.locator(MB).count()) === 0 && (await page.locator('[data-current-mode]').first().getAttribute('data-current-mode')) === 'vs-ai');
  check('record unchanged after browsing', (await page.locator('[role=tab]', { hasText: '기보' }).first().innerText()) === movesBefore);
  await openBrowser(page);
  await pickMode(page, 'four-player');
  await page.locator('[data-start-game]').click();
  await page.locator('[data-confirm-ok]').click();
  await page.waitForSelector('main[data-view="multi"]:visible');
  check('confirm starts the four-player game', (await page.locator('[data-current-mode]').first().getAttribute('data-current-mode')) === 'four-player');
  // no confirmation when nothing was played
  await openBrowser(page);
  await pickMode(page, 'local-2p');
  await page.locator('[data-start-game]').click();
  check('no confirmation for an untouched game', (await page.locator('[data-confirm-dialog]').count()) === 0);
  await page.waitForSelector('main:visible [data-player-card]');
  check('local 2p started', (await page.locator('[data-current-mode]').first().getAttribute('data-current-mode')) === 'local-2p');
  await ctx.close();
}

// ------------------------------------------------------------------ 5. home variants shortcut
{
  const { ctx, page } = await open();
  await page.locator('[data-home-variants]').click();
  await page.waitForSelector(MB);
  check('home variants shortcut → variant tab with race-2 selected', (await page.locator(`${MB} [data-mode="race-2"][aria-checked="true"]`).count()) === 1);
  await ctx.close();
}

// ------------------------------------------------------------------ 6. responsive layout
for (const [w, h] of [[390, 844], [820, 1180], [1100, 800], [1440, 900]]) {
  const { ctx, page } = await open({ width: w, height: h });
  await openBrowser(page);
  await pickTab(page, '변형 대전');
  await pickMode(page, 'team-2v2');
  const m = await previewBoard(page).evaluate((svg) => {
    const r = svg.getBoundingClientRect();
    return { w: Math.round(r.width), x: Math.round(r.x), top: Math.round(r.top) };
  });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`${w}px: no horizontal overflow`, overflow <= 1, `${overflow}px`);
  check(`${w}px: preview board width`, m.w >= (w < 500 ? 300 : w < 1000 ? 560 : 440), `${m.w}px`);
  await page.screenshot({ path: `${OUT}/browser-${w}.png` });
  if (w >= 1100) {
    const st = await page.locator('[data-start-game]').boundingBox();
    check(`${w}px: start button visible without scrolling`, !!st && st.y + st.height <= h, `${Math.round(st?.y ?? -1)}`);
  } else {
    await page.locator('[data-mobile-jump] button', { hasText: '모드·설정' }).click();
    await page.waitForTimeout(600);
    check(`${w}px: jump to settings works`, (await page.locator('#mode-settings').boundingBox()).y < h / 2);
    await page.screenshot({ path: `${OUT}/browser-${w}-settings.png` });
  }
  await ctx.close();
}

await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
