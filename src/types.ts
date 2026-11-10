/**
 * Core normalized representation of a single subtitle cue.
 * Timestamps are strictly stored in integer milliseconds.
 */
export interface SubtitleCue {
  /** Unique sequential identifier (e.g. "1", "2") */
  id: string;
  /** Start time in integer milliseconds */
  start: number;
  /** End time in integer milliseconds */
  end: number;
  /** Raw subtitle text content (may contain newlines) */
  text: string;
  /** Optional WebVTT cue placement/styling settings (e.g., "align:middle line:90%") */
  settings?: string;
}

/**
 * Calculates the duration of a cue in milliseconds.
 * Derived helper function to keep the core data model minimal and immutable.
 */
export const getCueDuration = (cue: SubtitleCue): number => cue.end - cue.start;

/** Supported subtitle file formats */
export type TimecodeFormat = 'srt' | 'vtt';

/**
 * Detailed error reported when a cue block fails parsing syntax rules.
 */
export interface ParseError {
  index?: number;
  rawBlock: string;
  message: string;
}

/**
 * Resilient parser result returning successfully parsed cues
 * alongside any syntax errors encountered without throwing.
 */
export interface ParseResult {
  cues: SubtitleCue[];
  errors: ParseError[];
}

/** Severity levels for lint diagnostics */
export type LintSeverity = 'error' | 'warning';

/** Quality rules enforced by the linter */
export type LintRule =
  | 'out-of-order'
  | 'overlap'
  | 'zero-or-negative-duration'
  | 'min-duration'
  | 'max-duration'
  | 'max-cpl'
  | 'max-cps';

/**
 * Diagnostic report produced when a cue violates a quality rule.
 */
export interface LintDiagnostic {
  cueId: string;
  rule: LintRule;
  severity: LintSeverity;
  message: string;
  expected?: number | string;
  actual?: number | string;
}

/**
 * Configuration options for locale-aware subtitle validation.
 */
export interface LintProfile {
  name: string;
  locale?: string;
  maxCps: number;
  maxCpl: number;
  minDurationMs: number;
  maxDurationMs: number;
  includeSpaces?: boolean;
}
