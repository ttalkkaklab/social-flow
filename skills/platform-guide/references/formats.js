/**
 * formats.js — format preset source of truth (Single Source of Truth)
 *
 * This file holds every constant of both formats. It gathers the numbers that
 * were scattered across builders, templates, reviewers, and docs into one
 * place, and format-lint.js machine-checks the inline mirrors against it.
 *
 * ┌ Consumers ──────────────────────────────────────────────────────────┐
 * │ format-resolve.js  preset → format.env(--sh) / JSON(--json) / URL   │
 * │ format-lint.js     checks the inline mirrors against here (read-only)│
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * Browsers don't read this file — there is no <script src> path from
 * data/<channel>/<topic>/ to the plugin root. Templates carry inline mirrors
 * and the lint cross-checks them.
 *
 * ## The nature of the shorts-9x16 values
 *
 * **Every value is transcribed from what is already hard-coded in today's
 * code.** No new values, no rounding. That identity is the grounds for
 * zero regression and the stage-1 acceptance condition — running
 * format-resolve.js --sh on an existing scenes.js without FORMAT emits output
 * character-identical to today's builder inline defaults. If a value ever
 * needs changing, change it together with the original code (see the
 * file:line references in the grounds comments).
 *
 * ## youtube-long-16x9's provisional flag
 *
 * zone·fonts were filled from the 2026-08-17 desktop-web measurements
 * (safezone-landscape.md). provisional stays because mobile web landscape and
 * the top title bar couldn't be measured, and those two can only move the
 * zone in the narrowing direction.
 *
 * sub is null forever — burn:false means there is nowhere to burn it.
 * format-resolve.js requires sub only for formats with burn enabled. Calls
 * that need zone·fonts while they are null are still rejected with exit 1 —
 * silently falling back to portrait values would only surface after burning
 * 12 minutes of capture.
 */

'use strict';

/**
 * Safe-zone and subtitle coordinates are measured portrait values; landscape
 * is pending. pacing follows the §3.2 table; guards follow the §2.5 emission
 * table as the source of truth.
 */
