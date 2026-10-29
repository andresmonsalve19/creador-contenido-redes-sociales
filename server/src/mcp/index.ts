import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

/**
 * Servidor MCP para Claude Desktop (piloto). Claude dirige y la app ejecuta: lee la marca, crea y
 * edita imágenes con Gemini y consulta la biblioteca. Habla con la app que ya está abierta
 * (iniciar.bat) por HTTP local, así las API keys nunca pasan por aquí. Todo lo que se crea queda
 * en "Mis contenidos".
 *
 * stdout es el canal del protocolo: los mensajes de diagnóstico van a stderr.
 */

const APP_URL = (process.env.APP_URL ?? 'http://127.0.0.1:3001').replace(/\/$/, '');
/** Las imágenes vuelven a Claude reducidas: suficiente para revisarlas y mucho más livianas. */
const PREVIEW_PX = 768;
const ASPECTS = ['1:1', '4:5', '3:4', '9:16', '16:9'] as const;
const MAX_CAROUSEL = 5;

class AppUnavailableError extends Error {}

async function app<T>(path: string, init: { method?: string; json?: unknown } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${APP_URL}/api${path}`, {
      method: init.method ?? 'GET',
      headers: init.json === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: init.json === undefined ? undefined : JSON.stringify(init.json),
    });
  } catch {
    throw new AppUnavailableError(
      'La app "Creador de contenido" no está abierta. Ábrela con iniciar.bat y vuelve a intentarlo.',
    );
  }
  const body = (await response.json().catch(() => null)) as
    (T & { error?: { message?: string } }) | null;
  if (!response.ok) {
    throw new Error(body?.error?.message ?? `La app respondió con el error ${response.status}.`);
  }
  return body as T;
}

/**
 * Vista previa reducida (JPEG) de una imagen de la biblioteca, para mostrarla a Claude. La reduce
 * la app: así este servidor no necesita componentes nativos y funciona igual en cualquier equipo.
 */
async function preview(id: string, index: number) {
  const response = await fetch(`${APP_URL}/api/library/${id}/${index}?preview=${PREVIEW_PX}`).catch(
    () => {
      throw new AppUnavailableError('La app "Creador de contenido" no está abierta.');
    },
  );
  if (!response.ok) throw new Error('No se encontró esa imagen en la biblioteca.');
  const data = Buffer.from(await response.arrayBuffer()).toString('base64');
  return { type: 'image' as const, data, mimeType: 'image/jpeg' };
}

/** Si la imagen no se pudo guardar en la biblioteca, se muestra tal como llegó. */
const rawImage = (image: InlineImage) => ({
  type: 'image' as const,
  data: image.data,
  mimeType: image.mimeType,
});

const text = (value: string) => ({ type: 'text' as const, text: value });

/** Los errores vuelven a Claude como resultado de la herramienta, para que pueda explicarlos. */
function failure(error: unknown) {
  return {
    isError: true,
    content: [text(error instanceof Error ? error.message : 'Error inesperado.')],
  };
}

async function recommendedModel(kind: 'text' | 'image'): Promise<string> {
  const { recommendedId } = await app<{ recommendedId: string | null }>(`/models?kind=${kind}`);
  if (!recommendedId)
    throw new Error(
      `No hay modelos de ${kind === 'text' ? 'texto' : 'imagen'} disponibles en Gemini.`,
    );
  return recommendedId;
}

interface InlineImage {
  mimeType: string;
  data: string;
}

const server = new McpServer({ name: 'creador-de-contenido', version: '0.1.0' });

server.registerTool(
  'leer_marca',
  {
    title: 'Leer la marca',
    description:
      'Devuelve todo lo que la app sabe de la marca: información de la empresa, lineamientos de diseño (colores HEX y tipografía), lineamientos de video, slogans y frases oficiales, indicaciones de identidad, asociaciones que la respaldan y reglas de cumplimiento. Léela antes de crear contenido.',
    annotations: { readOnlyHint: true },
  },
  async () => {
    try {
      const [context, identity, video] = await Promise.all([
        app<{
          company: { content: string } | null;
          design: { content: string } | null;
          videoGuidelines: { content: string } | null;
        }>('/context'),
        app<{
          identity: {
            slogans: string[];
            phrases: string[];
            notes: string;
            partners: { name: string; usage: string }[];
          };
        }>('/context/identity'),
        app<{ settings: { complianceRules: string } }>('/video/settings').catch(() => null),
      ]);
      const { slogans, phrases, notes, partners } = identity.identity;
      const sections = [
        ['Información de la empresa', context.company?.content],
        ['Lineamientos de diseño', context.design?.content],
        ['Lineamientos de video', context.videoGuidelines?.content],
        ['Slogans oficiales (textuales)', slogans.map((s) => `- "${s}"`).join('\n')],
        ['Frases representativas', phrases.map((p) => `- "${p}"`).join('\n')],
        ['Indicaciones de identidad y tono', notes],
        [
          'Asociaciones que respaldan a la marca',
          partners
            .map(
              (p) =>
                `- ${p.name} (${p.usage === 'always' ? 'logo en todas las piezas' : 'logo solo en el cierre'})`,
            )
            .join('\n'),
        ],
        ['Reglas de cumplimiento (prioridad máxima)', video?.settings.complianceRules],
      ];
      return {
        content: [
          text(
            sections
              .filter(([, body]) => body && body.trim())
              .map(([title, body]) => `# ${title}\n${body?.trim()}`)
              .join('\n\n'),
          ),
        ],
      };
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  'crear_imagen',
  {
    title: 'Crear una imagen',
    description:
      'Genera UNA imagen para Instagram con Gemini a partir de tu propia dirección de arte. La app agrega el logo real de la marca y los logos de asociaciones como referencia. Escribe en "prompt" un párrafo detallado en español: escena, composición, colores HEX de la marca, tipografía y el texto exacto entre comillas. Se guarda en "Mis contenidos" y te devuelve una vista previa. Tarda alrededor de un minuto y consume saldo de Gemini.',
    inputSchema: {
      prompt: z.string().min(20).max(8000).describe('Dirección de arte completa de la imagen.'),
      proporcion: z.enum(ASPECTS).default('4:5').describe('4:5 para el feed, 9:16 para historias.'),
      titulo: z.string().max(200).describe('Nombre para encontrarla en "Mis contenidos".'),
      texto_publicacion: z
        .string()
        .max(5000)
        .default('')
        .describe('Texto (caption) de la publicación, si ya lo escribiste.'),
    },
  },
  async ({ prompt, proporcion, titulo, texto_publicacion }) => {
    try {
      const imageModel = await recommendedModel('image');
      const publicationId = randomUUID();
      const { image, saved } = await app<{ image: InlineImage; saved: boolean }>(
        '/images/generate',
        {
          method: 'POST',
          json: {
            imageModel,
            aspectRatio: proporcion,
            role: 'single',
            prompt,
            library: {
              publicationId,
              index: 0,
              format: 'single',
              title: titulo,
              caption: texto_publicacion,
              source: 'claude',
            },
          },
        },
      );
      return {
        content: [
          text(
            saved
              ? `Imagen creada y guardada en "Mis contenidos" (pieza ${publicationId}, imagen 0).`
              : 'Imagen creada, pero no se pudo guardar en "Mis contenidos": descárgala desde aquí.',
          ),
          saved ? await preview(publicationId, 0) : rawImage(image),
        ],
      };
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  'crear_publicacion',
  {
    title: 'Crear una publicación completa',
    description: `Crea una publicación completa con el flujo de la app: Gemini escribe los prompts con la marca y el texto de la publicación, y genera las imágenes (un carrusel mantiene el estilo de la primera). Úsala cuando quieras que la app proponga el diseño a partir de un tema. Máximo ${MAX_CAROUSEL} imágenes en este piloto. Tarda varios minutos (cerca de un minuto por imagen) y consume saldo de Gemini.`,
    inputSchema: {
      tema: z.string().min(3).max(1000).describe('Temática, con el enfoque y los datos clave.'),
      formato: z.enum(['single', 'carousel']).describe('single = una imagen; carousel = varias.'),
      imagenes: z.number().int().min(1).max(MAX_CAROUSEL).default(1),
      proporcion: z.enum(ASPECTS).default('4:5'),
      llamado_accion: z.string().min(2).max(80).describe('Ej.: "Agenda tu valoración".'),
      correo: z.string().max(200).default(''),
      sitio_web: z.string().max(200).default(''),
      whatsapp: z.string().max(40).default(''),
    },
  },
  async ({ tema, formato, imagenes, proporcion, llamado_accion, correo, sitio_web, whatsapp }) => {
    try {
      const count = formato === 'single' ? 1 : Math.max(2, imagenes);
      const [textModel, imageModel] = await Promise.all([
        recommendedModel('text'),
        recommendedModel('image'),
      ]);
      const contact = { email: correo, website: sitio_web, whatsapp };
      const prompts = await app<{
        caption: string;
        slides: { title: string; prompt: string; role: string }[];
      }>('/images/prompts', {
        method: 'POST',
        json: {
          textModel,
          format: formato,
          slideCount: count,
          topic: tema,
          aspectRatio: proporcion,
          contact,
          cta: llamado_accion,
        },
      });

      const publicationId = randomUUID();
      const previews = [];
      let styleReference: InlineImage | undefined;
      for (const [index, slide] of prompts.slides.entries()) {
        const { image, saved } = await app<{ image: InlineImage; saved: boolean }>(
          '/images/generate',
          {
            method: 'POST',
            json: {
              imageModel,
              aspectRatio: proporcion,
              role: slide.role,
              prompt: slide.prompt,
              ...(styleReference ? { styleReference } : {}),
              library: {
                publicationId,
                index,
                format: formato,
                title: tema.slice(0, 200),
                caption: prompts.caption,
                source: 'claude',
              },
            },
          },
        );
        if (index === 0 && formato === 'carousel') styleReference = image;
        previews.push(saved ? await preview(publicationId, index) : rawImage(image));
      }

      return {
        content: [
          text(
            `Publicación creada y guardada en "Mis contenidos" (pieza ${publicationId}, ${previews.length} imagen(es), índices 0 a ${previews.length - 1}).\n\nTexto de la publicación:\n${prompts.caption}`,
          ),
          ...previews,
        ],
      };
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  'editar_imagen',
  {
    title: 'Editar una imagen de la biblioteca',
    description:
      'Edita una imagen de "Mis contenidos" con instrucciones (Gemini). Cambia solo lo pedido y conserva lo demás. Con aplicar_marca agrega el logo, la paleta y la identidad de la marca a lo que se agregue. El resultado se guarda como una pieza nueva; la original no se toca. No uses esto para alterar cuerpos o resultados en fotos de pacientes. Tarda alrededor de un minuto y consume saldo de Gemini.',
    inputSchema: {
      pieza_id: z.uuid().describe('Id de la pieza (de ver_biblioteca).'),
      indice: z.number().int().min(0).max(9).default(0).describe('Imagen dentro de la pieza.'),
      instrucciones: z.string().min(3).max(2000),
      aplicar_marca: z.boolean().default(true),
      proporcion: z.enum(['original', ...ASPECTS]).default('original'),
      titulo: z.string().max(200).default('Imagen editada por Claude'),
    },
  },
  async ({ pieza_id, indice, instrucciones, aplicar_marca, proporcion, titulo }) => {
    try {
      const result = await app<{ image: InlineImage; libraryId: string }>('/images/edit', {
        method: 'POST',
        json: {
          image: { type: 'library', id: pieza_id, index: indice },
          instructions: instrucciones,
          applyBrand: aplicar_marca,
          aspectRatio: proporcion,
          title: titulo,
          source: 'claude',
        },
      });
      return {
        content: [
          text(
            `Imagen editada y guardada en "Mis contenidos" (pieza ${result.libraryId}, imagen 0).`,
          ),
          await preview(result.libraryId, 0),
        ],
      };
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  'ver_biblioteca',
  {
    title: 'Ver "Mis contenidos"',
    description:
      'Lista las piezas guardadas en la biblioteca (las más recientes primero): id, título, tipo, fecha, cantidad de imágenes y origen. Úsala para no repetir temas o para elegir qué editar.',
    inputSchema: { cantidad: z.number().int().min(1).max(100).default(20) },
    annotations: { readOnlyHint: true },
  },
  async ({ cantidad }) => {
    try {
      const { items } = await app<{
        items: {
          id: string;
          kind: string;
          source: string;
          title: string;
          caption: string;
          updatedAt: string;
          slides: unknown[];
        }[];
      }>('/library');
      if (items.length === 0) return { content: [text('La biblioteca está vacía.')] };
      const lines = items
        .slice(0, cantidad)
        .map(
          (item) =>
            `- ${item.id} | ${item.title || 'Sin título'} | ${item.kind} | ${item.updatedAt.slice(0, 10)} | ${item.slides.length} imagen(es) | origen: ${item.source}${item.caption ? ` | texto: ${item.caption.slice(0, 120).replace(/\s+/g, ' ')}…` : ''}`,
        );
      return { content: [text(`${items.length} pieza(s) en total.\n${lines.join('\n')}`)] };
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  'ver_imagen',
  {
    title: 'Ver una imagen de la biblioteca',
    description: 'Muestra una imagen guardada en "Mis contenidos" para revisarla.',
    inputSchema: {
      pieza_id: z.uuid(),
      indice: z.number().int().min(0).max(9).default(0),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ pieza_id, indice }) => {
    try {
      return { content: [await preview(pieza_id, indice)] };
    } catch (error) {
      return failure(error);
    }
  },
);

// --- Mejorar los archivos de marca -----------------------------------------------------------

const BRAND_FILES = {
  empresa: { kind: 'company', label: 'Información de la empresa' },
  diseno: { kind: 'design', label: 'Lineamientos de diseño' },
  video: { kind: 'videoGuidelines', label: 'Lineamientos de video' },
} as const;
const BRAND_FILE_NAMES = Object.keys(BRAND_FILES) as [
  keyof typeof BRAND_FILES,
  ...(keyof typeof BRAND_FILES)[],
];
const KIND_LABEL: Record<string, string> = {
  company: 'empresa',
  design: 'diseno',
  videoGuidelines: 'video',
  identity: 'identidad (slogans y frases)',
};

server.registerTool(
  'leer_archivo_marca',
  {
    title: 'Leer un archivo de marca',
    description:
      'Devuelve el contenido exacto, completo y sin cambios de un archivo de marca en Markdown: empresa, diseno (colores y tipografía) o video (lineamientos de reels). Úsalo antes de mejorarlo con actualizar_archivo_marca.',
    inputSchema: { archivo: z.enum(BRAND_FILE_NAMES) },
    annotations: { readOnlyHint: true },
  },
  async ({ archivo }) => {
    try {
      const context = await app<Record<string, { content: string } | null>>('/context');
      const file = context[BRAND_FILES[archivo].kind];
      return {
        content: [text(file?.content ?? `El archivo "${archivo}" todavía no se ha cargado.`)],
      };
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  'actualizar_archivo_marca',
  {
    title: 'Mejorar un archivo de marca',
    description: `Reemplaza un archivo de marca (empresa, diseno o video) con una versión mejorada. Toda la app lo usa al crear contenido, así que:
1. Lee primero el contenido actual con leer_archivo_marca y parte de él completo.
2. Antes de llamar a esta herramienta, muestra al usuario un resumen de los cambios y espera su confirmación.
3. Conserva toda la información existente salvo que el usuario pida quitarla.
4. No inventes datos: ni servicios, cifras, precios, títulos, certificaciones, testimonios ni resultados médicos. Si falta algo, déjalo marcado con [CONFIRMAR].
5. Respeta las normas de publicidad en salud: no prometas ni garantices resultados.
6. Formato que la app lee automáticamente: en diseno, los colores en formato HEX (#RRGGBB) dentro de una tabla con su rol; en video, una línea que empiece por "Voz" describiendo la voz; en empresa, el sitio web completo.
Antes de cambiarlo, la app guarda la versión anterior. Para deshacer, usa restaurar_version_marca.`,
    inputSchema: {
      archivo: z.enum(BRAND_FILE_NAMES),
      contenido: z.string().min(50).max(300_000).describe('El archivo completo en Markdown.'),
      resumen_cambios: z.string().min(3).max(2000).describe('Qué cambiaste y por qué.'),
    },
  },
  async ({ archivo, contenido }) => {
    try {
      const { backupId } = await app<{ backupId: string | null }>(
        `/context/markdown/${BRAND_FILES[archivo].kind}`,
        { method: 'PUT', json: { content: contenido } },
      );
      return {
        content: [
          text(
            `${BRAND_FILES[archivo].label}: guardado. Lo usarán desde ahora las imágenes, los reels y las sugerencias de temas.${backupId ? ` Versión anterior guardada como ${backupId}; para deshacer, usa restaurar_version_marca con ese id.` : ''}`,
          ),
        ],
      };
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  'actualizar_identidad',
  {
    title: 'Actualizar slogans, frases e identidad',
    description:
      'Reemplaza los slogans oficiales, las frases representativas y las indicaciones de identidad y tono. La app los usa textualmente en todo el contenido. Envía la lista completa: lo que no incluyas se quita, así que lee antes lo actual con leer_marca. Muestra al usuario los cambios y espera su confirmación antes de llamarla. La versión anterior queda guardada (ver restaurar_version_marca). No cambia los logos de asociaciones.',
    inputSchema: {
      slogans: z.array(z.string().min(2).max(160)).max(20),
      frases: z.array(z.string().min(2).max(300)).max(40),
      indicaciones: z
        .string()
        .max(3000)
        .describe('Tono, palabras que sí y que no, cómo nombrar a la doctora…'),
    },
  },
  async ({ slogans, frases, indicaciones }) => {
    try {
      const { backupId } = await app<{ backupId: string | null }>('/context/identity', {
        method: 'PUT',
        json: { slogans, phrases: frases, notes: indicaciones },
      });
      return {
        content: [
          text(
            `Identidad guardada: ${slogans.length} slogan(s) y ${frases.length} frase(s).${backupId ? ` Versión anterior: ${backupId}.` : ''}`,
          ),
        ],
      };
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  'ver_versiones_marca',
  {
    title: 'Ver versiones anteriores de la marca',
    description:
      'Lista las copias guardadas automáticamente antes de cada cambio a los archivos de marca y a la identidad, las más recientes primero. Con ver_version_marca puedes leer una y con restaurar_version_marca volver a ella.',
    annotations: { readOnlyHint: true },
  },
  async () => {
    try {
      const { versions } = await app<{
        versions: { id: string; kind: string; savedAt: string; bytes: number }[];
      }>('/context/versions');
      if (versions.length === 0) return { content: [text('Aún no hay versiones guardadas.')] };
      return {
        content: [
          text(
            versions
              .map(
                (v) =>
                  `- ${v.id} | ${KIND_LABEL[v.kind] ?? v.kind} | guardada ${v.savedAt.replace('T', ' ').slice(0, 19)} UTC | ${Math.round(v.bytes / 1024)} KB`,
              )
              .join('\n'),
          ),
        ],
      };
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  'ver_version_marca',
  {
    title: 'Leer una versión anterior',
    description: 'Devuelve el contenido de una versión guardada, para compararla con la actual.',
    inputSchema: { version_id: z.string().min(5).max(80) },
    annotations: { readOnlyHint: true },
  },
  async ({ version_id }) => {
    try {
      const version = await app<{ content: string }>(
        `/context/versions/${encodeURIComponent(version_id)}`,
      );
      return { content: [text(version.content)] };
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  'restaurar_version_marca',
  {
    title: 'Volver a una versión anterior',
    description:
      'Deshace cambios: vuelve un archivo de marca (o la identidad) a una versión guardada. La versión actual también queda guardada antes, así que se puede volver a ella. Confirma con el usuario antes de usarla.',
    inputSchema: { version_id: z.string().min(5).max(80) },
  },
  async ({ version_id }) => {
    try {
      const restored = await app<{ kind: string; backupId: string | null }>(
        `/context/versions/${encodeURIComponent(version_id)}/restore`,
        { method: 'POST' },
      );
      return {
        content: [
          text(
            `Restaurado: ${KIND_LABEL[restored.kind] ?? restored.kind}.${restored.backupId ? ` La versión que había quedó guardada como ${restored.backupId}.` : ''}`,
          ),
        ],
      };
    } catch (error) {
      return failure(error);
    }
  },
);

// --- Videos con el agente de HeyGen, avatares y ropa ------------------------------------------

/** Imagen remota (p. ej. storyboard o vista previa de HeyGen) para mostrarla a Claude. */
async function remoteImage(url: string | null | undefined) {
  if (!url?.startsWith('https://')) return null;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    const type = response.headers.get('content-type') ?? '';
    if (!response.ok || !/^image\/(png|jpeg|webp|gif)/.test(type)) return null;
    const data = Buffer.from(await response.arrayBuffer());
    if (data.length > 1_500_000) return null;
    return {
      type: 'image' as const,
      data: data.toString('base64'),
      mimeType: type.split(';')[0] ?? 'image/jpeg',
    };
  } catch {
    return null;
  }
}

interface Avatar {
  id: string;
  name: string;
  type: string;
  ownership: 'public' | 'private';
  gender: string | null;
  defaultVoiceId: string | null;
  orientation: string | null;
  engines: string[];
  previewImageUrl: string | null;
}

const avatarLine = (a: Avatar) =>
  `- ${a.id} | ${a.name} | ${a.ownership === 'private' ? 'PROPIO' : 'stock'} | ${a.type} | ${a.gender ?? 'sin género'} | ${a.orientation ?? ''} | ${a.engines.includes('avatar_v') ? 'Avatar V' : 'Avatar IV'} | voz original: ${a.defaultVoiceId ?? 'ninguna'}`;

const JOB_STATUS: Record<string, string> = {
  queued: 'en cola',
  drafting: 'el agente de HeyGen está preparando el storyboard',
  reviewing: 'storyboard listo: revísalo y apruébalo o pide cambios',
  pending: 'HeyGen recibió el video',
  processing: 'HeyGen está generando el video',
  completed: 'terminado',
  failed: 'falló',
};

interface Job {
  id: string;
  createdAt: string;
  status: string;
  videoUrl: string | null;
  durationSeconds: number | null;
  error: { mensaje: string } | null;
  spec: { title: string; style: string };
  agent?: {
    progress: number | null;
    messages: { role: string; content: string }[];
    storyboard: { url: string | null; thumbnailUrl: string | null }[];
  } | null;
}

server.registerTool(
  'listar_avatares',
  {
    title: 'Listar avatares',
    description:
      'Lista los avatares disponibles (solo los compatibles con Avatar IV o V). Los PROPIOS (gemelo digital o de foto de una persona real de la marca) aparecen primero: son los únicos a los que se les puede cambiar la ropa con cambiar_ropa_avatar. Incluye la voz original de cada uno.',
    inputSchema: {
      solo_propios: z.boolean().default(false),
      genero: z.enum(['female', 'male']).optional(),
      buscar: z.string().max(80).default('').describe('Parte del nombre.'),
      cantidad: z.number().int().min(1).max(100).default(30),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ solo_propios, genero, buscar, cantidad }) => {
    try {
      const { avatars } = await app<{ avatars: Avatar[] }>('/video/avatars');
      const text_ = buscar.trim().toLowerCase();
      const list = avatars
        .filter((a) => !solo_propios || a.ownership === 'private')
        .filter((a) => !genero || a.gender === genero)
        .filter((a) => !text_ || a.name.toLowerCase().includes(text_))
        .sort((a, b) => Number(b.ownership === 'private') - Number(a.ownership === 'private'));
      if (list.length === 0) return { content: [text('No hay avatares con ese filtro.')] };
      return {
        content: [
          text(
            `${list.length} avatar(es). Formato: id | nombre | propio o stock | tipo | género | orientación | motor | voz original\n${list.slice(0, cantidad).map(avatarLine).join('\n')}`,
          ),
        ],
      };
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  'ver_looks_avatar',
  {
    title: 'Ver los looks (ropa) de un avatar',
    description:
      'Muestra los otros looks del mismo avatar (otra ropa, pose o fondo), con vista previa. Para un avatar de stock es la única forma de cambiarle la ropa: elegir otro de sus looks. Para un avatar propio también se puede crear ropa nueva con cambiar_ropa_avatar.',
    inputSchema: { avatar_id: z.string().min(1).max(200) },
    annotations: { readOnlyHint: true },
  },
  async ({ avatar_id }) => {
    try {
      const { looks } = await app<{ looks: Avatar[] }>(
        `/video/avatars/${encodeURIComponent(avatar_id)}/looks`,
      );
      const images = (
        await Promise.all(looks.slice(0, 4).map((l) => remoteImage(l.previewImageUrl)))
      ).filter((image) => image !== null);
      return {
        content: [
          text(
            `${looks.length} look(s) de este avatar:\n${looks.map(avatarLine).join('\n')}${images.length ? '\n\nVistas previas de los primeros, en el mismo orden:' : ''}`,
          ),
          ...images,
        ],
      };
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  'cambiar_ropa_avatar',
  {
    title: 'Cambiar la ropa de un avatar propio',
    description:
      'Crea un look nuevo de un avatar PROPIO (gemelo digital o de foto) con otra ropa, peinado o fondo: la persona se mantiene y cambia lo que describas. No funciona con avatares de stock (para esos usa ver_looks_avatar). HeyGen tarda unos minutos en prepararlo: consulta con estado_look y, cuando esté listo, úsalo como avatar_id en crear_video. Puede consumir saldo de HeyGen: confirma con el usuario antes.',
    inputSchema: {
      avatar_id: z
        .string()
        .min(1)
        .max(200)
        .describe('Look propio de partida (de listar_avatares).'),
      descripcion: z
        .string()
        .min(5)
        .max(1000)
        .describe(
          'Ropa, colores, accesorios, fondo y luz. Ej.: "bata médica blanca sobre blusa color crema, consultorio luminoso, luz natural cálida".',
        ),
      nombre: z.string().min(2).max(80).describe('Nombre del look nuevo.'),
      formato: z.enum(['9:16', '16:9', '1:1', 'auto']).default('9:16').describe('9:16 para reels.'),
    },
  },
  async ({ avatar_id, descripcion, nombre, formato }) => {
    try {
      const { lookId } = await app<{ lookId: string }>(
        `/video/avatars/${encodeURIComponent(avatar_id)}/looks`,
        { method: 'POST', json: { description: descripcion, name: nombre, aspectRatio: formato } },
      );
      return {
        content: [
          text(
            `Look "${nombre}" en preparación (id ${lookId}). Consulta con estado_look en unos minutos; cuando esté listo, úsalo como avatar_id en crear_video.`,
          ),
        ],
      };
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  'estado_look',
  {
    title: 'Ver si un look nuevo está listo',
    description:
      'Estado de un look creado con cambiar_ropa_avatar, con su vista previa cuando está listo.',
    inputSchema: { look_id: z.string().min(1).max(200) },
    annotations: { readOnlyHint: true },
  },
  async ({ look_id }) => {
    try {
      const { look } = await app<{
        look: {
          status: string;
          error: string | null;
          previewImageUrl: string | null;
          engines: string[];
        };
      }>(`/video/looks/${encodeURIComponent(look_id)}`);
      const label: Record<string, string> = {
        processing: 'HeyGen lo está preparando; vuelve a consultar en un par de minutos',
        pending_consent:
          'falta el consentimiento de la persona (se pide desde la app, en Configuración → Video)',
        completed: `listo (${look.engines.includes('avatar_v') ? 'compatible con Avatar V' : look.engines.includes('avatar_iv') ? 'compatible con Avatar IV' : 'sin motor de calidad: no se puede usar en los videos'})`,
        failed: `falló: ${look.error ?? 'sin detalle'}`,
      };
      const image = look.status === 'completed' ? await remoteImage(look.previewImageUrl) : null;
      return {
        content: [
          text(`Look ${look_id}: ${label[look.status] ?? look.status}.`),
          ...(image ? [image] : []),
        ],
      };
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  'listar_voces',
  {
    title: 'Listar voces en español',
    description:
      'Voces de HeyGen en español (id, nombre y género). La voz que mejor sincroniza con un avatar suele ser su voz original (en listar_avatares); en un gemelo digital es la voz clonada de la persona.',
    inputSchema: {
      genero: z.enum(['female', 'male']).optional(),
      buscar: z.string().max(80).default(''),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ genero, buscar }) => {
    try {
      const { voices } = await app<{
        voices: { id: string; name: string; gender: string | null; ownership: string }[];
      }>('/video/voices?language=Spanish');
      const q = buscar.trim().toLowerCase();
      const list = voices
        .filter((v) => !genero || v.gender === genero)
        .filter((v) => !q || v.name.toLowerCase().includes(q));
      return {
        content: [
          text(
            list
              .map(
                (v) =>
                  `- ${v.id} | ${v.name} | ${v.gender ?? 'sin género'}${v.ownership === 'private' ? ' | de la cuenta' : ''}`,
              )
              .join('\n') || 'No hay voces con ese filtro.',
          ),
        ],
      };
    } catch (error) {
      return failure(error);
    }
  },
);

const ROLE_FOR = (index: number, count: number) =>
  count === 1 ? 'single' : index === 0 ? 'hook' : index === count - 1 ? 'cta' : 'development';

server.registerTool(
  'crear_video',
  {
    title: 'Crear un reel con el agente de HeyGen',
    description: `Crea un reel con el Video Agent de HeyGen (el mismo de la web): el agente edita el video completo (tomas, gráficos animados, textos, música, transiciones) siguiendo tu guion. La app le agrega todas las reglas de la marca: logo fijo en todas las escenas, logos de asociaciones, reglas de cumplimiento, zonas seguras de Instagram, subtítulos, Avatar V/IV y el kit de marca de HeyGen.
Tú diriges: escribe cada escena (lo que se dice palabra por palabra, el texto en pantalla y la dirección visual) y un párrafo de estilo visual. Lee antes la marca (leer_marca) y elige avatar y voz (listar_avatares, listar_voces).
No se genera nada todavía: el agente prepara primero un storyboard (unos minutos). Consúltalo con ver_video y luego pide cambios o apruébalo con responder_agente_video. Solo la aprobación genera el video y consume saldo de HeyGen.`,
    inputSchema: {
      titulo: z.string().min(1).max(120),
      tema: z.string().min(3).max(1000),
      escenas: z
        .array(
          z.object({
            tipo: z
              .enum(['presentador', 'apoyo'])
              .describe('presentador = el avatar a cámara; apoyo = visuales con voz en off.'),
            guion: z
              .string()
              .min(3)
              .max(5000)
              .describe('Lo que se dice, palabra por palabra, en español.'),
            texto_en_pantalla: z.string().max(200).default(''),
            direccion_visual: z
              .string()
              .max(1000)
              .default('')
              .describe('Toma, encuadre, visuales de apoyo, movimiento.'),
            gestos: z.string().max(500).default(''),
          }),
        )
        .min(1)
        .max(7),
      estilo_visual: z
        .string()
        .max(3000)
        .default('')
        .describe('Paleta HEX, tipografía, movimiento, música, ritmo.'),
      fondo_presentador: z
        .string()
        .max(500)
        .default('')
        .describe(
          'Fondo para TODAS las escenas con presentador, igual en cada una. Ej.: "consultorio moderno y luminoso, tonos crema". Vacío = el fondo del look.',
        ),
      avatar_id: z.string().min(1).max(200),
      voz_id: z.string().max(200).default('').describe('Vacío = la voz original del avatar.'),
      proporcion: z.enum(['9:16', '4:5', '1:1', '16:9']).default('9:16'),
      duracion: z.union([z.literal(15), z.literal(30), z.literal(45), z.literal(60)]).default(30),
      subtitulos: z.boolean().default(true),
      llamado_accion: z.string().max(80).default(''),
      correo: z.string().max(120).default(''),
      sitio_web: z.string().max(200).default(''),
      whatsapp: z.string().max(40).default(''),
      texto_publicacion: z.string().max(5000).default(''),
    },
  },
  async (input) => {
    try {
      const [{ avatars }, { settings }] = await Promise.all([
        app<{ avatars: Avatar[] }>('/video/avatars'),
        app<{ settings: { voiceSpeed: number; brandKitId: string | null } }>('/video/settings'),
      ]);
      const avatar = avatars.find((a) => a.id === input.avatar_id);
      if (!avatar)
        throw new Error('Ese avatar no existe o no admite Avatar IV o V. Usa listar_avatares.');
      const voiceId = input.voz_id || avatar.defaultVoiceId;
      if (!voiceId)
        throw new Error('Ese avatar no tiene voz original: elige una con listar_voces.');
      const cta = input.llamado_accion.trim();

      const { job } = await app<{ job: Job }>('/reels/generate', {
        method: 'POST',
        json: {
          confirmed: true,
          title: input.titulo,
          topic: input.tema,
          concept: '',
          caption: input.texto_publicacion,
          aspectRatio: input.proporcion,
          durationSeconds: input.duracion,
          captions: input.subtitulos,
          voiceSpeed: settings.voiceSpeed,
          style: 'agent',
          styleParagraph: [
            input.fondo_presentador.trim()
              ? `Presenter background in EVERY presenter scene, the same in all of them: ${input.fondo_presentador.trim()}.`
              : '',
            input.estilo_visual,
          ]
            .filter(Boolean)
            .join(' ')
            .slice(0, 3000),
          brandKitId: settings.brandKitId,
          ...(cta.length >= 2 ? { cta } : {}),
          contact: { email: input.correo, website: input.sitio_web, whatsapp: input.whatsapp },
          scenes: input.escenas.map((scene, index) => {
            const kind = scene.tipo === 'apoyo' ? 'broll' : 'avatar';
            return {
              role: ROLE_FOR(index, input.escenas.length),
              kind,
              title: `Escena ${index + 1}`,
              script: scene.guion,
              visualPrompt: scene.direccion_visual,
              gestures: scene.gestos,
              onScreenText: scene.texto_en_pantalla,
              avatarId: kind === 'avatar' ? avatar.id : '',
              voiceId,
              background: { type: 'avatar' },
            };
          }),
        },
      });
      return {
        content: [
          text(
            `Video enviado al agente de HeyGen (id ${job.id}). Está preparando el storyboard: consulta con ver_video en 2 o 3 minutos. Nada se genera ni se cobra hasta que lo apruebes.`,
          ),
        ],
      };
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  'ver_video',
  {
    title: 'Ver el estado de un video',
    description:
      'Estado de un reel: el último mensaje del agente de HeyGen, las imágenes del storyboard cuando está listo para revisar, el error si falló o el enlace cuando terminó.',
    inputSchema: { video_id: z.uuid() },
    annotations: { readOnlyHint: true },
  },
  async ({ video_id }) => {
    try {
      const { job } = await app<{ job: Job }>(`/reels/jobs/${video_id}`);
      const lines = [
        `"${job.spec.title}": ${JOB_STATUS[job.status] ?? job.status}${(job.status === 'drafting' || job.status === 'processing') && job.agent?.progress != null ? ` (${job.agent.progress} %)` : ''}.`,
      ];
      const lastModel = job.agent?.messages.find((m) => m.role === 'model');
      if (lastModel && job.status !== 'completed') {
        lines.push(`Mensaje del agente de HeyGen: ${lastModel.content}`);
      }
      if (job.error) lines.push(`Error: ${job.error.mensaje}`);
      if (job.status === 'completed' && job.videoUrl) {
        lines.push(
          `Video listo${job.durationSeconds ? ` (${Math.round(job.durationSeconds)} s)` : ''}: ${APP_URL}${job.videoUrl}. También está en Mis contenidos → Reels. Para ajustar escenas usa editar_escenas_video.`,
        );
      }
      const images =
        job.status === 'reviewing'
          ? (
              await Promise.all(
                (job.agent?.storyboard ?? [])
                  .slice(0, 6)
                  .map((item) => remoteImage(item.thumbnailUrl ?? item.url)),
              )
            ).filter((image) => image !== null)
          : [];
      if (job.status === 'reviewing' && images.length === 0) {
        lines.push('HeyGen no envió imágenes del storyboard: revisa el mensaje del agente.');
      }
      return { content: [text(lines.join('\n\n')), ...images] };
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  'responder_agente_video',
  {
    title: 'Hablar con el agente de HeyGen',
    description:
      'Con el storyboard listo (ver_video): pide cambios al agente de HeyGen con un mensaje claro y concreto (qué escena y qué cambiar), o apruébalo para generar el video. Aprobar CONSUME SALDO DE HEYGEN: hazlo solo cuando el usuario lo confirme expresamente.',
    inputSchema: {
      video_id: z.uuid(),
      mensaje: z
        .string()
        .max(2000)
        .default('')
        .describe('Cambios para el agente (o una nota al aprobar).'),
      aprobar_y_generar: z.boolean().default(false),
    },
  },
  async ({ video_id, mensaje, aprobar_y_generar }) => {
    try {
      await app(`/reels/jobs/${video_id}/agent-message`, {
        method: 'POST',
        json: {
          approve: aprobar_y_generar,
          message: mensaje.trim(),
          ...(aprobar_y_generar ? { confirmed: true } : {}),
        },
      });
      return {
        content: [
          text(
            aprobar_y_generar
              ? 'Aprobado: HeyGen está generando el video (puede tardar varios minutos). Consulta con ver_video.'
              : 'Cambios enviados: el agente rehace el storyboard. Consulta con ver_video en unos minutos.',
          ),
        ],
      };
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  'editar_escenas_video',
  {
    title: 'Editar escenas de un video terminado',
    description:
      'Cambia solo las escenas indicadas de un reel terminado del agente (Edit Scenes de HeyGen); las demás quedan exactamente igual. Para un cambio que va en todas (p. ej. el logo), usa aplicar_a_todas. Genera un video nuevo y CONSUME SALDO DE HEYGEN: confirma con el usuario antes.',
    inputSchema: {
      video_id: z.uuid(),
      cambios: z
        .array(
          z.object({
            escena: z.number().int().min(1).max(50),
            cambio: z.string().min(3).max(2000),
          }),
        )
        .default([]),
      aplicar_a_todas: z
        .string()
        .max(2000)
        .default('')
        .describe('Cambio que se aplica a cada escena.'),
    },
  },
  async ({ video_id, cambios, aplicar_a_todas }) => {
    try {
      const snapshot = await app<{
        videoId: string;
        editVersion: string;
        scenes: { id: string }[];
      }>(`/reels/jobs/${video_id}/scenes`);
      const general = aplicar_a_todas.trim();
      const edits = snapshot.scenes
        .map((scene, index) => {
          const own = cambios.filter((c) => c.escena === index + 1).map((c) => c.cambio.trim());
          const textValue = [general, ...own].filter((part) => part.length >= 3).join(' ');
          return { sceneId: scene.id, scene: index + 1, text: textValue };
        })
        .filter((edit) => edit.text.length >= 3);
      if (edits.length === 0)
        throw new Error(`Indica algún cambio. El video tiene ${snapshot.scenes.length} escenas.`);
      await app(`/reels/jobs/${video_id}/scene-edits`, {
        method: 'POST',
        json: { snapshotVideoId: snapshot.videoId, editVersion: snapshot.editVersion, edits },
      });
      return {
        content: [
          text(
            `Cambios enviados a ${edits.length} escena(s). HeyGen genera la versión nueva: consulta con ver_video.`,
          ),
        ],
      };
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  'listar_videos',
  {
    title: 'Listar reels',
    description:
      'Reels creados desde la app o desde Claude, los más recientes primero, con su id y estado.',
    inputSchema: { cantidad: z.number().int().min(1).max(50).default(15) },
    annotations: { readOnlyHint: true },
  },
  async ({ cantidad }) => {
    try {
      const { jobs } = await app<{ jobs: Job[] }>('/reels/jobs');
      if (jobs.length === 0) return { content: [text('Aún no hay reels.')] };
      return {
        content: [
          text(
            jobs
              .slice(0, cantidad)
              .map(
                (j) =>
                  `- ${j.id} | ${j.spec.title} | ${j.createdAt.slice(0, 10)} | ${j.spec.style === 'agent' ? 'agente de HeyGen' : j.spec.style} | ${JOB_STATUS[j.status] ?? j.status}`,
              )
              .join('\n'),
          ),
        ],
      };
    } catch (error) {
      return failure(error);
    }
  },
);

await server.connect(new StdioServerTransport());
console.error(`Creador de contenido (MCP) listo; app en ${APP_URL}`);
