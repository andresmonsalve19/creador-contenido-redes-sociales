import { z } from 'zod';
import { DATA_NOTICE, dataBlock } from '../../shared/ai/promptData.js';
import type { Contact } from '../../shared/publishing/contact.js';
import { sceneKinds, sceneRoles, speakingSeconds, wordBudget } from './estimate.js';
import {
  scriptResponseSchema,
  type ReviseScriptBody,
  type SceneKind,
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
- Escenas "presentador": el avatar habla a cámara. "gestures": gestos breves y naturales que acompañan lo que dice (p. ej. "señala con la mano abierta al mencionar los tres pasos, asiente al cerrar"). "visualPrompt" va vacío.
- Escenas "apoyo": se ve una imagen a pantalla completa mientras la misma voz sigue narrando. "visualPrompt": describe en una o dos frases una imagen concreta y atractiva que ilustre exactamente lo que se dice (objetos, lugar, situación, encuadre, luz), coherente con la paleta de la marca. Sin texto, letras, logos ni marcas, y sin personas reconocibles. "gestures" va vacío.
- El guion de las escenas de apoyo se escribe como narración (voz en off), no como si alguien mirara a cámara.

- "onScreenText": texto breve que aparece en pantalla en esa escena. En la primera escena es el gancho (máximo 8 palabras, el mismo mensaje que se dice). En las demás, la palabra o frase clave (máximo 5 palabras), o vacío si no aporta.

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

function contactNote({ email, website, whatsapp }: Contact): string {
  if (!email && !website && !whatsapp) return 'No hay datos de contacto.';
  return [
    'Datos de contacto (no van en "captionBody"; el sitio web o el WhatsApp se pueden mencionar de forma hablada en el cierre, sin dictar el número completo):',
    email && `- Correo: "${email}"`,
    website && `- Sitio web: "${website}"`,
    whatsapp && `- WhatsApp: "${whatsapp}"`,
  ]
    .filter(Boolean)
    .join('\n');
}

const KIND_GUIDE: Record<SceneKind, string> = {
  avatar: '[presentador]',
  broll: '[apoyo: imagen con voz en off]',
};

function plan(
  roles: SceneRole[],
  kinds: SceneKind[],
  cta: string,
  seconds: number,
  wordsPerSecond: number,
) {
  const budget = wordBudget(roles, seconds, wordsPerSecond);
  return roles
    .map(
      (role, index) =>
        `${index + 1}. ${KIND_GUIDE[kinds[index] ?? 'avatar']} ${ROLE_GUIDE[role](cta)} Máximo ${budget[index]} palabras habladas.`,
    )
    .join('\n');
}

/**
 * Edición automática (Video Agent de HeyGen): el video lo arma el agente a partir del guion, así
 * que cada escena necesita una indicación de toma clara y el video un párrafo de estilo.
 */
const AGENT_BRIEF = `Este video lo editará automáticamente un agente de video (HeyGen) que sigue el guion escena por escena: agrega gráficos animados, textos en pantalla, imágenes, transiciones, subtítulos y música.
- En "visualPrompt" de CADA escena escribe la indicación de toma, siguiendo los lineamientos de video si los hay: por ejemplo "Primer plano de la presentadora con el gancho en texto grande", "Plano medio, palabra clave en pantalla", "Pantalla de texto sobre fondo crema con voz en off", "Imagen de apoyo: consultorio luminoso, sin personas", "Cierre: primer plano, luego logo completo con el llamado a la acción". Cambia de toma en cada escena. En las escenas [apoyo] la presentadora no aparece.
- Devuelve "styleParagraph": un párrafo de 5 a 7 frases para el agente con: nombre del estilo, la paleta exacta en HEX tomada de los lineamientos, tipografías, dirección de arte, cómo se mueven los elementos, transiciones, música (tipo y volumen) y las reglas de marca de los lineamientos de video (logo, firma, subtítulos, zona segura). Solo con datos de los archivos de la empresa; no inventes colores ni tipografías.`;

export function buildScriptPrompt(body: ScriptBody, context: ScriptContext) {
  const roles = sceneRoles(body.sceneCount);
  const kinds = sceneKinds(body.sceneCount, body.style);
  const seconds = speakingSeconds(body.durationSeconds, body.brandCards);
  const prompt = `${contextBlocks(context)}

# 5. Temática del usuario
${dataBlock('tematica', body.topic)}

# Encargo
Escribe el guion de un reel de ${body.durationSeconds} segundos (${seconds} s de voz; el resto son tarjetas con el logo) en proporción ${body.aspectRatio}, dividido en ${roles.length} escena(s). Ritmo de referencia: ${body.wordsPerSecond} palabras por segundo.
Llamado a la acción elegido: "${body.cta}".
${contactNote(body.contact)}

Estructura (devuelve exactamente ${roles.length} elemento(s) en "scenes", en este orden):
${plan(roles, kinds, body.cta, seconds, body.wordsPerSecond)}

${body.style === 'agent' ? AGENT_BRIEF : 'Devuelve "styleParagraph" vacío.'}

Además devuelve "concept" (la idea creativa en una o dos frases), "captionBody", "hashtags" e "ignoredByCompliance".`;

  return { system: SYSTEM, prompt, roles, kinds };
}

export function buildRevisionPrompt(body: ReviseScriptBody, context: ScriptContext) {
  const roles = body.scenes.map((scene) => scene.role);
  const kinds = body.scenes.map((scene) => scene.kind);
  const seconds = speakingSeconds(body.durationSeconds, body.brandCards);
  const current = body.scenes
    .map(
      (scene, index) =>
        `${index + 1}. (${scene.role}, ${KIND_GUIDE[scene.kind]}) ${scene.title}\nGuion: ${scene.script}\nSubtítulos: ${scene.subtitleNotes}\nFondo: ${scene.backgroundNote}${scene.kind === 'broll' ? `\nImagen: ${scene.visualPrompt}` : `\nGestos: ${scene.gestures}`}`,
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
Reel de ${body.durationSeconds} segundos (${seconds} s de voz), ritmo de ${body.wordsPerSecond} palabras por segundo. Llamado a la acción: "${body.cta}".
${contactNote(body.contact)}

Devuelve exactamente ${roles.length} escena(s), en este orden:
${plan(roles, kinds, body.cta, seconds, body.wordsPerSecond)}

${
  body.style === 'agent'
    ? `${AGENT_BRIEF}\nPárrafo de estilo actual (consérvalo salvo que los comentarios pidan cambiarlo):\n${dataBlock('estilo_actual', body.styleParagraph)}`
    : 'Devuelve "styleParagraph" vacío.'
}

Además devuelve "concept", "captionBody", "hashtags" e "ignoredByCompliance".`;

  return { system: SYSTEM, prompt, roles, kinds };
}
