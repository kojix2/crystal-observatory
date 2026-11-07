import { UIError } from '../i18n/index.js';
import { LIMITS, validateSource } from '../core/limits.js';
import { decodeBase64, decodeSourceLink, isRevision, readBounded } from '../core/source-link.js';

const API = 'https://api.github.com';
const metadataLimit = 2 * 1024 * 1024;
const segment = (value) => encodeURIComponent(value);

async function request(path, signal, fetcher) {
  const response = await fetcher(`${API}${path}`, {
    signal,
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!response.ok) {
    if (response.status === 404) throw new UIError('share.notFound');
    if (
      response.status === 429 ||
      (response.status === 403 &&
        (response.headers.get('x-ratelimit-remaining') === '0' ||
          response.headers.has('retry-after')))
    )
      throw new UIError('share.rateLimit');
    throw new UIError('share.httpError', { status: response.status });
  }
  const bytes = await readBounded(response.body, metadataLimit, 'share.responseLimit', signal);
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new UIError('share.invalid');
  }
}

function checkSource(source) {
  if (typeof source !== 'string' || source.includes('\0')) throw new UIError('share.invalid');
  validateSource(source);
  return source;
}

async function github(link, signal, fetcher) {
  const repoPath = link.repo.split('/').map(segment).join('/');
  let ref = link.ref;
  if (!isRevision(ref)) {
    // The commits endpoint's omitted sha uses the repository's default branch.
    const query = new URLSearchParams({ per_page: '1' });
    if (ref !== null) query.set('sha', ref);
    const commits = await request(`/repos/${repoPath}/commits?${query}`, signal, fetcher);
    ref = commits[0]?.sha;
    if (!isRevision(ref)) throw new UIError('share.notFound');
  }
  const filePath = link.file.split('/').map(segment).join('/');
  const data = await request(
    `/repos/${repoPath}/contents/${filePath}?${new URLSearchParams({ ref })}`,
    signal,
    fetcher,
  );
  if (data.type !== 'file') throw new UIError('share.notFile');
  if (data.size > LIMITS.sourceBytes) throw new UIError('error.sourceLimit');
  if (data.encoding !== 'base64' || typeof data.content !== 'string')
    throw new UIError('share.incomplete');
  const bytes = decodeBase64(data.content);
  if (bytes.length !== data.size) throw new UIError('share.incomplete');
  let source;
  try {
    source = checkSource(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (error) {
    if (error instanceof UIError) throw error;
    throw new UIError('share.invalid');
  }
  return { source, origin: { ...link, ref } };
}

async function gist(link, signal, fetcher) {
  const suffix = link.rev ? `/${segment(link.rev)}` : '';
  const data = await request(`/gists/${segment(link.gist)}${suffix}`, signal, fetcher);
  const rev = link.rev || data.history?.[0]?.version;
  if (!isRevision(rev) || !data.files || data.truncated) throw new UIError('share.incomplete');
  let file = link.file;
  if (file === null) {
    const files = Object.keys(data.files).filter((name) => name.endsWith('.cr'));
    if (!files.length) throw new UIError('share.notFound');
    if (files.length > 1) return { choices: files, origin: { ...link, rev } };
    file = files[0];
  }
  const entry = Object.hasOwn(data.files, file) ? data.files[file] : null;
  if (!entry) throw new UIError('share.notFound');
  if (entry.size > LIMITS.sourceBytes) throw new UIError('error.sourceLimit');
  if (entry.truncated || typeof entry.content !== 'string') throw new UIError('share.incomplete');
  if (new TextEncoder().encode(entry.content).length !== entry.size)
    throw new UIError('share.incomplete');
  return { source: checkSource(entry.content), origin: { ...link, file, rev } };
}

export async function loadSharedSource(link, { signal, fetcher = fetch, timeoutMs = 15_000 } = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', abort, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    controller.signal.throwIfAborted();
    const result =
      link.kind === 'code'
        ? { source: await decodeSourceLink(link, controller.signal), origin: null }
        : await (link.kind === 'gist' ? gist : github)(link, controller.signal, fetcher);
    controller.signal.throwIfAborted();
    return result;
  } catch (error) {
    if (signal?.aborted) throw error;
    if (timedOut) throw new UIError('share.timeout');
    if (error instanceof UIError) throw error;
    throw new UIError('share.network');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
