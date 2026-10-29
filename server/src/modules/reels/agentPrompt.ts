import { estimateSeconds } from './estimate.js';
import type { LogoPlacement } from '../../shared/video/videoSettings.schema.js';
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
  /** Posición y tamaño fijos del logo en todas las escenas. */
  logo: LogoPlacement;
  /** Logos de asociaciones adjuntos después del logo de la marca, en este orden. */
  partners?: { name: string; usage: 'always' | 'closing' }[];
}

const LOGO_CORNER: Record<LogoPlacement['position'], string> = {
  'top-right': 'top-right corner, just below the top 15% of the frame',
  'top-left': 'top-left corner, just below the top 15% of the frame',
  'bottom-right': 'bottom-right corner, just above the bottom 20% of the frame',
  'bottom-left': 'bottom-left corner, just above the bottom 20% of the frame',
};
const LOGO_WIDTH: Record<LogoPlacement['size'], string> = {
  small: 'small, about 12% of the frame width',
  medium: 'medium, about 18% of the frame width',
  large: 'large, about 25% of the frame width',
};

/** Logos de asociaciones adjuntos: dónde van y que se usen tal cual. */
function partnersRule(
  partners: NonNullable<AgentPromptExtras['partners']>,
  afterBrandLogo: boolean,
) {
  const list = partners
    .map(
      (partner, index) =>
        `attached file ${index + (afterBrandLogo ? 2 : 1)} = ${quote(partner.name)} (${partner.usage === 'always' ? 'every scene' : 'closing card only'})`,
    )
    .join('; ');
  return `- Association logos (the brand is a member; use each file exactly as it is, small and together in a discreet "Miembro de" strip near the brand logo or at the bottom of the safe area, never larger than the brand logo): ${list}.`;
}

/** Regla del logo para todas las escenas: una sola posición y un solo tamaño. */
export function logoRule(logo: LogoPlacement, source: string): string {
  return `- Logo in EVERY scene, with no exceptions (presenter scenes, supporting visuals and the closing card): ${source}, always in the ${LOGO_CORNER[logo.position]}, ${LOGO_WIDTH[logo.size]}. Same position and same size in all scenes. This rule overrides any other logo instruction, including the style paragraph.`;
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
    extras.hasLogoFile || spec.brandKitId
      ? logoRule(extras.logo, extras.hasLogoFile ? 'the attached logo' : 'the brand kit logo')
      : '',
    extras.partners && extras.partners.length > 0
      ? partnersRule(extras.partners, extras.hasLogoFile)
      : '',
    spec.cta
      ? `- Close with one clear call to action shown on screen: ${quote(spec.cta)}${contact ? `, with ${contact}` : ''}.`
      : '',
    spec.captions ? '- Captions on, inside the safe area.' : '- No captions.',
    '- Keep important text out of the top 15% and bottom 20% of the frame (Instagram interface).',
    '- Do not add facts, numbers, prices or claims that are not in the script.',
    '- Do not add scenes, overlays, effects or on-screen elements that are not described here. Apply every rule above to all scenes in the same way.',
    extras.complianceRules
      ? `- Compliance rules from the brand (highest priority): ${extras.complianceRules}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  const prompt = [
    `Make a ${spec.durationSeconds}-second ${orientation} Instagram reel in Spanish, presented by the selected avatar with the selected voice. Follow the script below exactly, scene by scene: say every quoted line word for word, in Spanish, and change the shot in every scene. Use dynamic motion graphics, animated on-screen text, supporting visuals and smooth transitions, with soft instrumental background music at low volume (no lyrics). Render the avatar with the highest-quality avatar engine available for it: Avatar V if supported, otherwise Avatar IV; never Avatar III. Output in 1080p.`,
    spec.styleParagraph ? `Style: ${spec.styleParagraph}` : '',
    brandRules,
    `Script:\n${scenes}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  return prompt.length > MAX_PROMPT_CHARS ? prompt.slice(0, MAX_PROMPT_CHARS) : prompt;
}
