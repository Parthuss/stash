/** Owner-only content read model and intents. Only the serialized engine tick mutates posts. */
import type { Env } from './index';
import sample from './content-sample';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
});
const SETUP = 'https://github.com/Parthuss/stash/blob/master/promo/engine/SETUP.md';
const POST_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/;
const HASH = /^[a-f0-9]{64}$/;
const FIELDS = ['id', 'kind', 'when', 'tz', 'instagram', 'youtube', 'media_keys', 'cover_key', 'quality_asset_hashes', 'quality_source_hashes'];
const read = async (bucket: R2Bucket, key: string): Promise<any> => {
  const object = await bucket.get(key);
  return object ? object.json() : null;
};
const put = (bucket: R2Bucket, key: string, value: unknown) => bucket.put(key, JSON.stringify(value), { httpMetadata: { contentType: 'application/json' } });

// Same canonical JSON as quality_judge.digest for staged record fields (no non-finite numbers).
function canonical(value: any): any {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
export async function contentHash(record: Record<string, unknown>): Promise<string> {
  const body = JSON.stringify(canonical(Object.fromEntries(FIELDS.map(k => [k, record[k] ?? null]))));
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
  return Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, '0')).join('');
}

function mediaLink(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  // Public samples are committed assets; live drafts stay behind bearer-authenticated streaming.
  if (/^\/content-samples\/[a-zA-Z0-9_./-]+$/.test(value) && !value.includes('..')) return value;
  if (!/^media\/[a-zA-Z0-9_./-]+$/.test(value) || value.includes('..')) return null;
  return '/v1/admin/content/media?key=' + encodeURIComponent(value);
}
function row(post: any): any {
  const preview = post.preview || {};
  return { ...post, preview: { cover: mediaLink(preview.cover), video: mediaLink(preview.video),
    slides: (Array.isArray(preview.slides) ? preview.slides : []).map(mediaLink).filter(Boolean) } };
}

export async function contentOverview(env: Env) {
  const bucket = env.CONTENT_ENGINE;
  let summary: any = sample, control: any = null, unavailable = false;
  if (bucket) {
    try {
      summary = await read(bucket, 'dashboard/summary.json') || sample;
      control = await read(bucket, 'state/paused.json');
    } catch { unavailable = true; }
  }
  const list = (key: string) => (Array.isArray(summary[key]) ? summary[key] : []).slice(0, 100);
  const setup = ['instagram', 'youtube', 'r2', 'telegram', 'engine', 'dry_run'].map(key => {
    const source = (Array.isArray(summary.setup) ? summary.setup : []).find((s: any) => s.key === key) || {};
    const label = ({ instagram: 'Instagram', youtube: 'YouTube', r2: 'Private R2 bucket', telegram: 'Telegram', engine: 'Content engine', dry_run: 'Dry run' } as Record<string, string>)[key];
    const connected = key === 'r2' ? Boolean(bucket && !unavailable) : key === 'dry_run' ? control?.dry_run === true || source.connected === true : source.connected === true;
    return { key, label, connected, status: (key === 'r2' ? (unavailable ? 'Unavailable' : connected ? 'Connected' : 'Not connected') : key === 'dry_run' && control?.dry_run ? 'On' : source.status) || (connected ? 'Connected' : key === 'engine' ? 'Off' : key === 'dry_run' ? 'On by default' : 'Not connected'), href: SETUP + '#' + key };
  });
  return { updated_at: summary.updated_at || null, setup, ideas: list('ideas'), drafts: list('drafts').map(row),
    scheduled: list('scheduled').map(row), posted: list('posted').map(row),
    controls: { configured: Boolean(bucket && env.CONTENT_GH_TOKEN), paused: control?.paused ?? summary.controls?.paused ?? !bucket, can_approve: Boolean(bucket && !unavailable) },
    note: unavailable ? 'Content storage could not be read. Showing local examples; try refreshing.' : summary.note || (!bucket ? 'Connect the content engine to see live drafts. These are local examples.' : null) };
}

