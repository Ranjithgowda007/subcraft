import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { parseSRT } from '../src/parser.js';
import { stringifySRT } from '../src/serializer.js';
import { timecodeToMs, msToTimecode } from '../src/timecode.js';
import type { SubtitleCue } from '../src/types.js';

describe('SRT Parser & Serializer', () => {
  const sampleSRT = `1
00:00:20,000 --> 00:00:24,400
Hello world!
Second line of text.

2
00:00:24,600 --> 00:00:27,800
This is cue number two.`;

  it('parses standard multi-cue SRT strings accurately', () => {
    const { cues, errors } = parseSRT(sampleSRT);

    expect(errors).toHaveLength(0);
    expect(cues).toHaveLength(2);

    expect(cues[0]).toEqual({
      id: '1',
      start: 20000,
      end: 24400,
      text: 'Hello world!\nSecond line of text.',
    });

    expect(cues[1]).toEqual({
      id: '2',
      start: 24600,
      end: 27800,
      text: 'This is cue number two.',
    });
  });

  it('strips UTF-8 Byte Order Mark (BOM)', () => {
    const withBOM = `\uFEFF1\n00:00:01,000 --> 00:00:04,000\nBOM test`;
    const { cues, errors } = parseSRT(withBOM);

    expect(errors).toHaveLength(0);
    expect(cues).toHaveLength(1);
    expect(cues[0]?.id).toBe('1');
    expect(cues[0]?.text).toBe('BOM test');
  });

  it('handles Windows CRLF (\\r\\n) line endings seamlessly', () => {
    const crlfSRT = "1\r\n00:00:01,000 --> 00:00:04,000\r\nLine 1\r\nLine 2\r\n\r\n2\r\n00:00:05,000 --> 00:00:08,000\r\nLine 3\r\n";
    const { cues, errors } = parseSRT(crlfSRT);

    expect(errors).toHaveLength(0);
    expect(cues).toHaveLength(2);
    expect(cues[0]?.text).toBe('Line 1\nLine 2');
    expect(cues[1]?.text).toBe('Line 3');
  });

  it('parses cues without leading numeric IDs by assigning fallback indices', () => {
    const missingIndexSRT = `00:00:01,000 --> 00:00:04,000
First cue without id

00:00:05,000 --> 00:00:08,000
Second cue without id`;

    const { cues, errors } = parseSRT(missingIndexSRT);
    expect(errors).toHaveLength(0);
    expect(cues).toHaveLength(2);
    expect(cues[0]?.id).toBe('1');
    expect(cues[1]?.id).toBe('2');
  });

  it('resiliently captures malformed blocks as errors without throwing', () => {
    const malformedSRT = `1
00:00:01,000 --> 00:00:04,000
Good cue

This is a totally broken block with no timecode

2
00:00:10,000 --> 00:00:15,000
Another good cue`;

    const { cues, errors } = parseSRT(malformedSRT);
    expect(cues).toHaveLength(2);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toMatch(/Invalid block format/);
  });

  it('handles empty input gracefully', () => {
    expect(parseSRT('')).toEqual({ cues: [], errors: [] });
    expect(parseSRT('   \n\n   ')).toEqual({ cues: [], errors: [] });
  });

  describe('stringifySRT', () => {
    it('serializes cues into standard SRT format with trailing newline', () => {
      const cues: SubtitleCue[] = [
        { id: '1', start: 1000, end: 4000, text: 'Hello' },
        { id: '2', start: 5000, end: 8000, text: 'World' },
      ];

      const expected = `1\n00:00:01,000 --> 00:00:04,000\nHello\n\n2\n00:00:05,000 --> 00:00:08,000\nWorld\n`;
      expect(stringifySRT(cues)).toBe(expected);
    });

    it('returns empty string for empty cues array', () => {
      expect(stringifySRT([])).toBe('');
    });
  });

  describe('Property-Based Tests (fast-check)', () => {
    it('timecode to ms and back is strictly lossless for any valid millisecond up to 10 hours', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 10 * 3600 * 1000 }), // up to 10 hours in ms
          (originalMs) => {
            const timecode = msToTimecode(originalMs, 'srt');
            const roundtripMs = timecodeToMs(timecode);
            return roundtripMs === originalMs;
          }
        )
      );
    });

    it('roundtrip parseSRT(stringifySRT(cues)) produces identical cues for valid cue sets', () => {
      // Arbitrary generator for valid SubtitleCue objects
      const cueArbitrary = fc
        .tuple(
          fc.integer({ min: 0, max: 3_600_000 }),
          fc.integer({ min: 100, max: 10_000 }),
          // Non-empty string without consecutive newlines
          fc.stringMatching(/^[A-Za-z0-9 ,.!?'-]+$/)
        )
        .map(([start, duration, text], idx): SubtitleCue => ({
          id: String(idx + 1),
          start,
          end: start + duration,
          text: text.trim() || 'Sample text',
        }));

      fc.assert(
        fc.property(fc.array(cueArbitrary, { minLength: 1, maxLength: 20 }), (cues) => {
          // Re-index to ensure sequential IDs 1..N
          const normalizedCues = cues.map((c, i) => ({ ...c, id: String(i + 1) }));
          const srtText = stringifySRT(normalizedCues);
          const { cues: parsed, errors } = parseSRT(srtText);

          return (
            errors.length === 0 &&
            parsed.length === normalizedCues.length &&
            parsed.every(
              (p, i) =>
                p.id === normalizedCues[i]?.id &&
                p.start === normalizedCues[i]?.start &&
                p.end === normalizedCues[i]?.end &&
                p.text === normalizedCues[i]?.text
            )
          );
        })
      );
    });
  });
});
