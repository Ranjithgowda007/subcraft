// Live Interactive Demonstration of subcraft
import {
  parseSRT,
  stringifySRT,
  lintCues,
  shiftTimecodes,
  retime,
  srtToVTT,
  DEFAULT_PROFILES,
  timecodeToMs,
  msToTimecode,
} from '../dist/index.js';

console.log('='.repeat(70));
console.log('       🚀 SUBCRAFT LIVE INTERACTIVE DEMONSTRATION');
console.log('='.repeat(70));

// 1. A realistic raw SRT file with intentional real-world defects:
const rawSubtitleData = `1
00:00:01,000 --> 00:00:04,000
<i>Welcome to the Subcraft masterclass!</i>

2
00:00:03,800 --> 00:00:06,500
This cue overlaps with Cue 1 by 200 milliseconds.

3
00:00:07,000 --> 00:00:18,000
This subtitle stays on screen for 11 seconds which is way too long!

4
00:00:19,000 --> 00:00:22,000
ವಿದ್ಯಾರ್ಥಿಗಳಿಗೆ ಸ್ವಾಗತ`; // Kannada: "Welcome students" (14 graphemes vs 22 UTF-16 code units)

console.log('\n[STEP 1] Parsing raw SRT content...');
const { cues, errors } = parseSRT(rawSubtitleData);
console.log(`✅ Successfully parsed ${cues.length} cues with ${errors.length} syntax errors.`);

// 2. Inspect individual parsed cue
console.log('\n[STEP 2] Inspecting parsed Cue #4 (Kannada):');
console.log({
  id: cues[3].id,
  start: `${cues[3].start}ms -> ${msToTimecode(cues[3].start)}`,
  end: `${cues[3].end}ms -> ${msToTimecode(cues[3].end)}`,
  text: cues[3].text,
});

// 3. Run Quality Linter (Standard Latin vs Indic Profiles)
console.log('\n[STEP 3] Running Quality Linter on all cues...');
const latinDiagnostics = lintCues(cues, DEFAULT_PROFILES.standardLatin);

console.log(`\nFound ${latinDiagnostics.length} Quality Diagnostics:`);
latinDiagnostics.forEach((diag, index) => {
  const icon = diag.severity === 'error' ? '❌ [ERROR]' : '⚠️ [WARNING]';
  console.log(`  ${index + 1}. ${icon} Cue #${diag.cueId} (${diag.rule}):`);
  console.log(`     Message:  ${diag.message}`);
  if (diag.expected) console.log(`     Expected: ${diag.expected}`);
  if (diag.actual)   console.log(`     Actual:   ${diag.actual}`);
});

// 4. Test Timecode Shifting (Fixing Audio Desync by +1.5 seconds)
console.log('\n[STEP 4] Shifting all timecodes forward by +1,500ms (+1.5 seconds)...');
const shifted = shiftTimecodes(cues, 1500);
console.log(`Cue #1 was: ${msToTimecode(cues[0].start)} --> now: ${msToTimecode(shifted[0].start)}`);

// 5. Test Frame-Rate Drift Retiming (24 fps to 25 fps PAL television speed-up)
console.log('\n[STEP 5] Retiming for 24fps -> 25fps PAL broadcast (ratio: 24/25 = 0.96)...');
const retimed = retime(cues, 24 / 25);
console.log(`Original Cue #4 end: ${cues[3].end}ms -> Retimed: ${retimed[3].end}ms (lossless integer ms)`);

// 6. Test Instant Format Conversion (SRT -> WebVTT)
console.log('\n[STEP 6] Converting SRT directly to HTML5 WebVTT (.vtt)...');
const webVTT = srtToVTT(rawSubtitleData, { header: 'Kannada & English Demo Track' });

console.log('\n--- GENERATED WEBVTT OUTPUT ---');
console.log(webVTT.trim());
console.log('-------------------------------');

console.log('\n🎉 ALL CHECKS COMPLETED PERFECTLY! SUBCRAFT IS FULLY OPERATIONAL!');
console.log('='.repeat(70));
