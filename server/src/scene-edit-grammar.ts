export type PromptCast = readonly {speaker: string; name: string}[];

// New cast-sensitive prose has to describe a visual cue or an attributed turn.
// The storyboard remains the source for unrestricted creative direction. Its compiled
// sentences pass through unchanged, including model-specific cast and voice declarations.
const actor = 'Ⓢ';
const listener = 'Ⓛ';
const media = 'Ⓜ';
const invalid = 'ⓧ';
const reserved = /[ⓈⓁⓂⓧ]/iu;
const slot = /\{([\p{L}\p{N}_-]+)\.([\p{L}\p{N}_-]+)\}/gu;
const escape = (value: string) => value.replace(/[$.*+?^{}()|[\]\\]/g,'\\$&');
const slotOwner = (id: string) => id.replace(/[^\p{L}\p{N}_-]+/gu,'-').replace(/^-+|-+$/g,'');

// A visual object is a controlled noun phrase. Unrestricted words could introduce a
// second action inside a camera cue. New props and descriptions can be authored on the board.
const material = '(?:brass|metal|glass|wooden|paper|stone|silver|gold|red|blue|green|black|white|brown|small|large|open|closed|left|right|front|back|wet|empty)';
const object = '(?:key|keys|door|doorway|window|lamp|light|desk|table|chair|counter|floor|wall|shelf|rail|hallway|corridor|street|alley|room|mirror|phone|letter|envelope|book|bag|cup|glass|bowl|box|clock|coat|peg|handle|latch|frame|foreground|background|hand|hands|face|eyes|shoulder|shoulders)';
const noun = '(?:the|a|an|her|his|their|its) (?:' + material + ' ){0,3}' + object;
const figure = "(?:Ⓢ(?:['’]s (?:face|eyes|hands?|shoulders?|coat|back))?|Ⓜ)";
const subject = '(?:' + figure + '|' + noun + ')';
const location = '(?:(?:at|by|near|beside|behind|past|through|across|towards?|in front of|away from) ' + subject + ')';
const timing = '(?: (?:after|before|during|following) (?:the )?(?:first|second|third|fourth|next|last|final|opening|closing) (?:spoken )?(?:line|turn|sentence)| until Ⓢ (?:finishes|begins|ends) (?:her|his|their|the) (?:first |last |next |final )?(?:line|turn|sentence))?';
const action = '(?:steps? (?:back|forward|aside)|(?:is |are )?(?:standing|waiting) ' + location +
  '|(?:waits?|stands?|walks?|moves?|leans?|stops?)' + '(?: ' + location + ')?|(?:watches?|sees?|greets?|approaches?) ' + subject +
  '|(?:looks?|glances?|turns?) (?:at|to|towards?) ' + subject +
  '|(?:nods?|smiles?|blinks?|frowns?|shrugs?|pauses?|hesitates?|turns? away)(?: slowly| briefly)?|(?:raises?|lowers?) (?:an eyebrow|her eyes|his eyes|their eyes|a hand)' +
  '|(?:raises?|lifts?) (?:a|her|his|their) hand to answer the (?:door|phone)|exchanges? (?:a glance|glances|a look)(?: ' + location + ')?)';
const stage = new RegExp('^(?:(?:hold on|open on|cut to|show|pan to|push in on|close on) ' + subject +
  '|rack focus from ' + subject + ' to ' + subject +
  '|keep ' + figure + ' (?:sharp|in focus|in frame|still)' +
  '|use a (?:wide|medium|close|tracking) shot of ' + figure + '(?: and ' + figure + ')?' +
  '|Ⓢ(?: and Ⓢ)? ' + action + ')(?: (?:as|while) Ⓢ ' + action + ')?' + timing + '$','iu');
const modelReference = /^(?:(?:follow|track|match) (?:the (?:camera movement|camera move|motion|rhythm|soundtrack) in )?Ⓜ(?: and (?:its )?Ⓜ)?|use Ⓜ(?:, Ⓜ)* for camera movement and motion timing)$/iu;
const castWords = /\b(?:voices?|voiceprints?|vocal|timbres?|accents?|casts?|actors?|actress(?:es)?|performers?|characters?|faces?|facial|identit(?:y|ies)|likeness(?:es)?|portraits?|roles?|parts?)\b/iu;
const speechWords = /\b(?:dialogue|utterances?|spoken|speakers?|speech|lines?|script|sentences?|words?|turns?|conversation|monologue|says?|asks?|adds?|repl(?:y|ies)|responds?|answers?|whispers?|shouts?|speaks?|yells?|tells?|recites?|mutters?|mouths?|lip[- ]?sync\w*)\b/iu;

export class SceneEditGrammar {
  private readonly names = new Map<string,string>();
  private readonly ids = new Map<string,string>();
  private readonly aliases?: RegExp;

