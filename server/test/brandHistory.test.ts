import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  backupCurrent,
  listVersions,
  readVersion,
} from '../src/shared/brandContext/brandHistory.js';

describe('historial de los archivos de marca', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'historial-'));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('guarda una copia legible antes de cambiar el archivo', async () => {
    const id = await backupCurrent('design', '# Colores\n#AC704F', dir);
    assert.match(id ?? '', /^design-\d{8}T\d{9}Z\.md$/);
    const [version] = await listVersions(dir);
    assert.equal(version?.kind, 'design');
    assert.deepEqual(await readVersion(id ?? '', dir), {
      kind: 'design',
      content: '# Colores\n#AC704F',
    });
  });

  it('no guarda copias vacías', async () => {
    assert.equal(await backupCurrent('company', '   ', dir), null);
    assert.deepEqual(await listVersions(dir), []);
  });

  it('rechaza ids que no son versiones (sin rutas)', async () => {
    assert.equal(await readVersion('../company.md', dir), null);
    assert.equal(await readVersion('company-x.md', dir), null);
  });
});
