import { randomUUID } from 'node:crypto';
import { renameSync, writeFileSync } from 'node:fs';
export const livePlatformIds = ['youtube', 'tiktok'];
export function saveLiveReceipt(path, receipt) {
    const tmp = path + '.' + randomUUID() + '.tmp';
    writeFileSync(tmp, JSON.stringify(receipt, null, 2), { mode: 0o600, flag: 'wx' });
    renameSync(tmp, path);
}
