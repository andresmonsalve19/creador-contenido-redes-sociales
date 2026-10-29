import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { DATA_DIR } from '../config/paths.js';

const TWINS_FILE = path.join(DATA_DIR, 'brand', 'digital-twins.json');

/** Gemelos digitales creados desde la app (el estado en vivo se consulta a HeyGen). */
export const twinRecordSchema = z.object({
  lookId: z.string(),
  groupId: z.string(),
  name: z.string(),
  voiceId: z.string().nullable(),
  createdAt: z.string(),
});
export type TwinRecord = z.infer<typeof twinRecordSchema>;

export async function readTwins(file = TWINS_FILE): Promise<TwinRecord[]> {
  try {
    const parsed = z.array(twinRecordSchema).safeParse(JSON.parse(await fs.readFile(file, 'utf8')));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export async function addTwin(record: TwinRecord, file = TWINS_FILE): Promise<void> {
  const twins = await readTwins(file);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify([record, ...twins], null, 2), 'utf8');
}
