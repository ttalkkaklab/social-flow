'use strict';

// Whole-word forms apply before or after the script, regardless of quotation
// style or punctuation. Receipts and new requests use the same vocabulary.
const utterance = new RegExp([
  String.raw`\b(?:talk|comment|remark|announce|gossip|whisper|murmur|mutter|utter|shout|yell|blurt|rasp|chant|ask|scream|snarl|growl|bellow|croon|plead|stammer|stutter|repeat|exclaim)(?:s|ed|ing)?\b`,
  String.raw`\b(?:say|says|saying|said|tell|tells|telling|told|speak|speaks|speaking|spoke|spoken|sing|sings|singing|sang|sung|reply|replies|replied|replying|hiss|hisses|hissed|hissing)\b`,
  String.raw`\b(?:vocaliz|pronounc|enunciat|articulat|recit|inton)(?:e|es|ed|ing)\b`,
  String.raw`\b(?:chat|chats|chatted|chatting|converse|converses|conversed|conversing|gossips|gossiped|gossiping|addresses? (?:him|her|them)|calls? (?:out|after)|utters? a sound|addresses the|delivers? (?:a|the|her|his) line|exchanges? words|breaks? (?:her|his|the) silence|raises? (?:her|his|their) voice|in (?:a|an) (?:\w+ ){0,3}voice|narrates?|narrating)\b`,
  String.raw`\b(?:lips?|mouth)\s+(?:form|shape|synchroniz|mimic)(?:e|es|s|ed|ing)?\b|\b(?:mouths|mouthed|mouthing|lip[- ]syncs?|voice repeats|out loud|aloud|under (?:his|her|their) breath)\b`,
].join('|'), 'iu');

// Keep storage paths, cast identifiers and encoded media out of the prose scan.
const proseFields = new Set(['prompt','negativePrompt','negative_prompt','description','position','action','emotion','camera',
  'staging','framing','blocking','sound','audio','closingState','direction','cue','purpose','text','state']);
function* pictureProse(value, positiveOnly = false) {
  if (typeof value === 'string') yield value;
  else if (Array.isArray(value)) {
    for (const item of value) yield* pictureProse(item, positiveOnly);
  } else if (value && typeof value === 'object') {
    for (const [key,item] of Object.entries(value)) {
      if (positiveOnly && (key === 'negativePrompt' || key === 'negative_prompt')) continue;
      if (typeof item !== 'string' || proseFields.has(key)) yield* pictureProse(item, positiveOnly);
    }
  }
}

/** Reject a private script copied into picture direction. Ordinary words shared with a
 * visual cue (e.g. "the door") remain usable. Spoken turns are checked separately. */
