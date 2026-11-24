import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

interface Passage {
  file: string;
  text: string;
}
const supported = /\.(?:md|txt|csv|json|pdf)$/i;

function sourceFiles(input: string): string[] {
  const stat = lstatSync(input);
  if (stat.isSymbolicLink()) return [];
  if (stat.isDirectory())
    return readdirSync(input)
      .filter((name) => !name.startsWith('.'))
      .sort()
      .flatMap((name) => sourceFiles(join(input, name)));
  return stat.isFile() && supported.test(input) ? [input] : [];
}

export function ocrLanguages(language: string, installed: string[]) {
  const locale = new Intl.Locale(language).maximize();
  const pack = installed.find(name => {
    if (locale.language === 'zh') return name === (locale.script === 'Hant' ? 'chi_tra' : 'chi_sim');
    // Tesseract names packs with ISO 639-3 codes, sometimes followed by a script.
    if (!/^[a-z]{3}(?:_[a-z]{4})?$/i.test(name)) return false;
    const candidate = new Intl.Locale(name.replace('_', '-')).maximize();
    return candidate.language === locale.language && candidate.script === locale.script;
  });
  if (!pack) throw Error('Install the Tesseract OCR language pack for ' + language + ' to read the scanned pages.');
  return pack !== 'eng' && installed.includes('eng') ? pack + '+eng' : pack;
}

function extract(file: string, language: string) {
  if (extname(file).toLowerCase() !== '.pdf') return readFileSync(file, 'utf8');
  const options = { encoding: 'utf8' as const, timeout: 120000, maxBuffer: 32 * 1024 * 1024 };
  const pages = execFileSync('pdftotext', ['-layout', file, '-'], options).split('\f');
  if (!pages.at(-1)?.trim()) pages.pop();
  const temp = mkdtempSync(join(tmpdir(), 'live-knowledge-'));
  let ocr: string | undefined;
  try {
    return pages
      .map((page, index) => {
        if (page.trim()) return page;
        const num = String(index + 1),
          prefix = join(temp, 'page');
        execFileSync(
          'pdftoppm',
          ['-f', num, '-l', num, '-singlefile', '-scale-to', '2200', '-png', file, prefix],
          options
        );
        ocr ??= ocrLanguages(language, execFileSync('tesseract', ['--list-langs'], options).trim().split(/\r?\n/));
        return execFileSync(
          'tesseract',
          [prefix + '.png', 'stdout', '-l', ocr],
          options
        );
      })
      .join('\n\n');
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

export const faqPassagesPerBatch = 5;

export class LiveKnowledge {
  readonly fingerprint: string;
  readonly passages: Passage[];
  constructor(project: string, paths: string[], language: string) {
    const files = [
      ...new Set(
        paths.flatMap((input) => {
          const list = sourceFiles(resolve(project, input));
          if (!list.length) throw Error('No supported knowledge documents at ' + input);
          return list;
        })
      )
    ].sort();
    const parts = new Intl.Locale(language);
    const correctedOcr = files.some(file => /\.pdf$/i.test(file)) &&
      (!['en','ko','vi','ja','zh'].includes(parts.language) || parts.language === 'zh' && parts.maximize().script === 'Hant');
    const hash = createHash('sha256').update((correctedOcr ? 'live-index-v2:' : 'live-index-v1:') + language);
    for (const file of files)
      hash.update(JSON.stringify([file, createHash('sha256').update(readFileSync(file)).digest('hex')]));
    this.fingerprint = hash.digest('hex');
    const dir = join(project, '.social-flow', 'live-knowledge');
    const target = join(dir, this.fingerprint + '.json');
    if (!files.length) {
      this.passages = [];
      return;
    }
    if (existsSync(target)) {
      this.passages = JSON.parse(readFileSync(target, 'utf8'));
      return;
    }
    this.passages = files.flatMap((file) => {
      const content = extract(file, language).trim();
      if (!content) throw Error('Could not extract knowledge from ' + basename(file));
      return (content.match(/[\s\S]{1,900}/gu) ?? []).map((text) => ({ file: basename(file), text }));
    });
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const temp = target + '.' + randomUUID() + '.tmp';
    writeFileSync(temp, JSON.stringify(this.passages), { flag: 'wx', mode: 0o600 });
    renameSync(temp, target);
  }

  search(query: string) {
    return this.ranked(query).filter(item => item.score > 0).slice(0, 5).map(item => item.p);
  }

  sample(query: string, offset: number) {
    const ranked = this.ranked(query);
    return Array.from({length:Math.min(ranked.length, faqPassagesPerBatch)},
      (_, i) => ranked[(offset+i) % ranked.length].p);
  }

  private ranked(query: string) {
    if (!this.passages.length) return [];
    const words = query.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? [];
    const terms = new Set(
      words.flatMap((word) => [
        word,
        ...Array.from(word)
          .slice(1)
          .map((c, i) => word[i] + c)
      ])
    );
    return this.passages
      .map((p, i) => {
        const text = p.text.toLowerCase();
        const score = [...terms].reduce((n, t) => n + (text.includes(t) ? t.length : 0), 0);
        return {
          p,
          score,
          order: i
        };
      })
      .sort((a, b) => b.score - a.score || a.order - b.order);
  }
}
