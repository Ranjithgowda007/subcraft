import type { SubtitleCue, TimecodeFormat } from './types.js';

/**
 * Regular expression to match both SRT (comma) and WebVTT (dot) timecodes.
 * Supports:
 * - HH:MM:SS,mmm or HH:MM:SS.mmm
 * - MM:SS.mmm (WebVTT short format)
 */
const TIMECODE_REGEX = /^(?:(?:(\d{1,2}):)?(\d{2}):)?(\d{2})[,.](\d{3})$/;

/**
 * Converts a formatted timecode string into integer milliseconds.
 *
 * Supported formats:
 * - "01:23:45,678" (SRT standard)
 * - "01:23:45.678" (WebVTT standard)
 * - "23:45.678"    (WebVTT short form without hours)
 *
 * @throws {Error} if timecode format is invalid
 */
export function timecodeToMs(timecode: string): number {
  const trimmed = timecode.trim();
  const match = trimmed.match(TIMECODE_REGEX);

  if (!match) {
    throw new Error(
      `Invalid timecode format: "${timecode}". Expected "HH:MM:SS,mmm" or "HH:MM:SS.mmm".`
    );
  }

  const hours = match[1] ? parseInt(match[1], 10) : 0;
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const seconds = parseInt(match[3] ?? '0', 10);
  const milliseconds = parseInt(match[4] ?? '0', 10);

  return (
    hours * 3_600_000 +
    minutes * 60_000 +
    seconds * 1_000 +
    milliseconds
  );
}

/**
 * Converts integer milliseconds into a standard formatted timecode string.
 *
 * @param ms - Non-negative integer milliseconds (negative values clamped to 0)
 * @param format - 'srt' (uses comma delimiter) or 'vtt' (uses dot delimiter)
 *
 * @example
 * msToTimecode(83456, 'srt') // "00:01:23,456"
 * msToTimecode(83456, 'vtt') // "00:01:23.456"
 */
export function msToTimecode(ms: number, format: TimecodeFormat = 'srt'): string {
  const safeMs = Math.max(0, Math.floor(ms));

  const hours = Math.floor(safeMs / 3_600_000);
  const minutes = Math.floor((safeMs % 3_600_000) / 60_000);
  const seconds = Math.floor((safeMs % 60_000) / 1_000);
  const remainderMs = safeMs % 1_000;

  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  const mmm = String(remainderMs).padStart(3, '0');

  const delimiter = format === 'vtt' ? '.' : ',';
  return `${hh}:${mm}:${ss}${delimiter}${mmm}`;
}

/**
 * Linearly shifts timecodes by a constant millisecond offset.
 * Used to correct audio-sync delay or advance.
 * Clamps negative results to 0.
 *
 * @param cues - Array of SubtitleCue objects
 * @param offsetMs - Offset in milliseconds (positive advances, negative delays)
 * @returns A new immutable array of shifted cues
 */
export function shiftTimecodes(
  cues: readonly SubtitleCue[],
  offsetMs: number
): SubtitleCue[] {
  return cues.map((cue) => ({
    ...cue,
    start: Math.max(0, cue.start + offsetMs),
    end: Math.max(0, cue.end + offsetMs),
  }));
}

/**
 * Scales all cue timecodes by a multiplicative ratio.
 * Used for frame-rate drift compensation between video standards.
 * All results are strictly rounded to integer milliseconds with Math.round.
 *
 * Direction definition:
 * targetTimestamp = Math.round(sourceTimestamp * ratio)
 *
 * @example
 * // 24 fps to 25 fps (PAL speed-up): video is ~4% faster, timecodes compress
 * const palCues = retime(filmCues, 24 / 25); // ratio = 0.96
 *
 * @example
 * // 25 fps to 24 fps (Slow-down): video is ~4% slower, timecodes stretch
 * const filmCues = retime(palCues, 25 / 24); // ratio = 1.04167
 *
 * @param cues - Array of SubtitleCue objects
 * @param ratio - Positive scaling multiplier (e.g., 24/25 or 25/24)
 * @returns A new immutable array of retimed cues
 */
export function retime(
  cues: readonly SubtitleCue[],
  ratio: number
): SubtitleCue[] {
  if (ratio <= 0) {
    throw new Error(`Retime ratio must be greater than 0. Received: ${ratio}`);
  }

  return cues.map((cue) => ({
    ...cue,
    start: Math.round(cue.start * ratio),
    end: Math.round(cue.end * ratio),
  }));
}
