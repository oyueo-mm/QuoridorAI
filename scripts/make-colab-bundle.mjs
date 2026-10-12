// Packs the Python training code for a Colab runtime: `npm run colab:bundle`.
//
// Output (git-ignored):
//   training/dist/quoridor_az_bundle.tar.gz   upload with Explorer → right-click → "Upload to Colab"
//   training/dist/BUNDLE_MANIFEST.json        the same manifest that is inside the archive
//
// The manifest lists every file with its sha256 plus the git commit and whether the working
// tree had uncommitted changes. `bundle_id` is a hash of the file contents only, so the
// notebook can verify that the code it runs is exactly the code on this machine.
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { gzipSync } from 'node:zlib';

const ROOT = process.cwd();
const TRAINING = join(ROOT, 'training');
const INCLUDE = ['pyproject.toml', 'README.md', 'quoridor_az', 'tests', 'fixtures'];
const SKIP = /(__pycache__|\.pyc$|\.pytest_cache|\.egg-info)/;

function walk(path) {
  const st = statSync(path);
  if (!st.isDirectory()) return [path];
  return readdirSync(path).flatMap((name) => (SKIP.test(name) ? [] : walk(join(path, name))));
}

const files = INCLUDE.flatMap((p) => walk(join(TRAINING, p)))
  .map((abs) => ({ abs, rel: relative(TRAINING, abs).split(sep).join('/') }))
  .sort((a, b) => (a.rel < b.rel ? -1 : 1));

const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const entries = files.map((f) => {
  const data = readFileSync(f.abs);
  return { path: f.rel, size: data.length, sha256: sha(data), data };
});
const bundleId = sha(entries.map((e) => `${e.path}:${e.sha256}`).join('\n')).slice(0, 16);

const git = (cmd) => {
  try {
    return execSync(`git ${cmd}`, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return null;
  }
};
const manifest = {
  format: 'qz-colab-bundle-v1',
  bundle_id: bundleId,
  created_at: new Date().toISOString(),
  git_commit: git('rev-parse HEAD'),
  git_dirty_training_files: (git('status --porcelain -- training scripts') ?? '').split('\n').filter(Boolean),
  files: entries.map(({ path, size, sha256 }) => ({ path, size, sha256 })),
};
const manifestBuf = Buffer.from(JSON.stringify(manifest, null, 1));

// Minimal ustar writer (regular files only).
function tarHeader(name, size) {
  const h = Buffer.alloc(512, 0);
  const put = (str, off, len) => h.write(str, off, Math.min(len, Buffer.byteLength(str)), 'utf8');
  const octal = (n, len) => n.toString(8).padStart(len - 1, '0') + '\0';
  if (Buffer.byteLength(name) > 100) throw new Error(`path too long for ustar: ${name}`);
  put(name, 0, 100);
  put(octal(0o644, 8), 100, 8);
  put(octal(0, 8), 108, 8);
  put(octal(0, 8), 116, 8);
  put(octal(size, 12), 124, 12);
  put(octal(Math.floor(Date.now() / 1000), 12), 136, 12);
  h.fill(' ', 148, 156);
  put('0', 156, 1);
  put('ustar\0', 257, 6);
  put('00', 263, 2);
  let sum = 0;
  for (const b of h) sum += b;
  put(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8);
  return h;
}
const blocks = [];
for (const { path, data } of [...entries, { path: 'BUNDLE_MANIFEST.json', data: manifestBuf }]) {
  const name = `quoridor_src/${path}`;
  blocks.push(tarHeader(name, data.length), data, Buffer.alloc((512 - (data.length % 512)) % 512, 0));
}
blocks.push(Buffer.alloc(1024, 0));

const outDir = join(TRAINING, 'dist');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'quoridor_az_bundle.tar.gz'), gzipSync(Buffer.concat(blocks), { level: 9 }));
writeFileSync(join(outDir, 'BUNDLE_MANIFEST.json'), manifestBuf);

console.log(`bundle_id ${bundleId}  (${entries.length} files, git ${manifest.git_commit?.slice(0, 7) ?? 'n/a'}${manifest.git_dirty_training_files.length ? ', uncommitted changes included' : ''})`);
console.log('→ training/dist/quoridor_az_bundle.tar.gz');
console.log('Upload it: Explorer → right-click → "Upload to Colab" (lands in /content), or copy it to');
console.log('Google Drive: MyDrive/QuoridorAI/bundles/. In the notebook set EXPECTED_BUNDLE_ID to the id above.');
