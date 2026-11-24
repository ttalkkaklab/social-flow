import { createHash, randomUUID } from 'node:crypto';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';

export interface LiveAnswer {
  questions: string[];
  answer: string;
}

function normalize(text: string) {
  return text
    .normalize('NFC')
    .trim()
    .replace(/[?!？！。]+$/u, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

function grams(text: string) {
  const chars = Array.from(normalize(text).toLowerCase());
  return new Set(chars.slice(1).map((c, i) => chars[i] + c));
}

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const valid = (item: LiveAnswer) =>
  typeof item?.answer === 'string' &&
  item.answer.length > 0 &&
  item.answer.length <= 350 &&
  Array.isArray(item.questions) &&
  item.questions.length > 0 &&
  item.questions.every((q) => typeof q === 'string' && q.length > 0 && q.length <= 500);

type DraftFaq = (needed: number, existing: LiveAnswer[], batchIndex: number) => Promise<LiveAnswer[]>;

export class LiveAnswers {
  private learned: LiveAnswer[] = [];
  private anticipated: LiveAnswer[] = [];
  private readonly directory: string;

  constructor(
    private prepared: LiveAnswer[],
    project: string,
    scope: readonly unknown[],
    private fits: (answer: string) => boolean = () => true
  ) {
    const invalid = prepared.find(row => !this.fits(row.answer));
    if (invalid) throw Error('Shorten the configured reaction for "' + invalid.questions[0] + '" to fit a single 15-second live shot.');
    this.directory = join(project, '.social-flow', 'live-answers', hash(JSON.stringify(scope)));
    let files: string[];
    try {
      files = readdirSync(this.directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    for (const file of files.filter((name) => /^faq-[a-f0-9]{64}\.json$/.test(name)).sort()) {
      const row = JSON.parse(readFileSync(join(this.directory, file), 'utf8')) as LiveAnswer;
      if (valid(row) && this.fits(row.answer)) this.anticipated.push(row);
    }
    for (const file of files
      .filter((name) => /^\d{13}-[a-f0-9]{64}\.json$/.test(name))
      .sort()
      .reverse()) {
      const row = JSON.parse(readFileSync(join(this.directory, file), 'utf8')) as LiveAnswer;
      if (valid(row) && this.fits(row.answer)) this.learned.push(row);
    }
  }

  private get rows() {
    return [...this.prepared, ...this.anticipated, ...this.learned];
  }

  get empty() {
    return !this.rows.length;
  }

  expected(count: number, complete?: (answer: string) => boolean) {
    const questions = new Set<string>(),
      bodies = new Set<string>();
    const unique = this.rows
      .filter((row) => {
        if (questions.has(normalize(row.questions[0])) || bodies.has(normalize(row.answer))) return false;
        questions.add(normalize(row.questions[0]));
        bodies.add(normalize(row.answer));
        return true;
      });
    if (!complete || unique.length <= count) return unique.slice(0, count);
    const priority = unique.map(row => ({row, rank: this.prepared.includes(row) ? 0 : complete(row.answer) ? 1 : 2}));
    return priority.sort((a, b) => a.rank - b.rank).slice(0, count).map(item => item.row);
  }

  async plan(count: number, draft: DraftFaq, maxEmptyBatches = 3) {
    let batch = this.expected(count);
    let stalled = 0, batchIndex = 0;
    while (batch.length < count) {
      const next = await draft(Math.min(8, count - batch.length), batch, batchIndex++);
      for (const row of next) {
        if (
          !valid(row) ||
          !this.fits(row.answer) ||
          this.exact(row.questions[0]) ||
          this.rows.some((r) => normalize(r.answer) === normalize(row.answer))
        )
          continue;
        this.write('faq-' + hash(normalize(row.questions[0])), row);
        this.anticipated.push(row);
        if (this.expected(count).length === count) break;
      }
      const previous = batch.length;
      batch = this.expected(count);
      stalled = batch.length === previous ? stalled + 1 : 0;
      if (stalled >= maxEmptyBatches)
        throw Error(
          'The supplied topic did not yield enough distinct supported FAQ answers. Review the source material before starting.'
        );
    }
    return batch;
  }

  async prepare(
    count: number,
    draft: DraftFaq,
    render: (answer: string) => Promise<void>,
    complete?: (answer: string) => boolean,
    maxEmptyBatches = 3
  ) {
    await this.plan(count, draft, maxEmptyBatches);
    const rows = this.expected(count, complete);
    for (const row of rows) await render(row.answer);
    return rows.length;
  }

  private write(name: string, row: LiveAnswer & { videoPath?: string }) {
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    const final = join(this.directory, name + '.json');
    const temp = final + '.' + randomUUID() + '.tmp';
    writeFileSync(temp, JSON.stringify(row), { flag: 'wx', mode: 0o600 });
    renameSync(temp, final);
  }

  recordDuration(seconds: number) {
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    appendFileSync(join(this.directory, 'render-seconds.log'), Math.ceil(seconds) + '\n', { mode: 0o600 });
  }

  estimate(count: number, complete: (answer: string) => boolean, otherVideos: number, now = Date.now()) {
    const cached = this.expected(count, complete).filter((row) => complete(row.answer)).length;
    const file = join(this.directory, 'render-seconds.log');
    const samples = existsSync(file)
      ? readFileSync(file, 'utf8')
          .trim()
          .split(/\s+/)
          .slice(-40)
          .map(Number)
          .filter((n) => Number.isFinite(n) && n > 0)
          .sort((a, b) => a - b)
      : [];
    const secondsPerVideo = samples.length ? samples[Math.floor(samples.length * 0.75)] : 150;
    const generationSeconds = (count - cached + otherVideos) * secondsPerVideo;
    const bufferSeconds = Math.max(120, Math.ceil(generationSeconds * 0.2));
    return {
      faqCount: count,
      cached,
      otherVideos,
      secondsPerVideo,
      timingBasis: samples.length ? 'observed' : 'initial_estimate',
      generationSeconds,
      bufferSeconds,
      expectedStartTime: new Date(now + (generationSeconds + bufferSeconds) * 1000).toISOString()
    };
  }

  exact(question: string) {
    const key = normalize(question);
    return this.rows.find((row) => row.questions.some((q) => normalize(q) === key));
  }

  search(queries: string[]) {
    const rows = [
      ...new Map([...this.learned, ...this.anticipated, ...this.prepared].map((row) => [row.answer, row])).values()
    ];
    const terms = queries.map(grams);
    const score = (row: LiveAnswer) =>
      Math.max(
        ...row.questions.map((q) => {
          const indexed = grams(q + ' ' + row.answer);
          return terms.reduce((score, query) => {
            const overlap = [...query].filter((term) => indexed.has(term)).length;
            return score + overlap / Math.max(1, query.size);
          }, 0);
        })
      );
    return rows
      .map((row) => ({ row, score: score(row) }))
      .filter((v) => v.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((v) => v.row);
  }

  remember(question: string, answer: string, videoPath: string) {
    const item = { questions: [question], answer, videoPath };
    if (!valid(item) || this.exact(question)) return;
    this.write(Date.now() + '-' + hash(normalize(question)), item);
    this.learned.unshift(item);
  }
}

export function spokenAddress(name: string | undefined, language: string) {
  const clean = name?.normalize('NFC').trim().replace(/^@/, '');
  if (
    !clean ||
    !/^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} _.-]{0,23}$/u.test(clean) ||
    /www\.|\.[a-z]{2,}$/i.test(clean)
  )
    return;
  if (language.split('-')[0] !== 'ko') return clean;
  const stem = clean.replace(/\s*님$/, '').trim();
  return stem ? stem + ' 님' : undefined;
}
