'use strict';

const SCENES_VM_POLICY = Object.freeze({ timeoutMs: 5000, execution: false });

class LiteralParser {
  constructor(source) { this.source = source; this.offset = 0; }
  fail(message) { throw new SyntaxError(`${message} at offset ${this.offset}`); }
  skip() {
    for (;;) {
      const rest = this.source.slice(this.offset);
      const space = /^(?:\s+)/.exec(rest);
      if (space) { this.offset += space[0].length; continue; }
      const line = /^\/\/[^\n]*(?:\n|$)/.exec(rest);
      if (line) { this.offset += line[0].length; continue; }
      const block = /^\/\*[\s\S]*?\*\//.exec(rest);
      if (block) { this.offset += block[0].length; continue; }
      return;
    }
  }
  take(text) { this.skip(); if (!this.source.startsWith(text, this.offset)) this.fail(`expected ${JSON.stringify(text)}`); this.offset += text.length; }
  maybe(text) { this.skip(); if (!this.source.startsWith(text, this.offset)) return false; this.offset += text.length; return true; }
  identifier() {
    this.skip();
    const match = /^[$A-Z_a-z][$\w]*/.exec(this.source.slice(this.offset));
    if (!match) this.fail('expected an identifier');
    this.offset += match[0].length;
    return match[0];
  }
  string() {
    this.skip();
    const quote = this.source[this.offset++];
    if (quote !== '"' && quote !== "'") this.fail('expected a string');
    let out = '';
    while (this.offset < this.source.length) {
      const ch = this.source[this.offset++];
      if (ch === quote) return out;
      if (ch === '\n' || ch === '\r') this.fail('a string cannot contain a raw newline');
      if (ch !== '\\') { out += ch; continue; }
      const escaped = this.source[this.offset++];
      const simple = { b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v', '0': '\0' };
      if (Object.hasOwn(simple, escaped)) { out += simple[escaped]; continue; }
      if (escaped === 'x') {
        const hex = this.source.slice(this.offset, this.offset + 2);
        if (!/^[0-9a-f]{2}$/i.test(hex)) this.fail('invalid hexadecimal escape');
        out += String.fromCodePoint(parseInt(hex, 16)); this.offset += 2; continue;
      }
      if (escaped === 'u') {
        const braced = /^\{([0-9a-f]+)\}/i.exec(this.source.slice(this.offset));
        if (braced) { out += String.fromCodePoint(parseInt(braced[1], 16)); this.offset += braced[0].length; continue; }
        const hex = this.source.slice(this.offset, this.offset + 4);
        if (!/^[0-9a-f]{4}$/i.test(hex)) this.fail('invalid Unicode escape');
        out += String.fromCharCode(parseInt(hex, 16)); this.offset += 4; continue;
      }
      if (escaped === '\n') continue;
      if (escaped === '\r') { if (this.source[this.offset] === '\n') this.offset++; continue; }
      out += escaped;
    }
    this.fail('unterminated string');
  }
  number() {
    this.skip();
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(this.source.slice(this.offset));
    if (!match) this.fail('expected a JSON number');
    this.offset += match[0].length;
    return Number(match[0]);
  }
  value() {
    this.skip();
    const ch = this.source[this.offset];
    if (ch === '"' || ch === "'") return this.string();
    if (ch === '[') return this.array();
    if (ch === '{') return this.object();
    if (ch === '-' || /\d/.test(ch || '')) return this.number();
    const word = this.identifier();
    if (word === 'true') return true;
    if (word === 'false') return false;
    if (word === 'null') return null;
    this.fail(`only literal values are allowed, found ${word}`);
  }
  array() {
    const out = [];
    this.take('[');
    if (this.maybe(']')) return out;
    for (;;) {
      out.push(this.value());
      if (this.maybe(']')) return out;
      this.take(',');
      if (this.maybe(']')) return out;
    }
  }
  object() {
    const out = Object.create(null);
    this.take('{');
    if (this.maybe('}')) return out;
    for (;;) {
      this.skip();
      const key = ['"', "'"].includes(this.source[this.offset]) ? this.string() : this.identifier();
      this.take(':');
      out[key] = this.value();
      if (this.maybe('}')) return out;
      this.take(',');
      if (this.maybe('}')) return out;
    }
  }
  script() {
    const out = Object.create(null);
    for (;;) {
      this.skip();
      if (this.offset === this.source.length) return JSON.parse(JSON.stringify(out));
      if (this.identifier() !== 'window') this.fail('only window.KEY assignments are allowed');
      this.take('.');
      const key = this.identifier();
      this.take('=');
      out[key] = this.value();
      this.maybe(';');
    }
  }
}

/** Parse a literal-only storyboard without executing JavaScript. */
function evaluateWindowScript(source) {
  const plain = new LiteralParser(source).script();
  if (!plain || typeof plain !== 'object' || Array.isArray(plain)) throw new Error('the script did not leave a window object');
  return plain;
}

module.exports = { SCENES_VM_POLICY, evaluateWindowScript };
