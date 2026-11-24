import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
const supported = /\.(?:md|txt|csv|json|pdf)$/i;
function sourceFiles(input) {
    const stat = lstatSync(input);
    if (stat.isSymbolicLink())
        return [];
    if (stat.isDirectory())
        return readdirSync(input)
            .filter((name) => !name.startsWith('.'))
            .sort()
            .flatMap((name) => sourceFiles(join(input, name)));
    return stat.isFile() && supported.test(input) ? [input] : [];
}
function extract(file, language) {
    if (extname(file).toLowerCase() !== '.pdf')
        return readFileSync(file, 'utf8');
    const options = { encoding: 'utf8', timeout: 120000, maxBuffer: 32 * 1024 * 1024 };
    const pages = execFileSync('pdftotext', ['-layout', file, '-'], options).split('\f');
    if (!pages.at(-1)?.trim())
        pages.pop();
    const temp = mkdtempSync(join(tmpdir(), 'live-knowledge-'));
    try {
        return pages
            .map((page, index) => {
            if (page.trim())
                return page;
            const num = String(index + 1), prefix = join(temp, 'page');
            execFileSync('pdftoppm', ['-f', num, '-l', num, '-singlefile', '-scale-to', '2200', '-png', file, prefix], options);
            const languages = {
                ko: 'kor+eng',
                en: 'eng',
                vi: 'vie+eng',
                ja: 'jpn+eng',
                zh: 'chi_sim+eng'
            };
            return execFileSync('tesseract', [prefix + '.png', 'stdout', '-l', languages[language.split('-')[0]] ?? 'eng'], options);
        })
            .join('\n\n');
    }
    finally {
        rmSync(temp, { recursive: true, force: true });
    }
}
export const faqPassagesPerBatch = 5;
export class LiveKnowledge {
    fingerprint;
    passages;
    constructor(project, paths, language) {
        const files = [
            ...new Set(paths.flatMap((input) => {
                const list = sourceFiles(resolve(project, input));
                if (!list.length)
                    throw Error('No supported knowledge documents at ' + input);
                return list;
            }))
        ].sort();
        const hash = createHash('sha256').update('live-index-v1:' + language);
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
            if (!content)
                throw Error('Could not extract knowledge from ' + basename(file));
            return (content.match(/[\s\S]{1,900}/gu) ?? []).map((text) => ({ file: basename(file), text }));
        });
        mkdirSync(dir, { recursive: true, mode: 0o700 });
        const temp = target + '.' + randomUUID() + '.tmp';
        writeFileSync(temp, JSON.stringify(this.passages), { flag: 'wx', mode: 0o600 });
        renameSync(temp, target);
    }
    search(query) {
        return this.ranked(query).filter(item => item.score > 0).slice(0, 5).map(item => item.p);
    }
    sample(query, offset) {
        const ranked = this.ranked(query);
        return Array.from({ length: Math.min(ranked.length, faqPassagesPerBatch) }, (_, i) => ranked[(offset + i) % ranked.length].p);
    }
    ranked(query) {
        if (!this.passages.length)
            return [];
        const words = query.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? [];
        const terms = new Set(words.flatMap((word) => [
            word,
            ...Array.from(word)
                .slice(1)
                .map((c, i) => word[i] + c)
        ]));
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
