import { z } from 'zod';
import { DATA_NOTICE, dataBlock } from '../../shared/ai/promptData.js';
import type { Contact } from '../../shared/publishing/contact.js';
import { sceneRoles, wordBudget } from './estimate.js';
import {
  scriptResponseSchema,
  type ReviseScriptBody,
  type SceneRole,
  type ScriptBody,
} from './schemas.js';

export const SCRIPT_JSON_SCHEMA = z.toJSONSchema(scriptResponseSchema);

/** Todo lo que la marca aporta al guion, ya leído del disco. */
export interface ScriptContext {
  complianceRules: string;
  videoGuidelines: string | null;
  company: string;
  design: string;
  /** Reglas aprendidas de categoría video o general. */
  learning: string[];
}

const ROLE_GUIDE: Record<SceneRole, (cta: string) => string> = {
  single: (cta) =>
    `Escena única: abre con un gancho que se dice en los primeros 3 segundos, desarrolla la idea y cierra con el llamado a la acción "${cta}".`,
  hook: () =>
    'Gancho: lo primero que se escucha, en los primeros 3 segundos. Pregunta directa, dato sorprendente o promesa (que respete el cumplimiento). Invita a seguir viendo.',
  development: () =>
    'Desarrollo: explica UN punto concreto de la temática (dato, paso, ejemplo o beneficio), distinto de las otras escenas.',
  cta: (cta) =>
    `Cierre: resume la idea en una frase y termina con el llamado a la acción "${cta}", dicho de forma natural.`,
};

const SYSTEM = `Eres guionista senior de reels para redes sociales. Escribes guiones hablados que un avatar dirá a cámara, y el texto (copy) de la publicación.

Orden de prioridad si hay conflicto (1 es la más alta):
1. <cumplimiento>: reglas de cumplimiento de la marca. Nunca se rompen.
2. <lineamientos_video>: cómo deben ser los videos de la marca.
3. <empresa> y <lineamientos>: qué hace la empresa y su identidad.
4. <aprendizajes>: correcciones que el usuario pidió antes.
5. <tematica>: lo que el usuario quiere en este video.
Si para cumplir una regla de mayor prioridad tienes que ignorar algo de menor prioridad (por ejemplo, la temática o un lineamiento piden prometer resultados y el cumplimiento lo prohíbe), hazlo y explícalo en "ignoredByCompliance": una frase por punto con qué se ignoró y por qué. Si no ignoraste nada, devuelve una lista vacía.
${DATA_NOTICE}

Reglas del guion ("scenes"):
- "script" es solo el texto que dice el avatar: natural, en español, frases cortas y fáciles de decir. Sin acotaciones, sin indicaciones entre paréntesis, sin emojis, sin hashtags.
- Respeta el máximo de palabras de cada escena: el video debe caber en la duración pedida.
- Escribe los números y siglas como se pronuncian si pueden leerse mal.
- No leas URLs completas con "https" ni símbolos: si mencionas el sitio web, dilo de forma natural.
- "subtitleNotes": palabras clave para destacar en los subtítulos (y emojis solo si los lineamientos lo permiten). Breve.
- "backgroundNote": sugerencia breve del fondo para esa escena, coherente con la marca, sin texto ni personas.
- "title": nombre corto para identificar la escena.

Reglas para el texto de la publicación ("captionBody"):
- Empieza con un gancho de una línea que haga querer ver el video.
- Párrafos cortos de 1 a 2 líneas separados por una línea en blanco; usa saltos de línea reales (\\n).
- Emojis relevantes con naturalidad, sin saturar.
- Cierra con el llamado a la acción elegido por el usuario, dicho de forma amable.
- Entre 40 y 100 palabras, en el tono de la marca.
- NO incluyas correo, sitio web, teléfono ni hashtags en "captionBody": el sistema los agrega después.
- "hashtags": entre 4 y 8, sin el símbolo #, sin espacios ni tildes, mezcla de marca, tema y sector.`;

