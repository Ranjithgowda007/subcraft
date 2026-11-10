import { describe, it, expect } from 'vitest';
import {
  lintCues,
  countGraphemes,
  stripFormattingTags,
  DEFAULT_PROFILES,
} from '../src/linter.js';
import type { SubtitleCue } from '../src/types.js';

describe('Locale-Aware Quality Linter', () => {
  describe('stripFormattingTags', () => {
    it('strips basic HTML formatting tags (<i>, <b>, <u>)', () => {
      expect(stripFormattingTags('<i>Hello</i> <b>World</b>!')).toBe(
        'Hello World!'
      );
    });

    it('strips tags with attributes (<font color="#ff0000">)', () => {
      expect(stripFormattingTags('<font color="red">Warning</font>')).toBe(
        'Warning'
      );
    });

    it('leaves plain text unchanged', () => {
      expect(stripFormattingTags('Plain text without tags.')).toBe(
        'Plain text without tags.'
      );
    });
  });

  describe('countGraphemes', () => {
    it('accurately counts standard ASCII characters', () => {
      expect(countGraphemes('Hello')).toBe(5);
      expect(countGraphemes('')).toBe(0);
    });

    it('accurately counts Kannada grapheme clusters vs UTF-16 code units', () => {
      // 'ವಿದ್ಯಾರ್ಥಿ': .length is 10, but true grapheme count is 5
      expect('ವಿದ್ಯಾರ್ಥಿ'.length).toBe(10);
      expect(countGraphemes('ವಿದ್ಯಾರ್ಥಿ', 'kn')).toBe(5);

      // 'ಬೆಂಗಳೂರು': .length is 8, but true grapheme count is 4
      expect('ಬೆಂಗಳೂರು'.length).toBe(8);
      expect(countGraphemes('ಬೆಂಗಳೂರು', 'kn')).toBe(4);

      // 'ಕನ್ನಡ': .length is 5, but true grapheme count is 4
      expect('ಕನ್ನಡ'.length).toBe(5);
      expect(countGraphemes('ಕನ್ನಡ', 'kn')).toBe(4);
    });
  });

  describe('lintCues - Timing & Structural Rules', () => {
    it('returns empty diagnostics for compliant, well-formed cues', () => {
      const validCues: SubtitleCue[] = [
        { id: '1', start: 1000, end: 3000, text: 'Hello, welcome.' },
        { id: '2', start: 3500, end: 5500, text: 'This is compliant text.' },
      ];

      expect(lintCues(validCues)).toEqual([]);
    });

    it('detects out-of-order cues', () => {
      const cues: SubtitleCue[] = [
        { id: '1', start: 5000, end: 7000, text: 'First' },
        { id: '2', start: 3000, end: 6000, text: 'Second starts earlier' },
      ];

      const diagnostics = lintCues(cues);
      const outOfOrder = diagnostics.find((d) => d.rule === 'out-of-order');

      expect(outOfOrder).toBeDefined();
      expect(outOfOrder?.severity).toBe('error');
      expect(outOfOrder?.cueId).toBe('2');
    });

    it('detects zero or negative duration cues', () => {
      const cues: SubtitleCue[] = [
        { id: '1', start: 2000, end: 2000, text: 'Zero duration' },
        { id: '2', start: 5000, end: 4000, text: 'Negative duration' },
      ];

      const diagnostics = lintCues(cues);
      const errors = diagnostics.filter(
        (d) => d.rule === 'zero-or-negative-duration'
      );

      expect(errors).toHaveLength(2);
      expect(errors[0]?.cueId).toBe('1');
      expect(errors[1]?.cueId).toBe('2');
    });

    it('detects timing overlaps between consecutive cues', () => {
      const cues: SubtitleCue[] = [
        { id: '1', start: 1000, end: 4000, text: 'Cue 1' },
        { id: '2', start: 3500, end: 6000, text: 'Cue 2 overlaps by 500ms' },
      ];

      const diagnostics = lintCues(cues);
      const overlap = diagnostics.find((d) => d.rule === 'overlap');

      expect(overlap).toBeDefined();
      expect(overlap?.severity).toBe('error');
      expect(overlap?.cueId).toBe('2');
      expect(overlap?.message).toContain('500ms');
    });

    it('detects cues below minimum duration (< 800ms)', () => {
      const cues: SubtitleCue[] = [
        { id: '1', start: 1000, end: 1400, text: 'Flash cue 400ms' },
      ];

      const diagnostics = lintCues(cues);
      const minDuration = diagnostics.find((d) => d.rule === 'min-duration');

      expect(minDuration).toBeDefined();
      expect(minDuration?.severity).toBe('warning');
      expect(minDuration?.actual).toBe(400);
    });

    it('detects cues exceeding maximum duration (> 7000ms)', () => {
      const cues: SubtitleCue[] = [
        { id: '1', start: 1000, end: 9000, text: 'Lingering cue 8000ms' },
      ];

      const diagnostics = lintCues(cues);
      const maxDuration = diagnostics.find((d) => d.rule === 'max-duration');

      expect(maxDuration).toBeDefined();
      expect(maxDuration?.severity).toBe('warning');
      expect(maxDuration?.actual).toBe(8000);
    });
  });

  describe('lintCues - Text & Reading Speed Rules', () => {
    it('detects Characters Per Line (CPL) violations', () => {
      const cues: SubtitleCue[] = [
        {
          id: '1',
          start: 1000,
          end: 4000,
          // Line 1 is 50 chars (exceeds default maxCpl of 42)
          text: 'This line is deliberately made to be way too long and exceed the standard line limit.',
        },
      ];

      const diagnostics = lintCues(cues);
      const cplError = diagnostics.find((d) => d.rule === 'max-cpl');

      expect(cplError).toBeDefined();
      expect(cplError?.severity).toBe('warning');
      expect(cplError?.expected).toBe(42);
    });

    it('detects Characters Per Second (CPS) violations', () => {
      const cues: SubtitleCue[] = [
        {
          id: '1',
          start: 1000,
          end: 2000, // 1 second duration
          // 30 characters in 1 second -> 30 CPS (exceeds default maxCps of 20)
          text: 'Super fast reading speed cue!',
        },
      ];

      const diagnostics = lintCues(cues);
      const cpsError = diagnostics.find((d) => d.rule === 'max-cps');

      expect(cpsError).toBeDefined();
      expect(cpsError?.severity).toBe('warning');
      expect(cpsError?.expected).toBe(20);
    });

    it('ignores HTML tags when measuring CPL and CPS', () => {
      const cues: SubtitleCue[] = [
        {
          id: '1',
          start: 1000,
          end: 3000, // 2000ms duration
          // "Hello world" is 11 chars. With tags: 33 chars.
          text: '<i><b><font color="red">Hello world</font></b></i>',
        },
      ];

      // With tags stripped, CPS is (11 / 2000) * 1000 = 5.5 CPS (well below 20)
      const diagnostics = lintCues(cues);
      expect(diagnostics).toHaveLength(0);
    });

    it('verifies Kannada reading speed accurately using grapheme clusters', () => {
      // 10 Kannada words
      const kannadaText = 'ವಿದ್ಯಾರ್ಥಿ ಬೆಂಗಳೂರು'; // 2 words: 5 + 1 space + 4 = 10 graphemes
      const cues: SubtitleCue[] = [
        {
          id: '1',
          start: 1000,
          end: 2000, // 1000ms duration
          text: kannadaText,
        },
      ];

      // Using Indic profile: maxCps is 15.
      // True graphemes: 10 graphemes / 1 sec = 10 CPS (valid! < 15 CPS)
      // If broken .length was used: 19 code units / 1 sec = 19 CPS (would trigger false alarm!)
      const diagnostics = lintCues(cues, DEFAULT_PROFILES['indicKannada']);

      const cpsError = diagnostics.find((d) => d.rule === 'max-cps');
      expect(cpsError).toBeUndefined(); // Passes cleanly! No false alarm!
    });
  });
});
