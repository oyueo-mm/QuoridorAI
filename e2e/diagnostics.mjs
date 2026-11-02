/*
 * Failure diagnostics shared by the browser end-to-end scripts. A failing check used to leave only a
 * FAIL line; with this the run also keeps what is needed to trace it:
 *   - a screenshot of every open page at the moment of the failure,
 *   - the browser console errors / warnings, uncaught page errors, failed or 4xx/5xx requests,
 *   - a JSON report (e2e-report-<name>.json) with the failing checks, their screenshots and the
 *     information needed to reproduce the run (script, base URL, env, browser, viewport).
 * Nothing here changes what is checked: a check that fails still fails the run.
 *
 *   const diag = createDiagnostics({ name: 'multi-ai', out: OUT, base: BASE });
 *   diag.attach(page, 'label');            // after newPage()
 *   check = (name, ok, extra) => { …; if (!ok) diag.failure(name, extra); }
 *   await diag.finish({ browserVersion });  // before exiting; returns the report
 */
import fs from 'node:fs';
import path from 'node:path';

const slug = (s) => s.replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 60).replace(/^-|-$/g, '') || 'check';

export function createDiagnostics({ name, out, base }) {
  fs.mkdirSync(out, { recursive: true });
  const startedAt = new Date();
  const pages = new Map(); // page → label
  const report = { name, base, startedAt: startedAt.toISOString(), argv: process.argv.slice(1), env: {}, failures: [], console: [], pageErrors: [], failedRequests: [] };
  for (const k of ['BASE', 'OUT', 'CHROME', 'MIRROR_FROM', 'SRC_PREFIX']) if (process.env[k]) report.env[k] = process.env[k];
  const pending = [];
  let shots = 0;

  const current = () => ({ ts: new Date().toISOString(), pages: [...pages.values()] });

  return {
    attach(page, label = `page${pages.size + 1}`) {
      pages.set(page, label);
      page.on('console', (m) => {
        if (m.type() === 'error' || m.type() === 'warning') report.console.push({ ...current(), page: label, type: m.type(), text: m.text().slice(0, 500), at: m.location()?.url });
      });
      page.on('pageerror', (e) => report.pageErrors.push({ ts: new Date().toISOString(), page: label, message: String(e), stack: e?.stack?.split('\n').slice(0, 6).join('\n') }));
      page.on('requestfailed', (r) => report.failedRequests.push({ ts: new Date().toISOString(), page: label, url: r.url(), reason: r.failure()?.errorText }));
      page.on('response', (r) => {
        if (r.status() >= 400) report.failedRequests.push({ ts: new Date().toISOString(), page: label, url: r.url(), status: r.status() });
      });
      page.on('close', () => pages.delete(page));
    },

    /** Records a failed check and takes a screenshot of each open page (asynchronously; finish() waits for them). */
    failure(checkName, extra = '') {
      const entry = { check: checkName, detail: String(extra), ts: new Date().toISOString(), screenshots: [], viewports: [] };
      report.failures.push(entry);
      const n = ++shots;
      for (const [page, label] of pages) {
        const file = path.join(out, `fail-${String(n).padStart(2, '0')}-${slug(checkName)}-${label}.png`);
        pending.push(
          page
            .screenshot({ path: file })
            .then(() => {
              entry.screenshots.push(file);
              entry.viewports.push({ page: label, ...page.viewportSize(), url: page.url() });
            })
            .catch(() => undefined),
        );
      }
    },

    async finish({ browserVersion, checks } = {}) {
      await Promise.all(pending);
      Object.assign(report, { finishedAt: new Date().toISOString(), durationMs: Date.now() - startedAt.getTime(), browser: browserVersion, checks });
      const file = path.join(out, `e2e-report-${name}.json`);
      fs.writeFileSync(file, JSON.stringify(report, null, 2));
      const bad = report.failures.length;
      console.log(`report: ${file} — ${bad} failed check(s), ${report.console.length} console message(s), ${report.pageErrors.length} page error(s), ${report.failedRequests.length} failed request(s)`);
      return report;
    },
  };
}
