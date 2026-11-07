import { UIError } from '../i18n/index.js';
import { LIMITS, validateSource } from './limits.js';

export const SOURCE_LINK_LIMIT = 16 * 1024;
const queryKeys = ['gist', 'repo', 'file', 'ref', 'rev'];
const hashKeys = ['code', 'encoding', 'v'];
const invalid = () => new UIError('share.invalid');
const revision = /^[a-f\d]{40}$/i;
export const isRevision = (value) => revision.test(value || '');

function singleValues(params, keys) {
  if (keys.some((key) => params.getAll(key).length > 1)) throw invalid();
}
function validFile(value) {
  return (
    value &&
    !/[\\\x00-\x1f\x7f]/.test(value) &&
    !value.split('/').some((part) => !part || part === '.' || part === '..')
  );
}

export function parseSourceLink(input) {
  const url = new URL(input);
  const query = url.searchParams;
  const hash = new URLSearchParams(url.hash.slice(1));
  const kinds = [hash.has('code'), query.has('gist'), query.has('repo')];
  const count = kinds.filter(Boolean).length;
  if (query.has('code') || hash.has('gist') || hash.has('repo')) throw invalid();
  singleValues(query, queryKeys);
  singleValues(hash, hashKeys);
  if (!count) {
    if (queryKeys.some((key) => query.has(key)) || hashKeys.some((key) => hash.has(key)))
      throw invalid();
    return null;
  }
  if (count !== 1) throw new UIError('share.conflict');
  if (url.href.length > SOURCE_LINK_LIMIT) throw new UIError('share.linkLimit');
  try {
    // URLSearchParams replaces malformed UTF-8. Reject it instead of changing code.
    decodeURIComponent(url.search.slice(1).replace(/\+/g, ' '));
    decodeURIComponent(url.hash.slice(1).replace(/\+/g, ' '));
  } catch {
    throw invalid();
  }
  if (kinds[0]) {
    if (queryKeys.some((key) => query.has(key))) throw invalid();
    const encoding = hash.get('encoding') ?? 'plain';
    if ((hash.get('v') ?? '1') !== '1' || !['plain', 'gzip'].includes(encoding)) throw invalid();
    return { kind: 'code', code: hash.get('code'), encoding };
  }
  if (hashKeys.some((key) => hash.has(key))) throw invalid();
  const file = query.get('file');
  if (file !== null && !validFile(file)) throw invalid();
  if (kinds[1]) {
    const gist = query.get('gist');
    const rev = query.get('rev');
    if (!/^[a-f\d]{5,64}$/i.test(gist) || query.has('ref') || (rev !== null && !isRevision(rev)))
      throw invalid();
    return { kind: 'gist', gist, file, rev };
  }
  const repo = query.get('repo');
  const ref = query.get('ref');
  if (
    !/^[\w.-]+\/[\w.-]+$/.test(repo) ||
    repo.split('/').some((part) => part === '.' || part === '..') ||
    !file ||
    query.has('rev') ||
    (ref !== null && (!ref || ref.length > 255 || /[\x00-\x1f\x7f]/.test(ref)))
  )
    throw invalid();
  return { kind: 'github', repo, file, ref };
}

// Bound decoded bytes while streaming, including highly compressed payloads.
export async function readBounded(stream, limit, errorKey, signal) {
  const reader = stream.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      signal?.throwIfAborted();
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) throw new UIError(errorKey);
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

export function decodeBase64(value, urlSafe = false) {
  const compact = value.replace(/\s/g, '');
  if (
    urlSafe
      ? !/^[\w-]*$/.test(value) || value.length % 4 === 1
      : !/^(?:[A-Za-z\d+/]{4})*(?:[A-Za-z\d+/]{2}==|[A-Za-z\d+/]{3}=)?$/.test(compact)
  )
    throw invalid();
  return Uint8Array.from(
    atob(urlSafe ? value.replace(/-/g, '+').replace(/_/g, '/') : compact),
    (c) => c.charCodeAt(0),
  );
}

export async function decodeSourceLink(link, signal) {
  try {
    let source = link.code;
    if (link.encoding === 'gzip') {
      const stream = new Blob([decodeBase64(link.code, true)])
        .stream()
        .pipeThrough(new DecompressionStream('gzip'));
      const bytes = await readBounded(stream, LIMITS.sourceBytes, 'error.sourceLimit', signal);
      source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    }
    validateSource(source);
    return source;
  } catch (error) {
    if (signal?.aborted || error instanceof UIError) throw error;
    throw invalid();
  }
}

function sourceURL(input) {
  const url = new URL(input);
  for (const key of [...queryKeys, 'code', 'page']) url.searchParams.delete(key);
  url.hash = '';
  return url;
}

export async function embeddedSourceURL(input, source) {
  validateSource(source);
  const plain = sourceURL(input);
  plain.hash = new URLSearchParams({ code: source }).toString();
  let result = plain;
  if (typeof CompressionStream !== 'undefined') {
    const compressed = new Uint8Array(
      await new Response(
        new Blob([source]).stream().pipeThrough(new CompressionStream('gzip')),
      ).arrayBuffer(),
    );
    const encoded = btoa(Array.from(compressed, (byte) => String.fromCharCode(byte)).join(''))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const gzip = sourceURL(input);
    gzip.hash = new URLSearchParams({ v: '1', encoding: 'gzip', code: encoded }).toString();
    if (gzip.href.length < plain.href.length) result = gzip;
  }
  if (result.href.length > SOURCE_LINK_LIMIT) throw new UIError('share.linkLimit');
  return result;
}

export function externalSourceURL(input, link) {
  const url = sourceURL(input);
  const values =
    link.kind === 'gist'
      ? { gist: link.gist, file: link.file, rev: link.rev }
      : { repo: link.repo, file: link.file, ref: link.ref };
  for (const [key, value] of Object.entries(values))
    if (value !== null && value !== undefined) url.searchParams.set(key, value);
  parseSourceLink(url);
  return url;
}
