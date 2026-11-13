// Owner console: Email updates (src/broadcast.ts). The server enforces every guard (owner only,
// opted-in audience only, typed count, daily cap, rate limit); this page just makes them visible.
'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const stamp = (v) => v ? new Date(v).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC' : '';
  const tok = () => { try { return localStorage.getItem('stash_token'); } catch { return null; } };
  async function api(path, options = {}) {
    const r = await fetch(path, { ...options, cache: 'no-store', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok() } });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(body.error || 'Couldn’t complete that. Try again.'); e.body = body; e.status = r.status; throw e; }
    return body;
  }
  const F = ['subject', 'hero', 'body', 'button_text', 'button_url'];
  const IN = { subject: 'emSubject', hero: 'emHero', body: 'emBody', button_text: 'emBtnText', button_url: 'emBtnUrl' };
  let state = null, current = null, saved = '', dark = false, width = 600, previewTimer, previewId = 0;

  const form = () => Object.fromEntries(F.map((k) => [k, $(IN[k]).value]));
  const snap = () => JSON.stringify(form());
  const dirty = () => snap() !== saved;
  const isSent = () => Boolean(current?.sent_at);

  function fill(d) {
    current = d;
    for (const k of F) { $(IN[k]).value = d?.[k] ?? ''; $(IN[k]).disabled = Boolean(d?.sent_at); }
    saved = snap();
    $('emPick').value = d?.id ?? '';
    $('emDelete').disabled = !d?.id || isSent();
    $('emSave').disabled = isSent();
    $('emNote').textContent = isSent() ? `Sent ${stamp(d.sent_at)}. Sent drafts stay as a record and can’t change. Start a new draft to write another.` : '';
    preview(); sendState();
  }
  function picker() {
    const opts = state.drafts.map((d) => `<option value="${esc(d.id)}">${esc(d.subject)}${d.sent_at ? ' (sent)' : ''}</option>`);
    $('emPick').innerHTML = `<option value="">New draft</option>` + opts.join('');
    $('emPick').value = current?.id ?? '';
  }
  async function preview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(async () => {
      const id = ++previewId;
      try {
        const out = await api('/v1/admin/email/preview', { method: 'POST', body: JSON.stringify({ ...form(), dark }) });
        if (id !== previewId) return;
        $('emSubjectOut').textContent = out.subject;
        $('emFrame').srcdoc = out.html;
        $('emText').textContent = out.text;
      } catch (e) { if (id === previewId) $('emNote').textContent = e.message; }
    }, 250);
  }
  function facts() {
    const s = state;
    const row = (k, v, note) => `<div><dt>${esc(k)}</dt><dd>${v}${note ? `<span class="note">${esc(note)}</span>` : ''}</dd></div>`;
    $('emFacts').innerHTML =
      row('Audience', `${s.audience.toLocaleString()} ${s.audience === 1 ? 'person' : 'people'}`, 'Opted in to product updates, with a verified email. Nobody else is ever sent to.') +
      row('From', esc(s.from ? `Skwirl <${s.from}>` : 'Not set up'), s.enabled ? '' : 'Needs RESEND_API_KEY and EMAIL_FROM.') +
      row('Tests go to', esc(s.owner_email || 'No verified owner email yet'), s.owner_email ? '' : 'Add one in your Skwirl profile first.') +
      row('Unsubscribe', 'One-click link + List-Unsubscribe headers', 'Takes effect immediately. Each send re-reads who is opted in.');
    $('emCap').textContent = `${s.sent_last_day} of ${s.daily_cap} sent in the last 24 hours`;
    $('emPostal').value = s.postal || '';
    $('emTag').textContent = `Opted in: ${s.audience}`;
  }
  function sent() {
    const b = state.broadcasts;
    $('emSent').innerHTML = b.length
      ? `<table><thead><tr><th>Sent</th><th>Subject</th><th>Delivered to</th><th>By</th><th>Message ids</th></tr></thead><tbody>${b.map((x) =>
        `<tr><td>${esc(stamp(x.started_at))}</td><td>${esc(x.subject)}</td><td>${x.sent} of ${x.audience}${x.failed ? `, <span style="color:var(--bad)">${x.failed} failed</span>` : ''}${x.finished_at ? '' : ' (sending…)'}</td><td>${esc(x.by)}</td><td class="em-ids">${esc((x.ids || '').split(',').filter(Boolean).join(', ') || '—')}${x.sent > 3 ? ' …' : ''}</td></tr>`).join('')}</tbody></table>`
      : `<p class="content-empty">Nothing sent yet.</p>`;
  }
  function sendState() {
    if (!state) return;
    const n = state.audience, why =
      !state.enabled ? 'Email sending isn’t set up.' :
      !current?.id ? 'Save this draft first.' :
      isSent() ? 'This draft has been sent.' :
      dirty() ? 'You have unsaved changes. Save, then send.' :
      !state.postal ? 'Set the sender line first.' :
      n === 0 ? 'Nobody has opted in yet.' :
      state.sent_last_day + n > state.daily_cap ? `Over the daily cap (${state.daily_cap}).` :
      $('emConfirm').value.trim() !== String(n) ? `Type ${n} to confirm.` : '';
    $('emConfirmHint').textContent = `Type ${n} to send “${current?.subject || 'this draft'}” to ${n} ${n === 1 ? 'person' : 'people'}.`;
    $('emSend').textContent = `Send to ${n} ${n === 1 ? 'person' : 'people'}`;
    $('emSend').disabled = Boolean(why);
    $('emSendNote').textContent = why && why !== `Type ${n} to confirm.` ? why : '';
  }
  // keepId: the draft to show after loading (undefined = first unsent). Unsaved edits survive unless force.
  async function load(keepId, force = true) {
    if (!tok()) return;
    try { state = await api('/v1/admin/email'); } catch (e) { $('emStatus').textContent = e.status === 404 || e.status === 401 ? '' : e.message; return; }
    $('emStatus').textContent = state.enabled ? '' : 'Email sending isn’t set up on this deployment.';
    picker(); facts(); sent();
    const pick = state.drafts.find((d) => d.id === keepId) || (keepId === undefined ? state.drafts.find((d) => !d.sent_at) : null) || null;
    if (force || !dirty()) fill(pick); else sendState();
  }

  $('emForm').addEventListener('input', () => { preview(); sendState(); });
  $('emPick').addEventListener('change', () => {
    if (dirty() && !confirm('Discard unsaved changes?')) { $('emPick').value = current?.id ?? ''; return; }
    fill(state.drafts.find((d) => d.id === $('emPick').value) || null);
  });
  $('emNew').addEventListener('click', () => { if (dirty() && !confirm('Discard unsaved changes?')) return; fill(null); $('emSubject').focus(); });
  $('emForm').addEventListener('submit', async (e) => {
    e.preventDefault(); const b = $('emSave'); b.disabled = true;
    try { const r = await api('/v1/admin/email/drafts', { method: 'PUT', body: JSON.stringify({ ...form(), id: current?.id }) }); await load(r.id); $('emNote').textContent = 'Saved.'; }
    catch (err) { $('emNote').textContent = err.message; }
    finally { b.disabled = isSent(); }
  });
  $('emDelete').addEventListener('click', async () => {
    if (!current?.id || !confirm(`Delete the draft “${current.subject}”?`)) return;
    try { await api('/v1/admin/email/drafts/' + encodeURIComponent(current.id), { method: 'DELETE' }); current = null; await load(null); $('emNote').textContent = 'Deleted.'; }
    catch (err) { $('emNote').textContent = err.message; }
  });
  $('emTest').addEventListener('click', async () => {
    const b = $('emTest'); b.disabled = true; $('emNote').textContent = 'Sending a test…';
    try { const r = await api('/v1/admin/email/test', { method: 'POST', body: JSON.stringify(form()) }); $('emNote').textContent = `Test sent to ${r.to}.`; }
    catch (err) { $('emNote').textContent = err.message; }
    finally { b.disabled = false; }
  });
  document.querySelectorAll('[data-em-width]').forEach((b) => b.addEventListener('click', () => {
    width = Number(b.dataset.emWidth);
    document.querySelectorAll('[data-em-width]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    document.querySelector('.email-frame').classList.toggle('narrow', width === 375);
  }));
  $('emDark').addEventListener('click', () => { dark = !dark; $('emDark').setAttribute('aria-pressed', String(dark)); preview(); });
  $('emPostalForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('/v1/admin/email/settings', { method: 'PUT', body: JSON.stringify({ postal: $('emPostal').value }) }); await load(current?.id ?? null, false); $('emSendNote').textContent = 'Sender line saved.'; }
    catch (err) { $('emSendNote').textContent = err.message; }
  });
  $('emConfirm').addEventListener('input', sendState);
  $('emSendForm').addEventListener('submit', async (e) => {
    e.preventDefault(); sendState(); if ($('emSend').disabled) return;
    const n = state.audience;
    const b = $('emSend'); b.disabled = true; $('emSendNote').textContent = `Sending to ${n}…`;
    try {
      const r = await api('/v1/admin/email/send', { method: 'POST', body: JSON.stringify({ id: current.id, confirm: Number($('emConfirm').value.trim()) }) });
      $('emConfirm').value = '';
      await load(current.id);
      $('emSendNote').textContent = `Sent to ${r.sent}${r.failed ? `, ${r.failed} failed (see Sent)` : ''}.`;
    } catch (err) {
      if (err.body && typeof err.body.audience === 'number') { state.audience = err.body.audience; facts(); $('emConfirm').value = ''; }
      $('emSendNote').textContent = err.message; sendState();
    }
  });
  // Load once the main console has shown (it owns sign-in state), and again on Refresh.
  let tries = 0;
  const start = () => { if (!tok()) return; if (!$('console').hidden) load(undefined); else if (++tries < 75) setTimeout(start, 400); };
  start();
  $('refresh').addEventListener('click', () => setTimeout(() => state ? load(current?.id ?? null, false) : start(), 300));
})();
