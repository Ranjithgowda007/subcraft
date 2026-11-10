import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { parseVTT, stringifyVTT, srtToVTT, vttToSRT } from '../src/vtt.js';
import type { SubtitleCue } from '../src/types.js';

describe('WebVTT Engine', () => {
  const sampleVTT = `WEBVTT - Demo Track

1
00:00:20.000 --> 00:00:24.400 align:middle line:90%
Hello world!
Second line of text.

NOTE This is a commentary note that should be ignored

00:00:24.600 --> 00:00:27.800
This is cue number two without an ID.`;

  it('parses standard WebVTT with settings, multi-line text, and skips NOTE blocks', () => {
    const { cues, errors } = parseVTT(sampleVTT);

    expect(errors).toHaveLength(0);
    expect(cues).toHaveLength(2);

    expect(cues[0]).toEqual({
      id: '1',
      start: 20000,
      end: 24400,
      settings: 'align:middle line:90%',
      text: 'Hello world!\nSecond line of text.',
    });

    expect(cues[1]).toEqual({
      id: '2',
      start: 24600,
      end: 27800,
      text: 'This is cue number two without an ID.',
    });
  });

  it('parses short WebVTT timecodes without hours (MM:SS.mmm)', () => {
    const shortTimeVTT = `WEBVTT

01:20.500 --> 01:24.000
Short timecode cue`;

    const { cues, errors } = parseVTT(shortTimeVTT);
    expect(errors).toHaveLength(0);
    expect(cues).toHaveLength(1);
    expect(cues[0]?.start).toBe(80500);
    expect(cues[0]?.end).toBe(84000);
    expect(cues[0]?.text).toBe('Short timecode cue');
  });

  it('warns if WEBVTT header signature is missing', () => {
    const missingHeader = `00:00:01.000 --> 00:00:04.000
No header text`;

    const { cues, errors } = parseVTT(missingHeader);
    expect(cues).toHaveLength(1);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('Missing standard "WEBVTT" signature');
  });

  describe('stringifyVTT', () => {
    const cues: SubtitleCue[] = [
      {
        id: '1',
        start: 1000,
        end: 4000,
        text: 'First',
        settings: 'align:center',
      },
      { id: '2', start: 5000, end: 8000, text: 'Second' },
    ];

    it('serializes cues into standard WebVTT format', () => {
      const vtt = stringifyVTT(cues);
      expect(vtt).toContain('WEBVTT\n\n');
      expect(vtt).toContain('00:00:01.000 --> 00:00:04.000 align:center\nFirst');
      expect(vtt).toContain('00:00:05.000 --> 00:00:08.000\nSecond');
    });

    it('supports custom headers and cue IDs', () => {
      const vtt = stringifyVTT(cues, {
        header: 'English Subtitles',
        includeIds: true,
      });

      expect(vtt).toContain('WEBVTT - English Subtitles\n\n');
      expect(vtt).toContain('1\n00:00:01.000 --> 00:00:04.000');
    });

    it('returns minimal header for empty array', () => {
      expect(stringifyVTT([])).toBe('WEBVTT\n');
    });
  });

  describe('Format Converters (srtToVTT and vttToSRT)', () => {
    const srtContent = `1
00:00:01,000 --> 00:00:04,000
Hello from SRT

2
00:00:05,000 --> 00:00:08,000
Second SRT cue`;

    it('converts SRT to valid WebVTT format (commas to dots, header added)', () => {
      const vtt = srtToVTT(srtContent);

      expect(vtt).toContain('WEBVTT\n\n');
      expect(vtt).toContain('00:00:01.000 --> 00:00:04.000');
      expect(vtt).toContain('Hello from SRT');
    });

    it('converts WebVTT back to standard SRT format (dots to commas, header removed)', () => {
      const vtt = srtToVTT(srtContent);
      const srtRoundtrip = vttToSRT(vtt);

      expect(srtRoundtrip).toContain('00:00:01,000 --> 00:00:04,000');
      expect(srtRoundtrip).toContain('Hello from SRT');
      expect(srtRoundtrip).not.toContain('WEBVTT');
    });
  });

  describe('Property-Based Tests (fast-check)', () => {
    it('roundtrip parseVTT(stringifyVTT(cues)) produces identical cues', () => {
      const cueArbitrary = fc
        .tuple(
          fc.integer({ min: 0, max: 3_600_000 }),
          fc.integer({ min: 100, max: 10_000 }),
          fc.stringMatching(/^[A-Za-z0-9 ,.!?'-]+$/)
        )
        .map(([start, duration, text], idx): SubtitleCue => ({
          id: String(idx + 1),
          start,
          end: start + duration,
          text: text.trim() || 'Sample text',
        }));

      fc.assert(
        fc.property(
          fc.array(cueArbitrary, { minLength: 1, maxLength: 20 }),
          (cues) => {
            const vttText = stringifyVTT(cues, { includeIds: true });
            const { cues: parsed, errors } = parseVTT(vttText);

            return (
              errors.length === 0 &&
              parsed.length === cues.length &&
              parsed.every(
                (p, i) =>
                  p.id === cues[i]?.id &&
                  p.start === cues[i]?.start &&
                  p.end === cues[i]?.end &&
                  p.text === cues[i]?.text
              )
            );
          }
        )
      );
    });
  });
});