function checkVoiceoverDirection(direction, lines, compiled = false) {
  const fixed = compiled ? [require('./scene-acting.js').VIDEO_TEXT_POLICY,
    'Start from the given first frame.', 'Audio: no music.', 'All visible mouths stay closed.',
    'No speech or vocalization.', 'All visible mouths stay closed; perform the planned silent action.'] : [];
  const normalize = (text) => text.normalize('NFKC').replace(/[‘’ʼ]/gu, "'")
    .replace(/[‐‑‒–—]/gu, '-').replace(/[^\S\n]+/gu, ' ').trim();
  const scripts = lines.flatMap(line => {
    if (line.delivery !== 'voiceover' || typeof line.tts !== 'string') return [];
    const words = normalize(line.tts);
    const tokens = words.match(/[\p{L}\p{M}\p{N}]+(?:'[\p{L}\p{M}\p{N}]+)*/gu) || [];
    if (!tokens.length) return [];
    // Providers can speak identical words with different quotes, pauses or hyphens.
    const occurrence = new RegExp(`(?<![\\p{L}\\p{N}])${tokens.join('[\\p{P}\\s]+')}(?![\\p{L}\\p{N}])`, 'giu');
    return [{id:line.id, tokens, occurrence}];
  });
  // Only allow an overlap if the words have a visible grammatical role in this
  // clause. A list of speaking verbs cannot cover every way to direct a reading.
  const clauseBreak = /[.!?…。！？;\n]|\b(?:while|whereas|as|when|and|then|but)\b/iu;
  const article = /^(?:the|an?|my|our|your|his|her|their|this|that|these|those)$/iu;
  const objectLead = /\b(?:the|an?|one|another|each|my|our|your|his|her|their|at|to|from|towards?|on|near|behind|beside|under|over|with|of|in|through|around|into|against)$/iu;
  const motion = /\b(?:clos|open|unlatch|latch|slam|fasten|unfasten|push|pull|lift|lower|unlock|lock|touch|grab|grasp|take|took|tak|reach|point|turn|walk|run|step|stand|stood|sit|sat|lean|glanc|look|watch|mov|slid|rais|drop|press|hold|held|brush|plac|set|tap|swing|swung|sway|draw|drew|fold|unfold|paint|repaint|trac|squeez|grip|clutch|cross|enter|leav|left|cover|reveal|shut|catch|caught|pass|rest|shift|tilt|pan|rack|fram|track|follow|focus|cut|linger|hang|hung|lie|lay|fall|fell)\w*\b/iu;
  const perception = /\b(?:watch(?:es|ed|ing)?|see(?:s|ing)?|saw|feel(?:s|ing)?|felt|notice[ds]?|observ(?:e[ds]?|ing))\s+/iu;
  const subject = /^(?:he|she|it|they|we|you|I|(?:(?:the|an?|his|her|their|both|those|these|its|our|my|two|three|four|several|some|many)\s+(?:[\p{L}-]+\s+){0,3})?(?:hands?|feet|footsteps?|wheels?|eyes?|fingers?|needles?|clocks?|trains?|cars?|buses|friends?|children|kids?|women|men|actors?|people|crowds?|doors?|lights?))$/iu;
  const visiblePredicate = /^(?:stops?|waits?|moves?|turns?|opens?|closes?|falls?|rises?|shakes?|trembles?|drifts?|pauses?|lifts?|drops?|stills?|freezes?|slows?|starts?|settles?)$/iu;
  const performanceMedium = /\b(?:lips?|mouth|voice|throat|tongue|lyrics?|text|subtitles?|captions?|lettering|words?)\b/iu;
  function copiedScript(picture, script) {
    for (const hit of picture.matchAll(script.occurrence)) {
      const before = picture.slice(0, hit.index).split(clauseBreak).pop().trim();
      const after = picture.slice(hit.index + hit[0].length).split(clauseBreak, 1)[0].trim();
      // Quotation or attribution makes the matching words a script, even in a
      // sentence that also contains a visual action. Ignore unrelated nearby beats.
      if (/["“'「:,\-]$/u.test(before) || /^["”'」,:\-]/u.test(after) ||
          utterance.test(before) || utterance.test(after) || performanceMedium.test(before) || performanceMedium.test(after)) return true;
      const tail = before.split(motion);
      const complement = tail.at(-1).trim();
      const governed = tail.length > 1 && (!complement || objectLead.test(complement) && !/\b(?:and|that|which|who|reading|written|displaying|saying|singing)\b/iu.test(complement));
      if (governed && (article.test(script.tokens[0]) || objectLead.test(before))) continue;
      if (!before && article.test(script.tokens[0]) && motion.test(after)) continue;
      if (script.tokens.length === 1 && visiblePredicate.test(hit[0]) && before) {
        const observed = before.split(perception).pop();
        const namedPair = /(?:^|[.!?;\n]\s*)\p{Lu}[\p{L}'-]* and \p{Lu}[\p{L}'-]*\s*$/u.test(picture.slice(0,hit.index));
        if ((subject.test(observed) || namedPair) && (!after || /^(?:at|on|in|for|by|near|beside|behind|under|over|until|outside|inside|together|still|slowly)\b/iu.test(after))) continue;
      }
      return true;
    }
    return false;
  }
  if (!scripts.length) return;
  for (const value of pictureProse(direction)) {
    const picture = normalize(fixed.length ? value.split(/(?<=[.!?])\s+|\n+/u)
      .filter(sentence => !fixed.includes(sentence.trim()))
      .map(sentence => sentence.startsWith('Audio: ') ? sentence.replace(/, no music\.$/u, '.') : sentence)
      .join('\n') : value);
    const match = scripts.find(script => copiedScript(picture, script));
    if (match) throw new Error('video_voiceover_embedded: rewrite the picture direction as an observable action separate from the voiceover for ' + (match.id || 'this line'));
  }
}

// Global positive instructions apply to every shot. Include the selected shot's
// directions, images and active cues; a neighboring shot owns its physical turns.
function checkThoughtPerformance(direction) {
  for (const words of pictureProse(direction, true)) {
    for (const clause of words.split(/[.!?;\n]|\b(?:while|whereas|as|and|but)\b/iu)) {
      const prose = clause.replace(/\b(?:mouths?|lips?)\s+(?:stay|stays|remain|remains|are|is) (?:closed|still)\b/giu, '')
        .replace(/\brepeat(?:s|ed|ing)? (?:the|a|his|her|their) (?:gesture|movement|action|step|motion)\b/giu, '');
      const signals = prose.matchAll(new RegExp(utterance.source,'giu'));
      const positive = Array.from(signals).some(hit => !/\b(?:never|without|not|doesn't|don't|no)\s*$/iu.test(prose.slice(0,hit.index)));
      const quotation = /["“「]|(?:^|[\s:,])['‘](?=[\p{L}\p{N}])/u.test(prose);
      if (!quotation && /^\s*(?:the |a )?(?:radio|kettle|steam|wind|leaves|engine|pipes)\b/iu.test(prose)) continue;
      if (positive || quotation && !/\b(?:sign|label|poster|printed|inscription|engraved)\b/iu.test(prose))
        throw new Error('video_voiceover_embedded: the thought interval directs an audible or mouthed line');
    }
  }
}

function checkRecordedThoughtPicture(globalDirection, shot, lines) {
  const directions = [globalDirection,shot];
  try {
    checkVoiceoverDirection(directions,lines,true);
    checkThoughtPerformance(directions);
  } catch (error) {
    throw new Error('speech_video_source_mismatch: ' + error.message);
  }
}

module.exports = {checkVoiceoverDirection, checkThoughtPerformance, checkRecordedThoughtPicture};
