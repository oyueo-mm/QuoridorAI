"""Source bundle handling on the Colab side (standard library only).

The notebook's setup cell contains a copy of `install_bundle` because the package is not
importable before the bundle is extracted; afterwards `verify_tree` re-checks the extracted
files against the manifest (e.g. after a runtime restart or a manual edit on the server).
"""

from __future__ import annotations

import hashlib
import json
import tarfile
from pathlib import Path


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify_tree(root: str | Path) -> dict:
    """Checks every file listed in BUNDLE_MANIFEST.json. Raises if anything differs."""
    root = Path(root)
    manifest = json.loads((root / 'BUNDLE_MANIFEST.json').read_text(encoding='utf-8'))
    bad = [f['path'] for f in manifest['files'] if not (root / f['path']).exists() or _sha256(root / f['path']) != f['sha256']]
    if bad:
        raise RuntimeError(f'{len(bad)} files differ from the bundle manifest: {bad[:5]}')
    return manifest


def install_bundle(archive: str | Path, target_parent: str | Path) -> dict:
    """Extracts `archive` (made by `npm run colab:bundle`) into target_parent/quoridor_src."""
    target_parent = Path(target_parent)
    target_parent.mkdir(parents=True, exist_ok=True)
    with tarfile.open(archive, 'r:gz') as tar:
        for m in tar.getmembers():
            if not m.name.startswith('quoridor_src/') or '..' in Path(m.name).parts:
                raise RuntimeError(f'unexpected path in bundle: {m.name}')
        try:
            tar.extractall(target_parent, filter='data')
        except TypeError:  # Python without extraction filters; members were checked above
            tar.extractall(target_parent)
    return verify_tree(target_parent / 'quoridor_src')
