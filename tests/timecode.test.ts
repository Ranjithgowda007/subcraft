import { describe, it, expect } from 'vitest';
import {
  timecodeToMs,
  msToTimecode,
  shiftTimecodes,
  retime,
} from '../src/timecode.js';
import type { SubtitleCue } from '../src/types.js';

describe('Timecode Engine', () => {
  describe('timecodeToMs', () => {
    it('parses standard SRT timecodes with comma delimiter', () => {
      expect(timecodeToMs('00:00:01,000')).toBe(1000);
      expect(timecodeToMs('00:01:23,456')).toBe(83456);
      expect(timecodeToMs('02:05:10,500')).toBe(7510500);
      expect(timecodeToMs('00:00:00,000')).toBe(0);
    });

    it('parses standard WebVTT timecodes with dot delimiter', () => {
      expect(timecodeToMs('00:01:23.456')).toBe(83456);
      expect(timecodeToMs('01:23:45.678')).toBe(5025678);
    });

    it('parses short WebVTT timecodes without hours (MM:SS.mmm)', () => {
      expect(timecodeToMs('01:23.456')).toBe(83456);
      expect(timecodeToMs('00:05.100')).toBe(5100);
    });

    it('handles whitespace around timecodes', () => {
      expect(timecodeToMs('   00:01:23,456   ')).toBe(83456);
    });

    it('throws descriptive error on malformed timecodes', () => {
      expect(() => timecodeToMs('invalid-time')).toThrowError(/Invalid timecode format/);
      expect(() => timecodeToMs('00:01:23')).toThrowError(/Invalid timecode format/);
      expect(() => timecodeToMs('00:01:23:456')).toThrowError(/Invalid timecode format/);
    });
  });

  describe('msToTimecode', () => {
    it('formats milliseconds to standard SRT format with comma', () => {
      expect(msToTimecode(0, 'srt')).toBe('00:00:00,000');
      expect(msToTimecode(1000, 'srt')).toBe('00:00:01,000');
      expect(msToTimecode(83456, 'srt')).toBe('00:01:23,456');
      expect(msToTimecode(7510500, 'srt')).toBe('02:05:10,500');
    });

    it('formats milliseconds to WebVTT format with dot', () => {
      expect(msToTimecode(83456, 'vtt')).toBe('00:01:23.456');
    });

    it('defaults to srt format if not specified', () => {
      expect(msToTimecode(83456)).toBe('00:01:23,456');
    });

    it('clamps negative milliseconds to 00:00:00,000', () => {
      expect(msToTimecode(-500)).toBe('00:00:00,000');
    });

    it('floors floating-point inputs', () => {
      expect(msToTimecode(1234.9)).toBe('00:00:01,234');
    });
  });

  describe('shiftTimecodes', () => {
    const mockCues: SubtitleCue[] = [
      { id: '1', start: 1000, end: 4000, text: 'First' },
      { id: '2', start: 5000, end: 8000, text: 'Second' },
    ];

    it('shifts cues forward with positive offset', () => {
      const shifted = shiftTimecodes(mockCues, 500);
      expect(shifted).toEqual([
        { id: '1', start: 1500, end: 4500, text: 'First' },
        { id: '2', start: 5500, end: 8500, text: 'Second' },
      ]);
    });

    it('shifts cues backward with negative offset', () => {
      const shifted = shiftTimecodes(mockCues, -500);
      expect(shifted).toEqual([
        { id: '1', start: 500, end: 3500, text: 'First' },
        { id: '2', start: 4500, end: 7500, text: 'Second' },
      ]);
    });

    it('clamps negative results to 0', () => {
      const shifted = shiftTimecodes(mockCues, -3000);
      expect(shifted[0]).toEqual({
        id: '1',
        start: 0,
        end: 1000,
        text: 'First',
      });
    });

    it('maintains immutability (does not modify original array)', () => {
      const originalCopy = [...mockCues];
      shiftTimecodes(mockCues, 1000);
      expect(mockCues).toEqual(originalCopy);
    });
  });

  describe('retime', () => {
    const mockCues: SubtitleCue[] = [
      { id: '1', start: 1000, end: 3000, text: 'Cue 1' },
      { id: '2', start: 5000, end: 10000, text: 'Cue 2' },
    ];

    it('scales timecodes accurately for 24fps to 25fps PAL speed-up (24/25 = 0.96)', () => {
      const retimed = retime(mockCues, 24 / 25);
      expect(retimed).toEqual([
        { id: '1', start: 960, end: 2880, text: 'Cue 1' },
        { id: '2', start: 4800, end: 9600, text: 'Cue 2' },
      ]);
    });

    it('strictly rounds fractional milliseconds to integers using Math.round', () => {
      // 1000 * 1.0416666... = 1041.666... -> 1042
      const retimed = retime(mockCues, 25 / 24);
      expect(Number.isInteger(retimed[0]?.start)).toBe(true);
      expect(retimed[0]?.start).toBe(1042);
      expect(retimed[0]?.end).toBe(3125);
    });

    it('throws error if ratio is zero or negative', () => {
      expect(() => retime(mockCues, 0)).toThrowError(/Retime ratio must be greater than 0/);
      expect(() => retime(mockCues, -0.5)).toThrowError(/Retime ratio must be greater than 0/);
    });
  });
});
