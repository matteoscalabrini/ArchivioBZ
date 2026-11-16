// The archive's media: the files git does not keep (the downloads, the reports in Word, the
// author's own photographs), which live on this disk and are copied to the private Blob store.
import { execFile } from 'node:child_process';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
export const MEDIA_DIRS = ['research_notes', 'reports', 'Foto Vittoria'];

// localMedia(root) -> [{path, size, mtimeMs}]: every file git ignores under MEDIA_DIRS, path
// relative to root with "/" separators. Tracked files are in the repository already.
export async function localMedia(root) {
  const { stdout } = await run(
    'git',
    ['-c', 'core.quotepath=off', 'ls-files', '-z', '--others', '--ignored', '--exclude-standard', '--', ...MEDIA_DIRS],
    { cwd: root, maxBuffer: 64 * 1024 * 1024 },
  );
  const paths = stdout.split('\0').filter((p) => p && path.posix.basename(p) !== '.DS_Store');
  return Promise.all(paths.map(async (p) => {
    const { size, mtimeMs } = await stat(path.join(root, p));
    return { path: p, size, mtimeMs };
  }));
}

// plan(local, remote) -> {upload, same, orphaned}. remote: Map pathname -> {size, uploadedAt}.
// A file is uploaded when Blob lacks it, holds another size, or holds a copy older than the
// file. What Blob holds and the disk no longer has is only reported: the store is the backup,
// and a lost disk must not empty it.
export function plan(local, remote) {
  const upload = [];
  const same = [];
  for (const file of local) {
    const held = remote.get(file.path);
    const stale = !held || held.size !== file.size || file.mtimeMs > held.uploadedAt.getTime();
    (stale ? upload : same).push(file);
  }
  const here = new Set(local.map((file) => file.path));
  const orphaned = [...remote.keys()].filter((p) => !here.has(p)).sort();
  return { upload, same, orphaned };
}