const FORMATS = {
  'shorts-9x16': {
    label: 'Short-form 9:16',
    provisional: false,

    // video-template.html:41 --w/--h · capture-frames.sh:13 --window-size
    canvas: { w: 1080, h: 1920, fps: 30 },

    // storyboard/SKILL.md:233 · produce/SKILL.md:252 · cost-tiers.md:32-33
    // 1088 because of gpt-image's multiple-of-16 constraint (1080 won't fit).
    image: { gpt: '1088x1920', local: '1088x1920', zoomBase: '1620x2880' },

    // video-template.html:42 --zone-x/--zone-top/--zone-bottom
    zone: { x: 176, top: 190, bottom: 570, anchor: 'top' },

    // Frame-width ratios from storyboard-html-template.html:286~331.
    // Values are absolute px / 1080 and the lint checks them against that CSS.
    fonts: {
      kicker: 0.0315,
      coverTitle: 0.0926,
      stat: 0.1898,
      statLabel: 0.037,
      title: 0.0556,
      capTitle: 0.046,
      capDesc: 0.0324,
      foot: 0.0241,
      floorPx: 24,
      statGuard: 0.1898,
    },

    // build-reel.sh:452-454 ASS header · Style Sub
    sub: {
      playResX: 1080,
      playResY: 1920,
      fontSize: 58,
      marginLR: 250,
      marginV: 380,
      outline: 5,
      shadow: 1.7,
    },

    // §3.2 pacing table. sceneMax=MAX_DUR(build-reel.sh:49),
    // recSceneMax=MAX_SCENE(build-screencast.sh:37) — read by different builders.
    pacing: {
      sceneMin: 4,
      sceneMax: 13,
      recSceneMax: 20,
      charCap: { cover: 40, body: 50 },
      sentMin: 8,
      sentMax: 25,
      rate: 4.5,
      totalMin: 35,
      totalMax: 75,
      totalHard: 90, // the t>90 literal in build-screencast.sh:202
      sceneCountMin: 4,
      sceneCountMax: 7,
    },

    chapters: null, // short-form has no chapter concept

    // scenes-schema.md:280-283 — b-roll slots + motion backgrounds, at most 2 slots total (8s×2)
    video: { aspectRatio: '9:16', generatedSecondsMax: 16 },

    // Two distinct concepts — folding them into one field breaks center zoom
    // the moment panning turns on.
    //   zoomSpan   = total center Ken Burns zoom span per card (build-reel.sh:64 ZOOM_SPAN)
    //   panZoom*   = pan base scale clamp range (§7.1, new for landscape — KB_ZOOM_MIN/MAX)
    // Portrait is panAllowed:false and cards.tsv column 5 is always empty, so it
    // never enters the pan chain.
    kenburns: { zoomSpan: 0.035, panZoomMin: 1.06, panZoomMax: 1.35, panAllowed: false },

    burn: true, // build-reel.sh:66 BURN defaults to 1

    // capture-frames.sh:13. urlFormat absent = today's behavior of no format= in the URL
    capture: { w: 1080, h: 1920, urlFormat: null },

    // Guard keys from the §2.5 emission table — every one is "the value that
    // turns the feature off". These variables don't exist in today's builders,
    // so there is no inline default to check against, and 0 is today's behavior.
    guards: {
      strictDim: 0, // 0 = asset dimension mismatch is a one-line warning
      ovlHold: 0, // 0 = overlay stays for the whole scene (no enable clause at build-screencast.sh:151)
      shrinkWarn: 3.0, // build-screencast.sh:38 — mirror key
      blowupWarn: 0, // 0 = upscale warning off (new, landscape-only)
      strictAr: 0, // build-intro.sh only. Episode builds don't read it
    },

    outroAsset: 'outro.mp4',
    introAsset: 'intro-master.mp4',
    stingerAsset: 'intro-stinger.mp4',

    outputs: ['reel.mp4', 'reel-sub.mp4', 'subs.srt', 'cover.jpg'],
    platforms: ['youtube', 'instagram', 'threads', 'facebook'],
    queueKeys: ['queue', 'queue_instagram'],
    hashtags: { required: ['#Shorts'], forbidden: [] },

    gates: { autoproduce: true, costCapKey: 'max_cost_per_video' },
    midrollThresholdSec: null,
  },

  'youtube-long-16x9': {
    label: 'YouTube long-form 16:9',
    // The safe zone was confirmed with the 2026-08-17 desktop-web measurements
    // (safezone-landscape.md). provisional stays because two surfaces are
    // still unmeasured — mobile web landscape (emulation doesn't take) and the
    // top title bar (renders 0 in this client).
    // Those two can only move the zone in the **narrowing** direction.
    provisional: true,

    canvas: { w: 1920, h: 1080, fps: 30 },

    // The landscape gpt order is 2560x1440 — until the per-pixel pricing key
    // lands, §7.3 pins it at 1920x1088. Local (Z-Image) is 2048x1152.
    image: { gpt: '2560x1440', local: '2048x1152', zoomBase: '2880x1620' },

    // Measured 2026-08-17 — safezone-landscape.md is the source of truth.
    // Coordinates are 1920x1080 canvas units, from DOM rects scaled by
    // S=1920/player-width.
    //   x 96      5% of frame width. The fullscreen button eats 36px worst-case, leaving 60px
    //   top 96    the worst-case 144px top gradient only darkens, doesn't cover. Same value as the width inset
    //   bottom 285  **from the worst-case 2-line subtitle top at y795** (at player width 873px).
    //               User decision (2026-08-17): worst case of 209~285.
    //               The control bar (fixed 59 physical px) sits below the subtitles, so it's included.
    zone: { x: 96, top: 96, bottom: 285, anchor: 'top' },

    // Portrait ratio × 0.72 · floor 24px. Height-proportional (0.5625) drops
    // body text below 20px; width-proportional (1.0) pushes a 2-line title
    // past the zone. Values are written as absolute px / 1920 ratios.
    // Cross-check: cover block = kicker 24 + title 72×1.14×2 lines + stat 148
    //       + label 29 ≈ 409px, inside the 699px zone height; even a 3-line
    //       title (491px) leaves 208px【measured calculation】.
    fonts: {
      kicker: 0.0125,      // 24px — the floor binds
      coverTitle: 0.0375,  // 72px
      stat: 0.0771,        // 148px
      statLabel: 0.0151,   // 29px
      title: 0.0224,       // 43px
      capTitle: 0.0188,    // 36px
      capDesc: 0.0130,     // 25px
      foot: 0.0125,        // 24px — floor
      floorPx: 24,
      statGuard: 0.0771,
    },

    // BURN=0, so there is nowhere to burn. If burn-in ever opens, all six
    // values come together. For reference, YouTube's own subtitles are a
    // constant 48px in canvas units【measured】 — if we ever open burn-in,
    // that value is the starting point, not portrait's 58.
    sub: null,

    pacing: {
      sceneMin: 6,
      sceneMax: 20, // generated-lane card length (MAX_DUR)
      // No scene-length cap on the filmed lane — user decision 2026-08-16.
      // "내가 녹화한 파일도 있을테니까" ("I'll have files I recorded myself") —
      // one recording chunk arriving as one scene is the normal path. null is
      // the semantic source of truth and the resolver emits MAX_SCENE=999999
      // (a transport encoding that avoids touching the awk d>m comparison at
      // build-screencast.sh:136).
      recSceneMax: null,
      charCap: { cover: 70, body: 90 },
      sentMin: 12,
      sentMax: 40,
      rate: 4.5,
      totalMin: 480,
      totalMax: 900,
      totalHard: 1200,
      sceneCountMin: 28,
      sceneCountMax: 70,
    },

    // Generated lane — a human authors the chapters and sets length bands.
    chapters: {
      min: 5,
      max: 10,
      secMin: 45,
      secMax: 120,
      introSecMin: 25,
      introSecMax: 35,
      ytMinSec: 10,
      firstAtZero: true,
    },

    // Filmed lane — the machine derives chapters (user-delegated decision 2026-08-16).
    //
    // Why there is no length band (secMin/secMax) is the point. Chapter
    // boundaries only open at scene starts (scenes-schema §chapter), so a
    // scene always sits whole inside one chapter. On a lane with no scene
    // cap, keeping a chapter cap just moves the cap from 20s to 120s.
    //
    // A count band applies instead. The human writes a single `chapter`
    // string on a scene; timestamps, the 10-second merge, and requirement
    // checks are built by the builder from measured time (cs = totf / fps).
    //
    // The grounds for chapters are not ads — midroll slots are placed in
    // Studio independent of chapters【primary:
    // support.google.com/youtube/answer/6175006 — 'chapter' appears 0 times
    // on that page】. The grounds are navigation. Korean long-form videos
    // effectively never get automatic chapters (0 of 59 unauthored videos ·
    // English 7 of 13, Fisher p≈1.2e-06【measured】), so without authored
    // chapters a viewer has no way to jump to the part they want in a
    // 15-minute lecture.
    chaptersRec: {
      min: 3,           // YouTube requirement. Below this after merging, the file is skipped
      targetMin: 6,     // authoring target — not a gate
      targetMax: 13,
      secMin: null,     // no length band (comment above)
      secMax: null,
      ytMinSec: 10,     // boundaries under 10s fold into the previous chapter
      firstAtZero: true,
      labelSource: 'chapter', // don't copy the scene title — title is a spoken hook
                              // and chapters are description-box search terms;
                              // different registers
    },

    // §7.1 — opening and chapter transitions only, 40s total per episode (8s×5 slots)
    video: { aspectRatio: '16:9', generatedSecondsMax: 40 },

    // zoomSpan matches portrait (center zoom is format-independent). panZoom*
    // is §7.1's pan ceiling — travel = W(z-1), so 1.35 means exactly 35%.
    kenburns: { zoomSpan: 0.035, panZoomMin: 1.06, panZoomMax: 1.35, panAllowed: true },

    burn: false, // YouTube gets a clean master + subs.srt

    capture: { w: 1920, h: 1080, urlFormat: 'wide' },

    guards: {
      strictDim: 1,
      ovlHold: 5.0, // lower-third display length (from scene start)
      shrinkWarn: 3.0, // direction-independent — canvas width isn't in the output glyph-px formula
      blowupWarn: 1.0, // SHRINK<1 means upscaling. The crop 1080~1920 band is the trap
      strictAr: 1,
    },

    outroAsset: 'outro-16x9.mp4',
    introAsset: 'intro-master-16x9.mp4',
    stingerAsset: 'intro-stinger-16x9.mp4',

    outputs: ['reel.mp4', 'subs.srt', 'cover.jpg', 'thumbnail.jpg'],
    platforms: ['youtube'],
    queueKeys: ['queue_youtube_long'],
    hashtags: { required: [], forbidden: ['#Shorts'] },

    gates: { autoproduce: false, costCapKey: 'max_cost_per_video_long' },
    midrollThresholdSec: 480,
  },
};

/** The format a scenes.js without window.FORMAT gets. This constant is the definition of zero regression. */
const DEFAULT_FORMAT = 'shorts-9x16';

module.exports = { FORMATS, DEFAULT_FORMAT };
