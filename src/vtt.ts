import { timecodeToMs, msToTimecode } from './timecode.js';
import { parseSRT } from './parser.js';
import { stringifySRT } from './serializer.js';
import type { SubtitleCue, ParseError, ParseResult } from './types.js';

/**
 * Matches the WebVTT timestamp line with optional cue settings:
 * 00:01:20.500 --> 00:01:23.000 align:middle line:90%
 */
const VTT_ARROW_REGEX =
  /((?:\d{1,2}:)?\d{2}:\d{2}[,.]\d{3})\s*-->\s*((?:\d{1,2}:)?\d{2}:\d{2}[,.]\d{3})(?:[ \t]+([^\r\n]+))?/;

export interface StringifyVTTOptions {
  /** Optional custom header line after WEBVTT (e.g. "WEBVTT - Commentary Track") */
  header?: string;
  /** Whether to output cue numeric ID headers (default: false for standard clean WebVTT) */
  includeIds?: boolean;
}

/**
 * Parses raw WebVTT (.vtt) subtitle text into structured SubtitleCue objects.
 *
 * Handles:
 * - UTF-8 Byte Order Marks (BOM \uFEFF)
 * - WEBVTT header and metadata blocks
 * - NOTE comment blocks (skipped automatically)
 * - Dot-separated milliseconds (00:01:20.500) and comma-separated fallback
 * - Short timecodes without hours (MM:SS.mmm)
 * - Cue placement/styling settings (e.g. align:middle line:90%)
 * - Optional cue identifiers
 *
 * @param rawText - Raw WebVTT file content as a string
 * @returns {ParseResult} Successfully parsed cues and any block errors
 */
export function parseVTT(rawText: string): ParseResult {
  const cues: SubtitleCue[] = [];
  const errors: ParseError[] = [];

  if (!rawText || !rawText.trim()) {
    return { cues, errors };
  }

  // 1. Strip BOM & normalize newlines
  const clean = rawText.replace(/^\uFEFF/, '');
  const normalized = clean.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // 2. Validate and strip WEBVTT header
  if (!normalized.startsWith('WEBVTT')) {
    errors.push({
      rawBlock: normalized.slice(0, 50),
      message: 'Missing standard "WEBVTT" signature at the beginning of the file.',
    });
  }

  // Split into blocks by double newlines
  const rawBlocks = normalized.trim().split(/\n\s*\n+/);
  let fallbackIndex = 1;

  for (let bIndex = 0; bIndex < rawBlocks.length; bIndex++) {
    const rawBlock = rawBlocks[bIndex]?.trim();
    if (!rawBlock) continue;

    // Skip the very first block if it is just the WEBVTT header line
    if (bIndex === 0 && rawBlock.startsWith('WEBVTT')) {
      continue;
    }

    // Skip NOTE comment blocks
    if (rawBlock.startsWith('NOTE')) {
      continue;
    }

    // Skip STYLE or REGION metadata blocks if encountered
    if (rawBlock.startsWith('STYLE') || rawBlock.startsWith('REGION')) {
      continue;
    }

    const lines = rawBlock.split('\n');
    let id: string;
    let timecodeLine: string;
    let textLines: string[];

    // Case 1: First line is the timestamp arrow (no cue ID header)
    if (lines[0] && VTT_ARROW_REGEX.test(lines[0])) {
      id = String(fallbackIndex);
      timecodeLine = lines[0];
      textLines = lines.slice(1);
    } else if (lines[1] && VTT_ARROW_REGEX.test(lines[1])) {
      // Case 2: Line 0 is ID header, line 1 is timestamp
      id = lines[0]?.trim() || String(fallbackIndex);
      timecodeLine = lines[1];
      textLines = lines.slice(2);
    } else {
      errors.push({
        index: fallbackIndex,
        rawBlock,
        message: 'Invalid WebVTT cue block. Missing timecode arrow "-->".',
      });
      continue;
    }

    const match = timecodeLine.match(VTT_ARROW_REGEX);
    if (!match || !match[1] || !match[2]) {
      errors.push({
        index: fallbackIndex,
        rawBlock,
        message: `Failed to parse timestamps from WebVTT cue: "${timecodeLine}".`,
      });
      continue;
    }

    try {
      const start = timecodeToMs(match[1]);
      const end = timecodeToMs(match[2]);
      const settings = match[3]?.trim();
      const text = textLines.join('\n').trim();

      const cue: SubtitleCue = {
        id,
        start,
        end,
        text,
      };

      if (settings) {
        cue.settings = settings;
      }

      cues.push(cue);
      fallbackIndex++;
    } catch (err) {
      errors.push({
        index: fallbackIndex,
        rawBlock,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { cues, errors };
}

/**
 * Serializes an array of SubtitleCue objects into standard WebVTT (.vtt) file format.
 *
 * @param cues - Array of SubtitleCue objects to format
 * @param options - Formatting options (header title, inclusion of cue IDs)
 * @returns Formatted WebVTT string
 */
export function stringifyVTT(
  cues: readonly SubtitleCue[],
  options?: StringifyVTTOptions
): string {
  const header = options?.header ? `WEBVTT - ${options.header}` : 'WEBVTT';

  if (!cues || cues.length === 0) {
    return `${header}\n`;
  }

  const includeIds = options?.includeIds ?? false;

  const blocks = cues.map((cue, idx) => {
    const id = cue.id ? String(cue.id) : String(idx + 1);
    const startStr = msToTimecode(cue.start, 'vtt');
    const endStr = msToTimecode(cue.end, 'vtt');
    const settingsStr = cue.settings ? ` ${cue.settings}` : '';
    const timeLine = `${startStr} --> ${endStr}${settingsStr}`;
    const text = cue.text ?? '';

    if (includeIds) {
      return `${id}\n${timeLine}\n${text}`;
    }
    return `${timeLine}\n${text}`;
  });

  return `${header}\n\n${blocks.join('\n\n')}\n`;
}

/**
 * Converts raw SRT subtitle text directly into a valid WebVTT (.vtt) string.
 *
 * @param srtText - Raw SubRip (.srt) text content
 * @param options - WebVTT formatting options
 * @returns Formatted WebVTT string
 */
export function srtToVTT(
  srtText: string,
  options?: StringifyVTTOptions
): string {
  const { cues } = parseSRT(srtText);
  return stringifyVTT(cues, options);
}

/**
 * Converts raw WebVTT subtitle text directly into a standard SRT (.srt) string.
 *
 * @param vttText - Raw WebVTT (.vtt) text content
 * @returns Standard SubRip (.srt) string
 */
export function vttToSRT(vttText: string): string {
  const { cues } = parseVTT(vttText);
  return stringifySRT(cues);
}
