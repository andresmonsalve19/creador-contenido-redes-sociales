import { promises as fs } from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from '../config/paths.js';
import { badRequest } from '../http/errors.js';

const BRAND_DIR = path.join(DATA_DIR, 'brand');
const LEARNING_FILE = path.join(BRAND_DIR, 'learning.md');

export const MAX_RULES = 50;
const HEADER = `# Aprendizajes de la marca

Reglas aprendidas de los comentarios del usuario. Aplícalas siempre al crear prompts de imagen, textos, guiones y temáticas.
Las marcadas con [imagen] o [video] aplican solo a ese formato; las demás aplican a todo.
`;

/** A qué contenido aplica una regla. Las reglas sin etiqueta (incluidas las antiguas) son generales. */
export const RULE_CATEGORIES = ['image', 'video', 'general'] as const;
export type RuleCategory = (typeof RULE_CATEGORIES)[number];
/** Formato de contenido que consulta las reglas. */
export type ContentKind = Exclude<RuleCategory, 'general'>;

export interface LearningRule {
  text: string;
  category: RuleCategory;
}

const TAGS: Record<ContentKind, string> = { image: 'imagen', video: 'video' };
const RULE_LINE = /^\s*[-*]\s+(?:\[(imagen|video)\]\s+)?(.+?)\s*$/;

/** Una regla por línea, sin saltos internos. */
const normalize = (rule: string) => rule.replace(/\s+/g, ' ').trim();

export async function readRules(): Promise<LearningRule[]> {
  try {
    const content = await fs.readFile(LEARNING_FILE, 'utf8');
    return content.split(/\r?\n/).flatMap((line) => {
      const match = RULE_LINE.exec(line);
      const text = match?.[2];
      if (!text) return [];
      const tag = match[1];
      const category: RuleCategory =
        tag === TAGS.image ? 'image' : tag === TAGS.video ? 'video' : 'general';
      return [{ text, category }];
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

/** Reglas que aplican a un formato: las suyas y las generales. */
export async function readRulesFor(kind: ContentKind): Promise<string[]> {
  return (await readRules())
    .filter((rule) => rule.category === kind || rule.category === 'general')
    .map((rule) => rule.text);
}

async function writeRules(rules: LearningRule[]): Promise<void> {
  await fs.mkdir(BRAND_DIR, { recursive: true });
  const body = rules
    .map(({ text, category }) =>
      category === 'general' ? `- ${text}` : `- [${TAGS[category]}] ${text}`,
    )
    .join('\n');
  await fs.writeFile(LEARNING_FILE, `${HEADER}\n${body}\n`, 'utf8');
}

/** Agrega reglas nuevas sin duplicar las existentes. Devuelve las que realmente se guardaron. */
export async function addRules(
  newRules: LearningRule[],
): Promise<{ added: LearningRule[]; rules: LearningRule[] }> {
  const current = await readRules();
  const known = new Set(current.map((rule) => rule.text.toLowerCase()));

  const added: LearningRule[] = [];
  for (const raw of newRules) {
    const text = normalize(raw.text);
    if (!text || known.has(text.toLowerCase())) continue;
    known.add(text.toLowerCase());
    added.push({ text, category: raw.category });
  }

  if (current.length + added.length > MAX_RULES) {
    throw badRequest(
      `Ya hay demasiados aprendizajes guardados (máximo ${MAX_RULES}). Elimina algunos para agregar nuevos.`,
    );
  }

  const rules = [...current, ...added];
  if (added.length > 0) await writeRules(rules);
  return { added, rules };
}

export async function removeRule(index: number): Promise<LearningRule[]> {
  const rules = await readRules();
  if (!Number.isInteger(index) || index < 0 || index >= rules.length) {
    throw badRequest('Ese aprendizaje no existe.');
  }
  rules.splice(index, 1);
  await writeRules(rules);
  return rules;
}

/** Bloque de texto para incluir en los prompts; cadena vacía si aún no hay aprendizajes. */
export function formatRulesForPrompt(rules: string[]): string {
  if (rules.length === 0) return '';
  return [
    '# Aprendizajes previos del usuario (obligatorio respetarlos)',
    'Son correcciones y preferencias que el usuario ha pedido antes. Tienen prioridad sobre tus preferencias de estilo.',
    ...rules.map((rule) => `- ${rule}`),
  ].join('\n');
}
