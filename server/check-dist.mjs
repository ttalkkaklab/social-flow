import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const bundle = 'server/dist/bundle.js';
const markers = ['node_modules/../', '/Volumes', '/Users'];
const git = (...args) => execFileSync('git', args, {
  cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
});

function report(label, read) {
  try {
    const text = read();
    const counts = markers.map(marker => text.split(marker).length - 1);
    console.error(`${label} ${bundle}: ${markers.map((marker, i) => `${marker}=${counts[i]}`).join(', ')}`);
    return counts.some(count => count > 0);
  } catch (error) {
    console.error(`${label} ${bundle}: unable to read (${error.message})`);
    return false;
  }
}

// Include staged changes and untracked outputs, as the CI freshness gate does.
const changes = git('status', '--porcelain', '--untracked-files=all', '--', 'server/dist');
if (changes.trim()) {
  console.error('Committed server/dist does not match the build:');
  console.error(changes.trimEnd());
  // A clean CI rebuild overwrites the evidence in the committed bundle.
  const committedPaths = report('HEAD', () => git('show', `HEAD:${bundle}`));
  const builtPaths = report('Working tree', () => readFileSync(new URL('./dist/bundle.js', import.meta.url), 'utf8'));
  if (committedPaths || builtPaths) {
    console.error('워크트리 안에서 npm ci 뒤 다시 빌드 (cd server && npm ci && npm run build).');
  }
  process.exitCode = 1;
} else {
  console.log('server/dist matches the committed build.');
}
