import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const origin = 'https://oyueo-mm.github.io';
const base = '/QuoridorAI/';
const canonical = origin + base;
const html = await readFile('dist/index.html', 'utf8');
const head = html.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? '';
const tags = [...head.matchAll(/<(meta|link)\s+([^>]+)>/g)].map(([, tag, attributes]) => ({
  tag,
  ...Object.fromEntries([...attributes.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, key, value]) => [key, value])),
}));
const meta = (key) => {
  const matches = tags.filter((tag) => tag.name === key || tag.property === key);
  assert.equal(matches.length, 1, `Exactly one ${key} is required`);
  assert.ok(matches[0].content, `${key} must not be empty`);
  return matches[0].content;
};
assert.match(html, /<html lang="ko">/);
assert.equal(meta('google-site-verification'), 'wJt-lkmKFMcAXpu9gEUMBhyBrWsPSftS2ig_4ozPeSE');
assert.match(head, /<title>[^<]*쿼리도[^<]*QuoridorAI<\/title>/);
assert.match(meta('description'), /무료/);
assert.ok(!/noindex|nofollow/i.test(head), 'The page must remain indexable');
const canonicals = tags.filter((tag) => tag.rel === 'canonical');
assert.equal(canonicals.length, 1);
assert.equal(canonicals[0].href, canonical);
assert.equal(meta('og:url'), canonical);
assert.equal(meta('og:type'), 'website');
assert.equal(meta('og:locale'), 'ko_KR');
assert.equal(meta('twitter:card'), 'summary_large_image');
for (const key of ['og:title', 'og:description', 'og:image:alt', 'twitter:title', 'twitter:description', 'twitter:image:alt']) meta(key);

const blocks = [...head.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
assert.equal(blocks.length, 1);
const data = JSON.parse(blocks[0][1]);
assert.equal(data['@context'], 'https://schema.org');
assert.ok(data['@graph'].some((node) => node['@type'] === 'WebSite' && node.url === canonical));
assert.ok(data['@graph'].some((node) => node['@type'].includes('VideoGame') && node.url === canonical && node.isAccessibleForFree));

// Verify the actual deployed HTML contains the home UI, rather than an empty SPA shell.
assert.ok(!html.includes('<!--prerender-home-->'));
assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
assert.match(html, /<h1[^>]*>QuoridorAI<\/h1>/);
assert.match(html, /<main\b/);
assert.match(html, /<nav[^>]*aria-label="보기 선택"/);
assert.match(html, /쿼리도 인공지능/);
assert.match(html, /정규 4인전/);
assert.match(html, /href="#\/play"/);
assert.match(html, /href="\/QuoridorAI\/favicon.svg"/);
assert.match(html, /src="\/QuoridorAI\/assets\//);

for (const key of ['og:image', 'twitter:image']) {
  const url = new URL(meta(key));
  assert.equal(url.origin, origin);
  assert.ok(url.pathname.startsWith(base));
  const png = await readFile(resolve('dist', url.pathname.slice(base.length)));
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);
}
for (const [, asset] of html.matchAll(/(?:src|href)="(\/QuoridorAI\/(?:assets\/[^"#?]+|favicon.svg))"/g)) {
  assert.ok((await stat(resolve('dist', asset.slice(base.length)))).isFile(), `Missing asset ${asset}`);
}
const sitemap = await readFile('dist/sitemap.xml', 'utf8');
assert.match(sitemap, /xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9"/);
assert.deepEqual([...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(([, url]) => url), [canonical]);
const robots = await readFile('dist/robots.txt', 'utf8');
assert.match(robots, /^User-agent: \*$/m);
assert.match(robots, /^Allow: \/$/m);
assert.ok(!/^Disallow:\s*\//m.test(robots));
assert.ok(robots.includes(`Sitemap: ${canonical}sitemap.xml`));
console.log('SEO checks passed: static home, metadata, JSON-LD, sitemap, robots and Pages assets');
