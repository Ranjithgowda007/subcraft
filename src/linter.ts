import type {
  SubtitleCue,
  LintDiagnostic,
  LintProfile,
} from './types.js';

/** Default quality profiles for subtitle verification */
export const DEFAULT_PROFILES: Record<string, LintProfile> = {
  standardLatin: {
    name: 'Standard Latin (Netflix/BBC Style Guide)',
    locale: 'en',
    maxCps: 20,
    maxCpl: 42,
    minDurationMs: 800,
    maxDurationMs: 7000,
    includeSpaces: true,
  },
  indicKannada: {
    name: 'Indic - Kannada Locale',
    locale: 'kn',
    maxCps: 15,
    maxCpl: 35,
    minDurationMs: 800,
    maxDurationMs: 7000,
    includeSpaces: true,
  },
};

/**
 * Strips HTML formatting tags from subtitle text before measuring character limits.
 * Handles <i>, <b>, <u>, <font color="...">, etc.
 */
export function stripFormattingTags(text: string): string {
  return text.replace(/<[^>]*>/g, '');
}

/**
 * Counts user-perceived grapheme clusters using native ECMAScript Intl.Segmenter.
 * Accurately measures multi-byte conjuncts and vowel modifiers in Indic scripts (Kannada, Hindi),
 * as well as emojis and complex Unicode characters without UTF-16 code unit inflation.
 */
export function countGraphemes(text: string, locale: string = 'en'): number {
  if (!text) return 0;

  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter(locale, { granularity: 'grapheme' });
    let count = 0;
    // Iterate over segments efficiently without allocating full array
    for (const _ of segmenter.segment(text)) {
      count++;
    }
    return count;
  }

  // Fallback for environments lacking Intl.Segmenter
  return [...text].length;
}

/**
 * Inspects an array of SubtitleCues against timing, structural, and reading speed rules.
 *
 * Rules verified:
 * - out-of-order: Cues not in ascending chronological order
 * - zero-or-negative-duration: Cues where end <= start
 * - overlap: Cues overlapping chronologically with preceding cues
 * - min-duration: Cues flashing too fast for comprehension (< 800ms)
 * - max-duration: Cues remaining on screen too long (> 7000ms)
 * - max-cpl: Any line exceeding characters-per-line limit
 * - max-cps: Reading speed exceeding characters-per-second limit
 *
 * @param cues - Array of SubtitleCue objects to inspect
 * @param customProfile - Optional custom thresholds or language profile
 * @returns Array of LintDiagnostic reports
 */
export function lintCues(
  cues: readonly SubtitleCue[],
  customProfile?: Partial<LintProfile>
): LintDiagnostic[] {
  const diagnostics: LintDiagnostic[] = [];
  if (!cues || cues.length === 0) return diagnostics;

  const profile: LintProfile = {
    ...DEFAULT_PROFILES['standardLatin']!,
    ...customProfile,
  };

  const {
    locale = 'en',
    maxCps,
    maxCpl,
    minDurationMs,
    maxDurationMs,
    includeSpaces = true,
  } = profile;

  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    if (!cue) continue;

    const prevCue = i > 0 ? cues[i - 1] : undefined;
    const duration = cue.end - cue.start;

    // --- TIMING RULES ---

    // 1. Out-of-order check
    if (prevCue && cue.start < prevCue.start) {
      diagnostics.push({
        cueId: cue.id,
        rule: 'out-of-order',
        severity: 'error',
        message: `Cue starts at ${cue.start}ms before previous cue start of ${prevCue.start}ms.`,
        expected: `start >= ${prevCue.start}`,
        actual: `start = ${cue.start}`,
      });
    }

    // 2. Zero or negative duration check
    if (cue.end <= cue.start) {
      diagnostics.push({
        cueId: cue.id,
        rule: 'zero-or-negative-duration',
        severity: 'error',
        message: `Cue has invalid duration (${duration}ms). End timestamp must be greater than start timestamp.`,
        expected: `end > ${cue.start}`,
        actual: `end = ${cue.end}`,
      });
    }

    // 3. Overlap check (only if not out-of-order)
    if (prevCue && cue.start < prevCue.end && cue.start >= prevCue.start) {
      const overlapMs = prevCue.end - cue.start;
      diagnostics.push({
        cueId: cue.id,
        rule: 'overlap',
        severity: 'error',
        message: `Cue overlaps with previous cue by ${overlapMs}ms.`,
        expected: `start >= ${prevCue.end}`,
        actual: `start = ${cue.start}`,
      });
    }

    // 4. Min duration check (only if duration is positive)
    if (duration > 0 && duration < minDurationMs) {
      diagnostics.push({
        cueId: cue.id,
        rule: 'min-duration',
        severity: 'warning',
        message: `Cue duration of ${duration}ms is below the minimum threshold of ${minDurationMs}ms.`,
        expected: minDurationMs,
        actual: duration,
      });
    }

    // 5. Max duration check
    if (duration > maxDurationMs) {
      diagnostics.push({
        cueId: cue.id,
        rule: 'max-duration',
        severity: 'warning',
        message: `Cue duration of ${duration}ms exceeds the maximum threshold of ${maxDurationMs}ms.`,
        expected: maxDurationMs,
        actual: duration,
      });
    }

    // --- TEXT & PERCEPTION RULES ---

    const rawText = cue.text || '';
    const cleanText = stripFormattingTags(rawText);

    // 6. Characters Per Line (CPL) check
    const lines = cleanText.split('\n');
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      if (!line) continue;

      const cpl = countGraphemes(line, locale);
      if (cpl > maxCpl) {
        diagnostics.push({
          cueId: cue.id,
          rule: 'max-cpl',
          severity: 'warning',
          message: `Line ${lineIndex + 1} has ${cpl} characters, exceeding the maximum limit of ${maxCpl} CPL.`,
          expected: maxCpl,
          actual: cpl,
        });
      }
    }

    // 7. Characters Per Second (CPS) reading speed check
    if (duration > 0) {
      const textToMeasure = includeSpaces
        ? cleanText
        : cleanText.replace(/\s+/g, '');

      const totalGraphemes = countGraphemes(textToMeasure, locale);
      const cps = Number(((totalGraphemes / duration) * 1000).toFixed(1));

      if (cps > maxCps) {
        diagnostics.push({
          cueId: cue.id,
          rule: 'max-cps',
          severity: 'warning',
          message: `Reading speed of ${cps} CPS exceeds maximum limit of ${maxCps} CPS.`,
          expected: maxCps,
          actual: cps,
        });
      }
    }
  }

  return diagnostics;
}
