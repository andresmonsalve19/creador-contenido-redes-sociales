import { estimateSeconds } from './estimate.js';
import type { VideoSpec } from './schemas.js';

/** HeyGen admite prompts de hasta 10.000 caracteres para el Video Agent. */
const MAX_PROMPT_CHARS = 10_000;

const quote = (text: string) => `"${text.replace(/"/g, "'").trim()}"`;

/** Tiempos aproximados de cada escena (desde/hasta, en segundos) según el ritmo de lectura. */
export function sceneTimings(spec: Pick<VideoSpec, 'scenes' | 'wordsPerSecond'>) {
  let start = 0;
  return spec.scenes.map((scene) => {
    const seconds = Math.max(2, Math.round(estimateSeconds(scene.script, spec.wordsPerSecond)));
    const timing = { from: start, to: start + seconds };
    start += seconds;
    return timing;
  });
}

interface AgentPromptExtras {
  /** Reglas de cumplimiento de la marca (prioridad máxima). */
  complianceRules: string;
  /** Se adjunta el logo real como archivo. */
  hasLogoFile: boolean;
}

/**
 * Prompt para el Video Agent de HeyGen siguiendo su guía: duración y formato primero, párrafo
 * de estilo y el guion escena por escena para que lo siga exactamente.
 * Fuente: https://developers.heygen.com/docs/prompting-guide.md (consultada el 2026-10-15).
 */
export function buildAgentPrompt(spec: VideoSpec, extras: AgentPromptExtras): string {
  const orientation = spec.aspectRatio === '16:9' ? 'landscape (16:9)' : 'portrait (9:16)';
  const timings = sceneTimings(spec);

  const scenes = spec.scenes
    .map((scene, index) => {
      const timing = timings[index] ?? { from: 0, to: 0 };
      const who =
        scene.kind === 'broll'
          ? 'No presenter on screen, voice-over only.'
          : 'Presenter on camera.';
      const lines = [
        `Scene ${index + 1} (${timing.from}-${timing.to}s) - ${[
          scene.visualPrompt.replace(/[.\s]+$/, ''),
          who,
        ]
          .filter(Boolean)
          .join('. ')}`,
        scene.onScreenText ? `On-screen text: ${quote(scene.onScreenText)}` : '',
        quote(scene.script),
      ];
      return lines.filter(Boolean).join('\n');
    })
    .join('\n\n');

  const contact = [
    spec.contact?.website,
    spec.contact?.email,
    spec.contact?.whatsapp && `WhatsApp ${spec.contact.whatsapp}`,
  ]
    .filter(Boolean)
    .join(' · ');
  const brandRules = [
    'Brand rules (mandatory):',
    extras.hasLogoFile
      ? '- Use the attached logo file exactly as it is (do not redraw, recolor or distort it).'
      : '',
    spec.cta
      ? `- Close with one clear call to action shown on screen: ${quote(spec.cta)}${contact ? `, with ${contact}` : ''}.`
      : '',
    spec.captions ? '- Captions on, inside the safe area.' : '- No captions.',
    '- Keep important text out of the top 15% and bottom 20% of the frame (Instagram interface).',
    '- Do not add facts, numbers, prices or claims that are not in the script.',
    extras.complianceRules
      ? `- Compliance rules from the brand (highest priority): ${extras.complianceRules}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  const prompt = [
    `Make a ${spec.durationSeconds}-second ${orientation} Instagram reel in Spanish, presented by the selected avatar with the selected voice. Follow the script below exactly, scene by scene: say every quoted line word for word, in Spanish, and change the shot in every scene. Use dynamic motion graphics, animated on-screen text, supporting visuals and smooth transitions, with soft instrumental background music at low volume (no lyrics).`,
    spec.styleParagraph ? `Style: ${spec.styleParagraph}` : '',
    brandRules,
    `Script:\n${scenes}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  return prompt.length > MAX_PROMPT_CHARS ? prompt.slice(0, MAX_PROMPT_CHARS) : prompt;
}
