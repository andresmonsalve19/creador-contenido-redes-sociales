import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { createLibraryStore } from '../src/shared/library/libraryStore.js';

const ID = 'aaaaaaaa-0000-4000-8000-000000000001';

describe('biblioteca', () => {
  let root: string;
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'biblioteca-'));
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  const slide = (index: number, data: string) => ({
    id: ID,
    kind: 'carousel' as const,
    source: 'app' as const,
    title: 'Mitos de implantes',
    caption: 'Texto',
    aspectRatio: '4:5',
    index,
    mimeType: 'image/png' as const,
    data: Buffer.from(data),
  });

  it('guarda cada imagen de un carrusel en la misma pieza, en orden', async () => {
    const store = createLibraryStore(root);
    await store.saveSlide(slide(1, 'b'));
    await store.saveSlide(slide(0, 'a'));
    const [item] = await store.list();
    assert.equal(item?.title, 'Mitos de implantes');
    assert.deepEqual(
      item?.slides.map((s) => s.index),
      [0, 1],
    );
    const file = await store.slideFile(ID, 1);
    assert.equal(await fs.readFile(file?.path ?? '', 'utf8'), 'b');
  });

  it('un ajuste reemplaza la imagen en lugar de duplicarla', async () => {
    const store = createLibraryStore(root);
    await store.saveSlide(slide(0, 'primera'));
    await store.saveSlide({ ...slide(0, 'ajustada'), mimeType: 'image/jpeg' });
    const [item] = await store.list();
    assert.equal(item?.slides.length, 1);
    const file = await store.slideFile(ID, 0);
    assert.equal(await fs.readFile(file?.path ?? '', 'utf8'), 'ajustada');
    assert.deepEqual(await fs.readdir(path.join(root, ID)), ['01.jpg']);
  });

  it('borrar elimina la pieza y sus archivos', async () => {
    const store = createLibraryStore(root);
    await store.saveSlide(slide(0, 'a'));
    await store.remove(ID);
    assert.deepEqual(await store.list(), []);
    await assert.rejects(fs.access(path.join(root, ID)));
  });
});
