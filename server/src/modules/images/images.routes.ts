import express, { Router } from 'express';
import { promises as fs } from 'node:fs';
import { assertModel, listModels } from '../../shared/ai/modelService.js';
import { parseModelJson } from '../../shared/ai/parseModelJson.js';
import { getProvider } from '../../shared/ai/providers/index.js';
import { getBrandContext } from '../../shared/brandContext/contextStore.js';
import { AppError, badRequest, notReady } from '../../shared/http/errors.js';
import { validate } from '../../shared/http/validate.js';
import {
  getLibraryStore,
  isLibraryImageType,
  newLibraryId,
} from '../../shared/library/libraryStore.js';
import { closestAspectRatio, editImage } from './imageEditor.js';
import { assembleCaption } from '../../shared/publishing/caption.js';
import { formatRulesForPrompt, readRulesFor } from '../../shared/learning/learningStore.js';
import { generateBrandImage } from './imageGenerator.js';
import { PROMPTS_JSON_SCHEMA, buildImagePrompts } from './promptBuilder.js';
import { REVISE_JSON_SCHEMA, buildRevisionPrompt } from './reviseBuilder.js';
import {
  editBody,
  generateBody,
  promptsBody,
  promptsResponseSchema,
  reviseBody,
  reviseResponseSchema,
} from './schemas.js';

export const imagesRouter = Router();

imagesRouter.post('/prompts', express.json(), async (req, res) => {
  const body = validate(promptsBody, req.body);
  await assertModel(body.textModel, 'text');
  const brand = await getBrandContext();
  // Los aprendizajes se consultan en cada generación para que los cambios apliquen de inmediato.
  const learning = formatRulesForPrompt(await readRulesFor('image'));
  const { system, prompt, roles } = buildImagePrompts(body, { ...brand, learning });

  const raw = await getProvider().generateText({
    model: body.textModel,
    system,
    prompt,
    temperature: 0.9,
    jsonSchema: PROMPTS_JSON_SCHEMA,
  });
  const result = parseModelJson(promptsResponseSchema, raw);

  if (result.slides.length !== roles.length) {
    throw new AppError(
      502,
      `Se esperaban ${roles.length} prompts y el modelo devolvió ${result.slides.length}. Inténtalo de nuevo.`,
    );
  }

  res.json({
    concept: result.concept,
    caption: assembleCaption(result.captionBody, result.hashtags, body.contact),
    slides: result.slides.map((slide, index) => ({ ...slide, role: roles[index] })),
  });
});

/** Reescribe el prompt de una sola imagen aplicando los comentarios del usuario. */
imagesRouter.post('/revise-prompt', express.json(), async (req, res) => {
  const body = validate(reviseBody, req.body);
  await assertModel(body.textModel, 'text');
  const brand = await getBrandContext();
  const learning = formatRulesForPrompt(await readRulesFor('image'));

  const raw = await getProvider().generateText({
    model: body.textModel,
    temperature: 0.5,
    jsonSchema: REVISE_JSON_SCHEMA,
    ...buildRevisionPrompt(body, { design: brand.design, learning }),
  });

  res.json({ prompt: parseModelJson(reviseResponseSchema, raw).prompt.trim() });
});

// Las imágenes de referencia viajan en base64, por eso este endpoint admite cuerpos más grandes.
imagesRouter.post('/generate', express.json({ limit: '30mb' }), async (req, res) => {
  const body = validate(generateBody, req.body);
  await assertModel(body.imageModel, 'image');
  const brand = await getBrandContext();
  const image = await generateBrandImage(body, brand);

  // Se guarda en la biblioteca para no perderla aunque no se descargue. Si falla el guardado,
  // la imagen igual se entrega.
  let saved = false;
  if (body.library && isLibraryImageType(image.mimeType)) {
    try {
      await getLibraryStore().saveSlide({
        id: body.library.publicationId,
        kind: body.library.format,
        source: body.library.source,
        title: body.library.title,
        caption: body.library.caption,
        aspectRatio: body.aspectRatio,
        index: body.library.index,
        mimeType: image.mimeType,
        data: Buffer.from(image.data, 'base64'),
      });
      saved = true;
    } catch (error) {
      console.error(
        `No se pudo guardar la imagen en la biblioteca: ${error instanceof Error ? error.message : 'error desconocido'}`,
      );
    }
  }
  res.json({ image, saved });
});

/**
 * Edita una imagen propia (subida o de la biblioteca) con instrucciones, opcionalmente con el
 * logo, la paleta y la identidad de la marca. El resultado se guarda en la biblioteca.
 */
imagesRouter.post('/edit', express.json({ limit: '30mb' }), async (req, res) => {
  const body = validate(editBody, req.body);
  const model = body.imageModel ?? (await listModels('image')).recommendedId;
  if (!model) throw notReady('Tu API key de Gemini no tiene modelos de imagen disponibles.');
  await assertModel(model, 'image');

  const store = getLibraryStore();
  let image = body.image.type === 'upload' ? body.image.image : null;
  if (body.image.type === 'library') {
    const file = await store.slideFile(body.image.id, body.image.index);
    if (!file) throw badRequest('Esa imagen ya no está en la biblioteca.');
    image = { mimeType: file.mimeType, data: (await fs.readFile(file.path)).toString('base64') };
  }
  if (!image) throw badRequest('Adjunta la imagen que quieres editar.');

  const aspectRatio =
    body.aspectRatio === 'original' ? await closestAspectRatio(image) : body.aspectRatio;
  const brand = body.applyBrand ? await getBrandContext() : null;
  const result = await editImage({
    model,
    image,
    instructions: body.instructions,
    aspectRatio,
    brand,
  });

  if (!isLibraryImageType(result.mimeType)) {
    throw new AppError(502, 'El modelo devolvió un formato de imagen no admitido.');
  }
  const libraryId = body.libraryId ?? newLibraryId();
  await store.saveSlide({
    id: libraryId,
    kind: 'edit',
    source: body.source,
    title: body.title || 'Imagen editada',
    caption: '',
    aspectRatio,
    index: 0,
    mimeType: result.mimeType,
    data: Buffer.from(result.data, 'base64'),
  });
  res.json({ image: result, libraryId, aspectRatio });
});