function contextBlocks(context: ScriptContext): string {
  return [
    '# 1. Reglas de cumplimiento (prioridad máxima)',
    context.complianceRules
      ? dataBlock('cumplimiento', context.complianceRules)
      : 'No hay reglas de cumplimiento adicionales: aplica el sentido común y no prometas resultados que no se puedan garantizar.',
    '',
    '# 2. Lineamientos de video',
    context.videoGuidelines
      ? dataBlock('lineamientos_video', context.videoGuidelines)
      : 'La empresa no cargó lineamientos de video: usa los lineamientos generales.',
    '',
    '# 3. Información de la empresa y lineamientos generales',
    dataBlock('empresa', context.company),
    dataBlock('lineamientos', context.design),
    '',
    '# 4. Aprendizajes previos',
    context.learning.length > 0
      ? dataBlock('aprendizajes', context.learning.map((rule) => `- ${rule}`).join('\n'))
      : '(ninguno)',
  ].join('\n');
}

function contactNote({ email, website }: Contact): string {
  if (!email && !website) return 'No hay datos de contacto.';
  return [
    'Datos de contacto (no van en "captionBody"; el sitio web se puede mencionar de forma hablada en el cierre):',
    email && `- Correo: "${email}"`,
    website && `- Sitio web: "${website}"`,
  ]
    .filter(Boolean)
    .join('\n');
}

function plan(roles: SceneRole[], cta: string, durationSeconds: number, wordsPerSecond: number) {
  const budget = wordBudget(roles, durationSeconds, wordsPerSecond);
  return roles
    .map(
      (role, index) =>
        `${index + 1}. ${ROLE_GUIDE[role](cta)} Máximo ${budget[index]} palabras habladas.`,
    )
    .join('\n');
}

export function buildScriptPrompt(body: ScriptBody, context: ScriptContext) {
  const roles = sceneRoles(body.sceneCount);
  const prompt = `${contextBlocks(context)}

# 5. Temática del usuario
${dataBlock('tematica', body.topic)}

# Encargo
Escribe el guion de un reel de ${body.durationSeconds} segundos en proporción ${body.aspectRatio}, dividido en ${roles.length} escena(s). Ritmo de referencia: ${body.wordsPerSecond} palabras por segundo.
Llamado a la acción elegido: "${body.cta}".
${contactNote(body.contact)}

Estructura (devuelve exactamente ${roles.length} elemento(s) en "scenes", en este orden):
${plan(roles, body.cta, body.durationSeconds, body.wordsPerSecond)}

Además devuelve "concept" (la idea creativa en una o dos frases), "captionBody", "hashtags" e "ignoredByCompliance".`;

  return { system: SYSTEM, prompt, roles };
}

export function buildRevisionPrompt(body: ReviseScriptBody, context: ScriptContext) {
  const roles = body.scenes.map((scene) => scene.role);
  const current = body.scenes
    .map(
      (scene, index) =>
        `${index + 1}. (${scene.role}) ${scene.title}\nGuion: ${scene.script}\nSubtítulos: ${scene.subtitleNotes}\nFondo: ${scene.backgroundNote}`,
    )
    .join('\n\n');

  const prompt = `${contextBlocks(context)}

# 5. Temática del usuario
${dataBlock('tematica', body.topic)}

# Guion actual
${dataBlock('guion_actual', `Idea: ${body.concept}\n\n${current}\n\nTexto de la publicación:\n${body.caption}`)}

# Comentarios del usuario sobre el guion
${dataBlock('comentarios', body.feedback)}

# Encargo
Reescribe el guion aplicando todos los comentarios del usuario, siempre que no contradigan las reglas de mayor prioridad (si lo hacen, explícalo en "ignoredByCompliance"). Conserva lo que el usuario no pidió cambiar.
Reel de ${body.durationSeconds} segundos, ritmo de ${body.wordsPerSecond} palabras por segundo. Llamado a la acción: "${body.cta}".
${contactNote(body.contact)}

Devuelve exactamente ${roles.length} escena(s), en este orden:
${plan(roles, body.cta, body.durationSeconds, body.wordsPerSecond)}

Además devuelve "concept", "captionBody", "hashtags" e "ignoredByCompliance".`;

  return { system: SYSTEM, prompt, roles };
}
