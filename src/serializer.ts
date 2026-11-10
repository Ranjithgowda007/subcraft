import { msToTimecode } from './timecode.js';
import type { SubtitleCue } from './types.js';

/**
 * Serializes an array of SubtitleCue objects into standard SRT file format.
 *
 * Output format:
 * 1
 * 00:00:20,000 --> 00:00:24,000
 * Subtitle text
 *
 * @param cues - Array of SubtitleCue objects to format
 * @returns Standard formatted SRT string
 */
export function stringifySRT(cues: readonly SubtitleCue[]): string {
  if (!cues || cues.length === 0) {
    return '';
  }

  const blocks = cues.map((cue, idx) => {
    const id = cue.id ? String(cue.id) : String(idx + 1);
    const startStr = msToTimecode(cue.start, 'srt');
    const endStr = msToTimecode(cue.end, 'srt');
    const text = cue.text ?? '';

    return `${id}\n${startStr} --> ${endStr}\n${text}`;
  });

  return blocks.join('\n\n') + '\n';
}