export async function contentAction(request: Request, env: Env): Promise<Response> {
  const body = await request.json().catch(() => null) as any;
  const action = body?.action;
  if (!['approve', 'skip', 'research', 'make', 'pause', 'resume'].includes(action)) return json({ error: 'Choose a content action.' }, 400);
  const bucket = env.CONTENT_ENGINE;
  if (!bucket) return json({ error: 'Connect the private content bucket first. See SETUP.md.' }, 409);
  const at = new Date().toISOString();
  try {
    if (action === 'approve' || action === 'skip') {
      if (!POST_ID.test(body.id || '') || !HASH.test(body.content_hash || '')) return json({ error: 'A draft and its current content hash are required.' }, 400);
      const post = await read(bucket, `posts/${body.id}.json`);
      if (!post || await contentHash(post) !== body.content_hash) return json({ error: 'This draft changed. Refresh and review it again.' }, 409);
      const allowed = action === 'approve' ? ['awaiting_approval', 'missed'] : ['awaiting_approval', 'missed', 'approved'];
      if (!allowed.includes(post.status)) return json({ error: 'That draft is no longer awaiting this action. Refresh the queue.' }, 409);
      if (action === 'approve') {
        const report = typeof post.quality_report_key === 'string' && /^quality\/[a-zA-Z0-9_-]+\.json$/.test(post.quality_report_key)
          ? await read(bucket, post.quality_report_key) : null;
        if (!report || report.verdict !== 'PASS' || !Array.isArray(report.errors) || report.errors.length || report.record_digest !== body.content_hash || report.report_digest !== post.quality_report_digest || report.post_id !== post.id) {
          return json({ error: 'The quality gate has not passed for this exact draft. Regenerate and restage it.' }, 409);
        }
      }
      const command_id = crypto.randomUUID();
      await put(bucket, `commands/pending/${command_id}.json`, { action, id: body.id, hash: body.content_hash, at });
      return json({ ok: true, command_id, message: action === 'approve' ? 'Approval queued. The engine will verify the gate and media hashes before approving.' : 'Skip queued. The engine will confirm this draft has not changed.' }, 202);
    }
    if (!env.CONTENT_GH_TOKEN) return json({ error: 'Configure the content workflow token first. See SETUP.md.' }, 409);
    if (action === 'pause' || action === 'resume') {
      // Resume only unpauses the queue. It never enables the workflow or live publishing.
      await put(bucket, 'state/paused.json', { paused: action === 'pause', dry_run: true, at });
    }
    const repo = env.GH_REPO || 'Parthuss/stash';
    if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repo)) return json({ error: 'The content workflow repository is not configured correctly.' }, 409);
    const response = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/content-engine.yml/dispatches`, {
      method: 'POST', headers: { Authorization: `Bearer ${env.CONTENT_GH_TOKEN.trim()}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': 'Skwirl-owner-console', 'X-GitHub-Api-Version': '2022-11-28' },
      body: JSON.stringify({ ref: 'master', inputs: { command: action, dry_run: true } }),
    });
    if (!response.ok) return json({ error: action === 'pause' ? 'Queue paused, but GitHub could not be reached. Check the workflow token.' : 'GitHub could not start that action. Check the workflow token and refresh.' }, 502);
    return json({ ok: true, message: action === 'pause' ? 'Queue paused. A safe workflow run was requested.' : action === 'resume' ? 'Queue resumed in dry run. Live publishing remains a separate setup step.' : `Safe ${action} run requested. Results appear after the workflow completes.` }, 202);
  } catch { return json({ error: 'Content storage could not complete that action. Refresh and try again.' }, 503); }
}

export async function contentMedia(request: Request, env: Env): Promise<Response> {
  if (!env.CONTENT_ENGINE) return json({ error: 'Content media is not connected.' }, 409);
  const key = new URL(request.url).searchParams.get('key') || '';
  if (!/^media\/[a-zA-Z0-9_./-]+$/.test(key) || key.includes('..')) return json({ error: 'Choose a content media file.' }, 400);
  try {
    const object = await env.CONTENT_ENGINE.get(key, { range: request.headers });
    if (!object) return json({ error: 'That preview is unavailable.' }, 404);
    const headers = new Headers({ 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    object.writeHttpMetadata(headers);
    headers.set('cache-control', 'no-store');
    headers.set('content-type', /\.(?:jpg|jpeg|png|webp)$/i.test(key) ? (/\.png$/i.test(key) ? 'image/png' : /\.webp$/i.test(key) ? 'image/webp' : 'image/jpeg') : /\.mp4$/i.test(key) ? 'video/mp4' : 'application/octet-stream');
    if (object.range && 'offset' in object.range) {
      const offset = object.range.offset || 0, length = object.range.length || object.size;
      headers.set('content-range', `bytes ${offset}-${offset + length - 1}/${object.size}`);
      headers.set('content-length', String(length));
    } else headers.set('content-length', String(object.size));
    headers.set('accept-ranges', 'bytes');
    return new Response(object.body, { status: headers.has('content-range') ? 206 : 200, headers });
  } catch { return json({ error: 'That preview could not be loaded. Try refreshing.' }, 503); }
}
