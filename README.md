# subcraft

> **Zero-dependency, isomorphic TypeScript engine for subtitle parsing, frame-rate retiming, and Unicode grapheme-cluster quality linting (powered by `Intl.Segmenter`).**

[![npm version](https://img.shields.io/badge/npm-v0.2.0-blue.svg)](https://www.npmjs.com/package/subcraft)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](https://www.npmjs.com/package/subcraft)
[![Tests](https://img.shields.io/badge/tests-51%20passed-brightgreen.svg)](https://vitest.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## Highlights

* **100% Zero Dependencies:** Lightweight and fast. Runs natively in any JavaScript runtime (Browsers, Web Workers, Node.js 20+, and Edge runtimes) without polyfills.
* **Resilient Parsing:** Strips UTF-8 BOM (`\uFEFF`), normalizes mixed line endings (`CRLF`, `CR`, `LF`), and captures syntax errors without crashing or throwing unhandled exceptions.
* **Deterministic Timecode Math:** Lossless millisecond arithmetic with integer precision (`Math.round`), frame-rate drift scaling (`retime`), and linear audio-sync shifting (`shiftTimecodes`).
* **Grapheme-Aware Quality Linter:** Uses the native ECMAScript `Intl.Segmenter` API to measure true visual characters rather than UTF-16 code units—eliminating false reading-speed warnings in Indic scripts (Kannada, Hindi) and emoji-heavy text.
* **First-Class TypeScript:** Authored in strict TypeScript with comprehensive type declarations (`.d.ts` and `.d.cts`) and verified dual ESM/CJS exports via `publint`.

---

## Table of Contents

1. [Installation](#installation)
2. [Quick Start](#quick-start)
3. [Core Modules](#core-modules)
   - [1. SRT Parsing & Resilient Error Collection](#1-srt-parsing--resilient-error-collection)
   - [2. SRT Serialization](#2-srt-serialization)
   - [3. Timecode Conversions](#3-timecode-conversions)
   - [4. Audio Sync & Frame-Rate Drift Retiming](#4-audio-sync--frame-rate-drift-retiming)
   - [5. Locale-Aware Quality Linter](#5-locale-aware-quality-linter)
4. [The Indic / Unicode Grapheme Problem](#the-indic--unicode-grapheme-problem)
5. [Comparison with Legacy Libraries](#comparison-with-legacy-libraries)
6. [API Reference & Types](#api-reference--types)
7. [License](#license)

---

## Installation

```bash
# Using npm
npm install subcraft

# Using pnpm
pnpm add subcraft

# Using yarn
yarn add subcraft
```

---

## Quick Start

```typescript
import { parseSRT, stringifySRT, lintCues, shiftTimecodes } from 'subcraft';

const rawSRT = `1
00:00:01,000 --> 00:00:04,000
Welcome to subcraft!

2
00:00:03,800 --> 00:00:06,000
Overlapping subtitle cue.`;

// 1. Parse SRT text resiliently
const { cues, errors } = parseSRT(rawSRT);
console.log(`Parsed ${cues.length} cues with ${errors.length} syntax errors.`);

// 2. Lint for quality defects (overlaps, reading speed, duration)
const diagnostics = lintCues(cues);
console.log(diagnostics);
// Output flags: Cue 2 overlaps with Cue 1 by 200ms!

// 3. Shift timings by +500ms (to fix audio desync)
const shiftedCues = shiftTimecodes(cues, 500);

// 4. Serialize back to standard SRT string
const updatedSRT = stringifySRT(shiftedCues);
```

---

## Core Modules

### 1. SRT Parsing & Resilient Error Collection

Unlike traditional parsers that throw fatal exceptions when encountering corrupted blocks or missing line numbers, `parseSRT` collects syntax errors alongside successfully parsed cues:

```typescript
import { parseSRT } from 'subcraft';

const { cues, errors } = parseSRT(dirtySubtitleContent);

if (errors.length > 0) {
  errors.forEach(err => {
    console.warn(`Block error around index ${err.index}: ${err.message}`);
    console.warn(`Raw block: "${err.rawBlock}"`);
  });
}
```

* Automatically strips UTF-8 BOM (`\uFEFF`).
* Normalizes Windows (`\r\n`) and Unix (`\n`) newlines.
* Handles missing or non-numeric cue IDs by assigning fallback sequential numbers.

---

### 2. SRT Serialization

Formats structured `SubtitleCue[]` objects back into strict standard SubRip (.srt) syntax:

```typescript
import { stringifySRT, SubtitleCue } from 'subcraft';

const cues: SubtitleCue[] = [
  { id: '1', start: 1000, end: 4000, text: 'Hello world' }
];

const srtString = stringifySRT(cues);
```

---

### 3. WebVTT Parsing, Serialization & Format Conversion

Parse standard WebVTT (`.vtt`) files with headers, `NOTE` comments, and placement settings (`align:middle line:90%`):

```typescript
import { parseVTT, stringifyVTT, srtToVTT, vttToSRT } from 'subcraft';

// 1. Parse WebVTT
const { cues, errors } = parseVTT(vttText);

// 2. Serialize to WebVTT with custom header
const vttOutput = stringifyVTT(cues, { header: 'English SDH' });

// 3. Instant one-line bidirectional format conversion
const webVTT = srtToVTT(rawSRT);   // Convert SRT to WebVTT
const srtText = vttToSRT(rawVTT);   // Convert WebVTT to SRT
```

---

### 3. Timecode Conversions

Convert between standard timecode strings and integer milliseconds without floating-point drift:

```typescript
import { timecodeToMs, msToTimecode } from 'subcraft';

// Convert string to milliseconds
timecodeToMs('00:01:23,456'); // Returns: 83456
timecodeToMs('01:23.456');    // WebVTT short form -> Returns: 83456

// Convert milliseconds to formatted timecode
msToTimecode(83456, 'srt');   // "00:01:23,456"
msToTimecode(83456, 'vtt');   // "00:01:23.456"
```

---

### 4. Audio Sync & Frame-Rate Drift Retiming

#### Linear Shift (`shiftTimecodes`)
Add or subtract a constant offset across all cues (e.g. delaying subtitles by 500ms). Negative results are safely clamped to `0ms`:

```typescript
import { shiftTimecodes } from 'subcraft';

// Shift all cues forward by 1.5 seconds
const delayed = shiftTimecodes(cues, 1500);
```

#### Frame-Rate Scaling (`retime`)
When videos are converted between frame rates (e.g., 24 fps Film to 25 fps PAL television), timecodes drift multiplicatively over time. `retime` applies a scaling ratio, strictly rounding each millisecond with `Math.round`:

```typescript
import { retime } from 'subcraft';

// 24 fps to 25 fps (PAL speed-up): video runs ~4% faster, timecodes compress
const palCues = retime(filmCues, 24 / 25); // ratio: 0.96

// 25 fps to 24 fps (Slowdown): video runs slower, timecodes stretch
const filmCues = retime(palCues, 25 / 24); // ratio: 1.04167
```

---

### 5. Locale-Aware Quality Linter

Inspects subtitles against broadcaster standards (Netflix / BBC style guides):

```typescript
import { lintCues, DEFAULT_PROFILES } from 'subcraft';

// Lint using standard Latin rules (default)
const diagnostics = lintCues(cues);

// Lint using Indic (Kannada) profile
const kannadaDiagnostics = lintCues(cues, DEFAULT_PROFILES.indicKannada);

// Custom profile overrides
const customDiagnostics = lintCues(cues, {
  maxCps: 18,
  maxCpl: 40,
  minDurationMs: 1000,
  maxDurationMs: 6000,
  includeSpaces: true,
  locale: 'kn',
});
```

#### Rules Enforced:
| Rule | Severity | Description | Default Threshold |
| :--- | :---: | :--- | :--- |
| `out-of-order` | `error` | Cue start timestamp is earlier than previous cue start | Ascending chronological order |
| `zero-or-negative-duration` | `error` | Cue duration is zero or negative (`end <= start`) | `end > start` |
| `overlap` | `error` | Cue start timestamp precedes the previous cue's end timestamp | `start >= prevEnd` |
| `min-duration` | `warning` | Cue flashes too quickly for human cognitive reading | Min `800ms` |
| `max-duration` | `warning` | Cue stays on screen for too long, distracting from video | Max `7,000ms` |
| `max-cpl` | `warning` | Line length exceeds display boundary limits | Max `42` CPL (Latin) / `35` CPL (Indic) |
| `max-cps` | `warning` | Reading speed exceeds human reading speed capacity | Max `20` CPS (Latin) / `15` CPS (Indic) |

---

## The Indic / Unicode Grapheme Problem

In standard JavaScript, `string.length` counts **UTF-16 code units**, not visual characters. 

In Indic scripts (such as Kannada, Hindi, Telugu, Tamil), conjunct consonants, viramas, and vowel modifiers (matras) are stored across multiple code units:

```javascript
// Standard JavaScript string.length:
console.log('ವಿದ್ಯಾರ್ಥಿ'.length); // 10 code units!
console.log('ಬೆಂಗಳೂರು'.length);   // 8 code units!
```

If a subtitle validation tool calculates **Characters Per Second (CPS)** using `string.length`, it counts **10 characters** for a 5-character word like `"ವಿದ್ಯಾರ್ಥಿ"`. This **doubles the reading speed calculation**, triggering false-positive "Reading speed too fast!" warnings.

### How `subcraft` Solves This:
`subcraft` uses the native ECMAScript standard **`Intl.Segmenter`** (UAX #29 Unicode grapheme clustering):

```typescript
import { countGraphemes } from 'subcraft';

countGraphemes('ವಿದ್ಯಾರ್ಥಿ', 'kn'); // Accurately returns: 5 graphemes
countGraphemes('ಬೆಂಗಳೂರು', 'kn');   // Accurately returns: 4 graphemes
```

`subcraft` also automatically strips HTML markup (`<i>`, `<b>`, `<font...>`) before counting characters, ensuring that visual styling does not artificially penalize reading speed metrics.

---

## Comparison with Legacy Libraries

| Feature | `subcraft` | `subtitle.js` (legacy) | `srt-parser-2` |
| :--- | :---: | :---: | :---: |
| **Dependencies** | **0 (Zero)** | Depends on Node.js `stream` | 0 |
| **Browser & Web Worker Native** | ✅ **100% Native** | ❌ Requires Node polyfills | ✅ |
| **Built-in Quality Linter** | ✅ **Comprehensive** | ❌ None | ❌ None |
| **Unicode Grapheme CPS / CPL** | ✅ **`Intl.Segmenter`** | ❌ None | ❌ None |
| **Overlap & Chronology Checks** | ✅ **Yes** | ❌ None | ❌ None |
| **Frame-rate Drift Retiming** | ✅ **Yes (`retime`)** | ❌ Only linear shift | ❌ None |
| **Resilient Error Collection** | ✅ **Returns `{ cues, errors }`** | ❌ Throws errors | ❌ Incomplete |
| **Type Definitions** | ✅ **Strict ESM + CJS `.d.ts`** | ⚠️ Partial | ⚠️ Basic |

---

## API Reference & Types

### Data Models

```typescript
export interface SubtitleCue {
  id: string;      // Unique identifier (e.g., "1", "2")
  start: number;   // Integer start time in milliseconds
  end: number;     // Integer end time in milliseconds
  text: string;    // Raw subtitle text payload (may contain newlines)
}

export interface ParseResult {
  cues: SubtitleCue[];
  errors: ParseError[];
}

export interface ParseError {
  index?: number;
  rawBlock: string;
  message: string;
}

export interface LintDiagnostic {
  cueId: string;
  rule: 
    | 'out-of-order'
    | 'zero-or-negative-duration'
    | 'overlap'
    | 'min-duration'
    | 'max-duration'
    | 'max-cpl'
    | 'max-cps';
  severity: 'error' | 'warning';
  message: string;
  expected?: number | string;
  actual?: number | string;
}
```

---

## License

MIT © 2026 [Ranjith Gowda](https://github.com/Ranjithgowda007)
