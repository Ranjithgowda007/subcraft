import { timecodeToMs } from './timecode.js';
import type { SubtitleCue, ParseError, ParseResult } from './types.js';

/** Matches the standard SRT timestamp line: 00:00:00,000 --> 00:00:00,000 */
const ARROW_REGEX =
  /((?:\d{1,2}:)?\d{2}:\d{2}[,.]\d{3})\s*-->\s*((?:\d{1,2}:)?\d{2}:\d{2}[,.]\d{3})/;

/**
 * Parses raw SRT subtitle text into structured SubtitleCue objects.
 * Resilient parser that collects syntax errors without throwing unhandled exceptions.
 *
 * Handles:
 * - UTF-8 Byte Order Marks (BOM `\uFEFF`)
 * - Windows (CRLF), Unix (LF), and legacy Mac (CR) line endings
 * - Optional or missing cue numeric index headers
 * - Multi-line subtitle texts
 * - Trailing and irregular blank lines
 *
 * @param rawText - Raw SRT file content as a string
 * @returns {ParseResult} Object containing successfully parsed cues and any block errors
 */
export function parseSRT(rawText: string): ParseResult {
  const cues: SubtitleCue[] = [];
  const errors: ParseError[] = [];

  if (!rawText || !rawText.trim()) {
    return { cues, errors };
  }

  // 1. Strip UTF-8 Byte Order Mark (BOM)
  const cleanText = rawText.replace(/^\uFEFF/, '');

  // 2. Normalize CRLF and CR to standard Unix LF
  const normalized = cleanText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // 3. Split by 2 or more consecutive newlines into cue blocks
  const rawBlocks = normalized.trim().split(/\n\s*\n+/);

  let fallbackIndex = 1;

  for (let bIndex = 0; bIndex < rawBlocks.length; bIndex++) {
    const rawBlock = rawBlocks[bIndex]?.trim();
    if (!rawBlock) continue;

    const lines = rawBlock.split('\n');

    let id: string;
    let timecodeLine: string;
    let textLines: string[];

    // Check if line 0 is the timecode arrow (missing numeric index)
    if (lines[0] && ARROW_REGEX.test(lines[0])) {
      id = String(fallbackIndex);
      timecodeLine = lines[0];
      textLines = lines.slice(1);
    } else if (lines[1] && ARROW_REGEX.test(lines[1])) {
      // Standard SRT: line 0 is ID, line 1 is timecode
      id = lines[0]?.trim() || String(fallbackIndex);
      timecodeLine = lines[1];
      textLines = lines.slice(2);
    } else {
      errors.push({
        index: fallbackIndex,
        rawBlock,
        message:
          'Invalid block format. Expected timecode arrow "-->" on line 1 or 2.',
      });
      continue;
    }

    const match = timecodeLine.match(ARROW_REGEX);
    if (!match || !match[1] || !match[2]) {
      errors.push({
        index: fallbackIndex,
        rawBlock,
        message: `Failed to extract start and end timestamps from: "${timecodeLine}".`,
      });
      continue;
    }

    try {
      const start = timecodeToMs(match[1]);
      const end = timecodeToMs(match[2]);
      const text = textLines.join('\n').trim();

      cues.push({
        id,
        start,
        end,
        text,
      });

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
