import { promises as fs } from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from '../config/paths.js';
import { badRequest } from '../http/errors.js';

const BRAND_DIR = path.join(DATA_DIR, 'brand');
const LEARNING_FILE = path.join(BRAND_DIR, 'learning.md');

export const MAX_RULES = 50;
const HEADER = `# Aprendizajes de la marca

Reglas aprendidas de los comentarios del usuario. Aplícalas siempre al crear prompts de imagen, textos y temáticas.
`;

const RULE_LINE = /^\s*[-*]\s+(.+?)\s*$/;

/** Una regla por línea, sin saltos internos. */
const normalize = (rule: string) => rule.replace(/\s+/g, ' ').trim();

export async function readRules(): Promise<string[]> {
  try {
    const content = await fs.readFile(LEARNING_FILE, 'utf8');
    return content.split(/\r?\n/).flatMap((line) => {
      const rule = RULE_LINE.exec(line)?.[1];
      return rule ? [rule] : [];
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

async function writeRules(rules: string[]): Promise<void> {
  await fs.mkdir(BRAND_DIR, { recursive: true });
  const body = rules.map((rule) => `- ${rule}`).join('\n');
  await fs.writeFile(LEARNING_FILE, `${HEADER}\n${body}\n`, 'utf8');
}

/** Agrega reglas nuevas sin duplicar las existentes. Devuelve las que realmente se guardaron. */
export async function addRules(newRules: string[]): Promise<{ added: string[]; rules: string[] }> {
  const current = await readRules();
  const known = new Set(current.map((rule) => rule.toLowerCase()));

  const added: string[] = [];
  for (const raw of newRules) {
    const rule = normalize(raw);
    if (!rule || known.has(rule.toLowerCase())) continue;
    known.add(rule.toLowerCase());
    added.push(rule);
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

export async function removeRule(index: number): Promise<string[]> {
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