  constructor(cast: PromptCast) {
    for (const person of cast) {
      this.ids.set(slotOwner(person.speaker),person.speaker);
      for (const value of [person.speaker,person.name].filter(Boolean)) {
        const key = value.toLowerCase();
        const previous = this.names.get(key);
        this.names.set(key,previous !== undefined && previous !== person.speaker ? invalid : person.speaker);
      }
    }
    const alternatives = [...this.names.keys()].sort((a,b) => b.length-a.length).map(escape);
    if (alternatives.length) this.aliases = new RegExp('(?<![\\p{L}\\p{N}_-])(?:' + alternatives.join('|') + ')(?![\\p{L}\\p{N}_-])','giu');
  }

  private read(text: string, speaker?: string) {
    const owners = new Set<string>();
    const inputs: {source:string; role:string}[] = [];
    const mark = (id: string, isSlot: boolean) => {
      owners.add(id);
      if (id === invalid) return invalid;
      if (!speaker || speaker === id) return actor;
      return isSlot ? invalid : listener;
    };
    if (reserved.test(text)) return {cue:invalid, owners, inputs, bound:false};
    let bound = false;
    let cue = text.replace(slot, (_token, name: string, role: string) => {
      const id = this.ids.get(name);
      if (!id || role === 'motion' || role === 'soundtrack') {
        inputs.push({source:name,role});
        return media;
      }
      bound = true;
      return mark(id,true);
    });
    if (this.aliases) cue = cue.replace(this.aliases, value => mark(this.names.get(value.toLowerCase())!,false));
    return {cue:cue.trim().replace(/\s+/gu,' '),owners,inputs,bound};
  }

  checkStageDirection(text: string, native: boolean): void {
    const {cue,owners,inputs,bound} = this.read(text);
    if (/^\s*\{[^{}]+\}\s*:/u.test(text) || cue.includes(invalid) || bound && owners.size > 1)
      throw new Error('scene_dialogue_speaker: keep the generated inventory and pair a cast slot with its own actor');
    // Strip the matching parenthesized slot from "Hero ({hero.face}) waits by the door".
    const visual = cue.replace(/Ⓢ\s*\(Ⓢ\)/gu,actor);
    if (stage.test(visual)) return;
    if (modelReference.test(visual)) {
      if (/ and its Ⓜ$/iu.test(visual)) {
        const [first,second] = inputs;
        const roles = new Set(inputs.map(input => input.role));
        if (!second || first.source !== second.source || !roles.has('motion') || !roles.has('soundtrack'))
          throw new Error('scene_media_owner: name a video and its own embedded soundtrack');
      }
      if (/^use /iu.test(visual) && inputs.some(input => input.role !== 'motion'))
        throw new Error('scene_media_owner: use a motion reference for camera movement and timing');
      return;
    }
    const speech = native && speechWords.test(cue);
    const cast = (this.names.size > 0 || bound) && (owners.size > 0 || castWords.test(text));
    if (!cast && !speech) {
      if (!native && !this.names.size) return;
      throw new Error('scene_direction_unverified: author this direction on the storyboard, or use a supported camera, blocking or media cue');
    }
    if (speech && !/\b(?:faces?|identit(?:y|ies)|roles?|vocal|voices?)\b/iu.test(cue))
      throw new Error('scene_dialogue_mismatch: write each line with its approved speaker. Put complex timing or acting on the storyboard');
    throw new Error('scene_dialogue_speaker: preserve the cast. Put complex blocking on the storyboard or use a direct camera or blocking cue');
  }

  ownsTurn(clause: string, speaker: string, delivery?: string): boolean {
    let {cue} = this.read(clause.trim().replace(/[:,]$/u,''),speaker);
    if (!cue.startsWith(actor) || cue.includes(invalid)) return false;
    const offScreen = /\boff[- ]screen\b/iu.test(cue);
    if (delivery && offScreen !== (delivery === 'off_screen')) return false;
    // An address can name the listener. A relative clause cannot introduce a second speaker.
    cue = cue.replace(/\s*\((?:Ⓢ|on screen|off screen)(?:,\s*(?:Ⓢ|on screen|off screen))*\)$/iu,'')
      .replace(/,?\s+(?:using|with)\s+Ⓢ$/iu,'').replace(/\s+to\s+Ⓛ$/iu,'')
      .replace(/^Ⓢ\s+(?:looks?|glances?|turns?)\s+(?:at|to|towards?)\s+Ⓛ\s+and\s+/iu,'Ⓢ ')
      .replace(new RegExp('^Ⓢ waits?(?: (?:by|at|near|beside) ' + noun + ')? and ','iu'),'Ⓢ ');
    return /^(?:Ⓢ|Ⓢ\s+(?:says?|asks?|repl(?:y|ies)|answers?|speaks?|whispers?|calls?|shouts?|murmurs?|mutters?|tells?|continues?)(?:\s+\p{L}+ly)?|Ⓢ\s+(?:asks?|tells?|reassures?|greets?|addresses?|thanks?|warns?|comforts?|reminds?)\s+Ⓛ)$/iu.test(cue);
  }
}
