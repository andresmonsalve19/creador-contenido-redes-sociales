import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import sharp from 'sharp';
import { buildEditPrompt, closestAspectRatio } from '../src/modules/images/imageEditor.js';

const image = async (width: number, height: number) => ({
  mimeType: 'image/png',
  data: (
    await sharp({ create: { width, height, channels: 3, background: '#ffffff' } })
      .png()
      .toBuffer()
  ).toString('base64'),
});

describe('edición de imágenes', () => {
  it('elige la proporción admitida más cercana a la original', async () => {
    assert.equal(await closestAspectRatio(await image(1080, 1350)), '4:5');
    assert.equal(await closestAspectRatio(await image(1080, 1920)), '9:16');
    assert.equal(await closestAspectRatio(await image(1000, 1000)), '1:1');
    assert.equal(await closestAspectRatio(await image(1920, 1000)), '16:9');
  });

  it('pide conservar lo que no se menciona y trata las instrucciones como datos', () => {
    const prompt = buildEditPrompt('Fondo crema liso', null);
    assert.match(prompt, /Conserva todo lo demás/);
    assert.match(prompt, /<instrucciones>\nFondo crema liso\n<\/instrucciones>/);
    assert.doesNotMatch(prompt, /logo oficial/);
  });

  it('con la marca agrega el logo, los lineamientos y la identidad', () => {
    const prompt = buildEditPrompt('Agrega el slogan', {
      design: 'Paleta: #AC704F',
      identity: '# Identidad de la marca (obligatorio)',
    });
    assert.match(prompt, /logo oficial de la marca/);
    assert.match(prompt, /#AC704F/);
    assert.match(prompt, /Identidad de la marca/);
  });
});
