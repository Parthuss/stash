// One owner workspace. The server enforces owner access; a visible shell never grants it.
'use strict';
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = value => Number(value || 0).toLocaleString();
const date = value => value ? new Date(value).toLocaleDateString(undefined, {day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}) : 'Not recorded';
const stamp = value => value ? new Date(value).toLocaleString(undefined, {day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'UTC'}) + ' UTC' : 'Not recorded';
const percent = (n, d) => d ? Math.round(100*n/d) + '%' : '—';
function storedToken() { try { return localStorage.getItem('stash_token'); } catch { return null; } }
let token = storedToken();
let contentData = null, contentLoadId = 0, contentBlobUrls = [];
let data = null, selectedUser = null, loadId = 0, journeyId = 0, opener = null, toastTimer;
function clearOwnerSession() {
  clearContent();
  token=storedToken(); data=null; selectedUser=null; ++loadId; ++journeyId;
  if($('userDrawer').open)$('userDrawer').close();
  $('drawerBody').replaceChildren(); $('console').hidden=true; $('toast').hidden=true;
  for(const id of ['metrics','metricTable','funnelChart','funnelNote','userRows','queue','providers','failures','trafficChart','trafficTable','trafficBreakdowns','activityFeed','limitations','range','updated','userCount','usersNote','healthLabel'])$(id).replaceChildren();
  $('refresh').disabled=false; $('status').className='error';
  $('status').innerHTML='Owner access is required. <a href="/">Sign in with your owner account</a>, then return here.';
}
async function api(path, options = {}) {
  const credential=token;
  if(storedToken()!==credential) { clearOwnerSession(); throw new Error('owner-access'); }
  const response = await fetch(path, {...options, cache:'no-store', headers:{'Content-Type':'application/json', Authorization:'Bearer ' + token, ...options.headers}});
  if(storedToken()!==credential) { clearOwnerSession(); throw new Error('owner-access'); }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403 || (response.status === 404 && !path.startsWith('/v1/admin/content'))) throw new Error('owner-access');
    let body = null; try { body = await response.json(); } catch {}
    throw new Error(body?.error || 'Couldn’t complete that request. Try again.');
  }
  return response.json();
}
function toast(message) {
  clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 5500);
}
function delta(kpi) {
  if (kpi.previous == null) return '<span class="delta">Snapshot now</span>';
  const difference = kpi.value - kpi.previous;
  if (!difference) return '<span class="delta">No change</span>';
  const direction = difference > 0 ? 'up' : 'down';
  const label = kpi.previous ? percent(Math.abs(difference), kpi.previous) : '+' + num(difference);
  return `<span class="delta ${direction}" title="${esc(num(kpi.value))} now; ${esc(num(kpi.previous))} in the previous period">${difference > 0 ? '↑' : '↓'} ${esc(label)}<span class="sr-only"> versus previous period</span></span>`;
}
function spark(kpi) {
  const series = kpi.series || [];
  if (!series.length) return '<span class="metric-note">History not recorded</span>';
  const max = Math.max(1, ...series.map(p => p.value)), width = 80, height = 25;
  const x = i => series.length === 1 ? width/2 : i*width/(series.length-1);
  const y = v => height - 2 - v*(height-4)/max;
  const path = series.map((p,i) => `${i ? 'L' : 'M'}${x(i).toFixed(2)},${y(p.value).toFixed(2)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 80 28" role="img" aria-label="${esc(kpi.label)} trend, ${esc(series.map(p=>p.value).join(', '))}"><path d="${path}"/>${series.map((p,i) => `<circle cx="${x(i)}" cy="${y(p.value)}" r="2"><title>${esc(stamp(p.at))}: ${num(p.value)}</title></circle>`).join('')}</svg>`;
}
function metrics() {
  const items = [...data.kpis, {key:'revenue',label:'Revenue',value:null,previous:null,series:[],note:'Payment amounts are not stored. Revenue is unavailable.'}];
  $('metrics').innerHTML = items.map(k => `<article class="metric${k.value == null ? ' unavailable' : ''}" title="${esc(k.note)}"><span class="metric-label">${esc(k.label)}</span><div class="metric-value">${k.value == null ? '—' : num(k.value)}</div><div class="metric-bottom">${k.value == null ? '<span class="metric-note">No payment ledger</span>' : delta(k)}${k.value == null ? '' : spark(k)}</div></article>`).join('');
  $('metricTable').innerHTML = `<table><caption class="sr-only">Metric definitions and equal-period comparisons</caption><thead><tr><th>Metric</th><th>Current</th><th>Previous</th><th>Definition</th></tr></thead><tbody>${items.map(k => `<tr><td>${esc(k.label)}</td><td>${k.value == null ? 'Unavailable' : num(k.value)}</td><td>${k.previous == null ? 'Not recorded' : num(k.previous)}</td><td>${esc(k.note)}</td></tr>`).join('')}</tbody></table><p>Trends use ${data.period.bucket === 'hour' ? 'hourly' : 'equal 24-hour'} buckets. Distinct-user totals can be lower than the sum of the buckets. Queue and Plus are current snapshots.</p><details><summary>View all trend values</summary><div class="table-wrap"><table><thead><tr><th>Bucket starts · UTC</th>${data.kpis.filter(k=>k.series.length).map(k=>`<th>${esc(k.label)}</th>`).join('')}</tr></thead><tbody>${(data.kpis[0].series || []).map((p,i)=>`<tr><td>${esc(stamp(p.at))}</td>${data.kpis.filter(k=>k.series.length).map(k=>`<td>${num(k.series[i]?.value)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;
}
function funnel() {
  const steps = data.funnel.steps, reach = Math.max(1, steps[0].value), joined = Math.max(1, steps[1].value);
  $('funnelChart').innerHTML = `<div class="funnel-rows">${steps.map((s,i) => {
    const base = i ? joined : reach;
    // The dashed boundary is intentional: anonymous reach cannot prove signup attribution.
    const rate = i === 0 ? 'Reach' : i === 1 ? 'Signup cohort' : percent(s.value,steps[1].value) + ' of signups';
    return `<div class="funnel-row${i===1 ? ' cohort-start' : ''}"><span class="funnel-name">${esc(s.label)}</span><span class="funnel-track" title="${esc(s.label)}: ${num(s.value)}"><span class="funnel-fill" style="width:${Math.min(100,100*s.value/base)}%"></span></span><span class="funnel-num">${num(s.value)}</span><span class="funnel-rate">${esc(rate)}</span></div>`;
  }).join('')}</div>`;
  $('funnelNote').textContent = data.funnel.note;
  $('funnelChart').insertAdjacentHTML('beforeend', `<details class="data-view"><summary>View funnel as a table</summary><table><thead><tr><th>Step</th><th>People</th><th>Share of signup cohort</th></tr></thead><tbody>${steps.map((s,i)=>`<tr><td>${esc(s.label)}</td><td>${num(s.value)}</td><td>${i ? percent(s.value,steps[1].value) : 'Separate reach measure'}</td></tr>`).join('')}</tbody></table></details>`);
}
function userRows() {
  const query = $('userSearch').value.trim().toLowerCase(), plan = $('planFilter').value;
  const users = data.users.filter(u => (!query || u.name.toLowerCase().includes(query)) && (plan === 'all' || u.plan === plan));
  $('userCount').textContent = num(data.users_total);
  $('userRows').innerHTML = users.length ? users.map(u => `<tr data-user="${esc(u.id)}"><td><button type="button" class="user-button" data-view="${esc(u.id)}">${esc(u.name)}</button></td><td><span class="plan ${u.plan === 'plus' ? 'plus' : ''}">${esc(u.plan[0].toUpperCase()+u.plan.slice(1))}</span></td><td class="optional">${esc(date(u.created_at))}</td><td class="seen-col">${esc(date(u.last_seen))}</td><td><span class="save-counts" aria-label="${num(u.done)} done, ${num(u.pending)} pending, ${num(u.failed)} failed"><span>${num(u.done)}</span><span class="muted">/</span><span>${num(u.pending)}</span><span class="muted">/</span><span class="${u.failed ? 'failed' : ''}">${num(u.failed)}</span></span></td><td class="optional">${u.has_email ? 'Yes' : 'No'}</td><td class="optional"><div class="row-actions"><button type="button" data-user-action="push" data-id="${esc(u.id)}" ${u.push_devices ? '' : 'disabled'} title="${u.push_devices ? 'Send a push notification' : 'No push devices registered'}">Push</button><button type="button" data-user-action="message" data-id="${esc(u.id)}">Message</button><button type="button" data-user-action="requeue" data-id="${esc(u.id)}" ${u.failed ? '' : 'disabled'}>Requeue</button></div></td></tr>`).join('') : '<tr><td colspan="7" class="empty">No users match. Try another name or plan.</td></tr>';
  $('usersNote').textContent = `${num(users.length)} shown · All-time saves, including imports · Joined, email and actions are also in user details.${data.users_total > data.users.length ? ' Newest 500 accounts loaded.' : ''}`;
}
function health() {
  const states = data.health.states, max = Math.max(1,...states.map(s => s.n));
  const names = {pending:'Pending',processing:'Processing',failed:'Failed',done:'Done'};
  $('queue').innerHTML = ['pending','processing','failed','done'].map(state => { const n = states.find(s => s.state===state)?.n || 0;
    return `<div class="queue-row ${state}"><span>${names[state]}</span><span class="bar-track" title="${names[state]}: ${num(n)}"><span class="bar-fill" style="width:${100*n/max}%"></span></span><b>${num(n)}</b></div>`;
  }).join('') + '<p class="provider-note">All captures, including imports and owner saves. Terminal failures are separate from the waiting queue.</p>' + `<details class="data-view"><summary>View queue as a table</summary><table><thead><tr><th>State</th><th>Saves</th></tr></thead><tbody>${['pending','processing','failed','done'].map(state=>`<tr><td>${names[state]}</td><td>${num(states.find(s=>s.state===state)?.n)}</td></tr>`).join('')}</tbody></table></details>`;
  const failed = states.find(s => s.state==='failed')?.n || 0;
  $('healthLabel').textContent = failed ? `${num(failed)} saves need attention` : 'No unresolved failures';
  const p = data.health.providers, cost = data.health.cost;
  $('providers').innerHTML = `<dl class="facts"><div><dt>Groq shared pool</dt><dd>${num(p.groq_keys)} keys configured</dd></div><div><dt>User Groq keys</dt><dd>${num(p.own_keys)}</dd></div><div><dt>OpenRouter credit</dt><dd>${p.openrouter_credit == null ? 'Unavailable' : '$'+Number(p.openrouter_credit).toFixed(2)}</dd></div><div><dt>Estimated cost · period</dt><dd>${cost.estimated_usd == null ? 'Unavailable' : '$'+Number(cost.estimated_usd).toFixed(3)}</dd></div></dl><p class="provider-note">${esc(p.note)} ${esc(cost.note)}</p>${p.usage?.length ? `<details class="data-view"><summary>Recorded provider usage</summary><div class="table-wrap"><table><thead><tr><th>Provider / model</th><th>Calls</th><th>Input tokens</th><th>Output tokens</th><th>Audio seconds</th></tr></thead><tbody>${p.usage.map(u=>`<tr><td>${esc(u.provider)}<small class="usage-model">${esc(u.model || 'Not recorded')} · ${esc(u.action || 'call')}</small></td><td>${num(u.calls)}</td><td>${num(u.prompt_tokens)}</td><td>${num(u.completion_tokens)}</td><td>${num(Math.round(u.audio_seconds))}</td></tr>`).join('')}</tbody></table></div></details>` : '<p class="provider-note">No provider calls recorded in this period.</p>'}`;
  $('failures').innerHTML = data.health.failures.length ? data.health.failures.map(f => `<details class="failure"><summary>${esc(f.reason)} <b>${num(f.n)}</b></summary><ul>${f.examples.length ? f.examples.map(e=>`<li>${esc(e.title || 'Untitled save')} <code>${esc(e.id)}</code></li>`).join('') : '<li>No recent example available.</li>'}</ul></details>`).join('') : '<p class="muted">No failed saves. The queue is clear of terminal errors.</p>';
}
function chart(rows) {
  const max = Math.max(1,...rows.map(r=>r.visits)), w=Math.max(280,$('trafficChart').clientWidth), h=166, left=36, right=w-12, top=12, bottom=137;
  const x = i => rows.length===1 ? (right+left)/2 : left+(right-left)*i/(rows.length-1);
  const y = value => bottom-(bottom-top)*value/max;
  return `<svg class="traffic-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="Visits per UTC day. Table below contains all values.">${[0,0.5,1].map(f=>`<line class="gridline" x1="${left}" x2="${right}" y1="${y(max*f)}" y2="${y(max*f)}"/><text x="${left-10}" y="${y(max*f)+4}" text-anchor="end">${Number((max*f).toFixed(1))}</text>`).join('')}<path class="line" d="${rows.map((r,i)=>`${i?'L':'M'}${x(i)},${y(r.visits)}`).join(' ')}"/>${rows.map((r,i)=>`<g><circle class="point" cx="${x(i)}" cy="${y(r.visits)}" r="3"/><rect class="hit" x="${x(i)-Math.min(20,(right-left)/Math.max(1,rows.length)/2)}" y="${top}" width="${Math.min(40,(right-left)/Math.max(1,rows.length))}" height="${bottom-top}"><title>${esc(r.day)}: ${num(r.visits)} visits, ${num(r.visitors)} visitors</title></rect></g>`).join('')}${[0,rows.length-1].filter((v,i,a)=>a.indexOf(v)===i).map(i=>`<text x="${x(i)}" y="${h-3}" text-anchor="${i===0?'start':'end'}">${esc(rows[i]?.day)}</text>`).join('')}</svg>`;
}
function breakdown(title, rows) {
  const max = Math.max(1,...rows.map(r=>r.n));
  return `<div class="panel padded breakdown"><h3>${esc(title)}</h3>${rows.length ? rows.map(r=>`<div class="rank-row" title="${esc(r.k)}: ${num(r.n)} visitors"><span class="rank-bar" style="width:${100*r.n/max}%"></span><span class="label">${esc(r.k)}</span><b>${num(r.n)}</b></div>`).join('') : '<p class="muted">No visits recorded in this period.</p>'}<small>Distinct visitors · Top 12</small><details class="data-view"><summary>View table</summary><table><thead><tr><th>${esc(title)}</th><th>Visitors</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.k)}</td><td>${num(r.n)}</td></tr>`).join('')}</tbody></table></details></div>`;
}
function traffic() {
  const rows = [], end=Date.parse(data.period.until), start=Date.parse(data.period.since.slice(0,10)+'T00:00:00Z');
  for(let t=start;t<end;t+=86400000) { const day=new Date(t).toISOString().slice(0,10); rows.push(data.traffic.daily.find(r=>r.day===day)||{day,visits:0,visitors:0}); }
  $('trafficChart').innerHTML = rows.length ? chart(rows) : '<p class="empty">No traffic recorded yet.</p>';
  $('trafficTable').innerHTML = `<table><caption class="sr-only">Visits by day in the selected period, including zero-visit days</caption><thead><tr><th>Day · UTC</th><th>Visits</th><th>Visitors</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.day)}</td><td>${num(r.visits)}</td><td>${num(r.visitors)}</td></tr>`).join('')}</tbody></table><p>The first and last day may be partial. Visitors are distinct per day; they can appear on multiple days.</p>`;
  $('trafficBreakdowns').innerHTML = breakdown('Sources & referrers',data.traffic.sources)+breakdown('Countries',data.traffic.countries)+breakdown('Landing pages',data.traffic.landing)+breakdown('Devices',data.traffic.devices);
}
const describeAction = action => actionLabels[action] || (String(action || '').startsWith('mcp:') ? 'used an AI tool: ' + action.slice(4).replaceAll('_',' ') : action || 'was active');
const actionLabels = {ingest:'added a save',import:'imported saves',open:'opened a note',search:'searched their saves',signin:'signed in',join:'joined Skwirl',token_reset:'reset their sign-in token',email_added:'added an email',profile_saved:'updated their profile',recall_hit:'recalled a save',push_on:'enabled notifications',share:'shared a note',categories:'updated categories'};
function activity() {
  $('activityFeed').innerHTML = data.activity.length ? data.activity.map(e=>`<div class="activity-row"><span class="activity-dot"></span><div><p>${e.user_id ? `<button class="activity-user" data-view="${esc(e.user_id)}">${esc(e.name)}</button>` : `<b>${esc(e.name)}</b>`} ${esc(describeAction(e.action))}</p><small>${esc(e.kind)}</small></div><time datetime="${esc(e.at)}">${esc(stamp(e.at))}</time></div>`).join('') : '<p class="empty">No activity recorded in this period.</p>';
}
async function load() {
  const id = ++loadId;
  if (!token) { $('console').hidden = true; $('status').className='error'; $('status').innerHTML = 'This workspace is for the Skwirl owner. <a href="/">Sign in to Skwirl</a> on this device, then return here.'; return; }
  $('status').className=''; $('status').textContent = 'Refreshing your workspace…'; $('refresh').disabled = true;
  try {
    const next = await api('/v1/admin/console?days='+$('period').value);
    if(id!==loadId)return;
    data=next;
    $('console').hidden=false; // Charts measure their visible container, including on first load.
    metrics(); funnel(); userRows(); health(); traffic(); activity();
    $('range').textContent = `${stamp(data.period.since)} – ${stamp(data.period.until)} · ${data.period.days===1 ? 'vs the same hours yesterday' : 'vs the previous '+data.period.days+' days'}`;
    $('updated').textContent = 'Updated '+new Date(data.period.until).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'});
    $('limitations').innerHTML = data.limitations.map(l=>`<li>${esc(l)}</li>`).join('');
    $('status').textContent=''; $('console').hidden=false;
    loadContent();
  } catch(error) {
    if(id!==loadId)return;
    $('status').className='error';
    if(error.message==='owner-access') { clearOwnerSession(); $('status').innerHTML='Owner access is required. <a href="/">Sign in with your owner account</a>, then return here.'; }
    else $('status').textContent = data ? 'Couldn’t refresh. The data below is from the last successful refresh. Try Refresh again.' : 'Couldn’t load the console. Check your connection and try Refresh.';
  } finally { if(id===loadId)$('refresh').disabled=false; }
}
// Content uses the same private owner session, including media requests.
function clearContent() {
  ++contentLoadId; contentData=null;
  contentBlobUrls.forEach(url=>URL.revokeObjectURL(url)); contentBlobUrls=[];
  for(const id of ['contentSetup','contentIdeas','contentDrafts','contentScheduled','contentPosted','contentNote','contentStatus','contentMode'])$(id).replaceChildren();
  $('contentActions').hidden=true;
}
function contentUrl(value) {
  if(typeof value!=='string')return '';
  try {
    const url=new URL(value,location.origin);
    return url.origin===location.origin && (url.pathname==='/v1/admin/content/media' || url.pathname.startsWith('/content-samples/')) ? url.pathname+url.search : '';
  } catch { return ''; }
}
function contentPreview(post) {
  const preview=post.preview || {}, cover=contentUrl(preview.cover), video=contentUrl(preview.video);
  const slides=(preview.slides || []).map(contentUrl).filter(Boolean);
  const image=(url,alt)=>`<img data-content-media="${esc(url)}" alt="${esc(alt)}" loading="lazy">`;
  if(video)return `<video data-content-media="${esc(video)}" controls preload="metadata" aria-label="${esc(post.title || 'Draft video')}"></video>${cover ? image(cover,'Cover for '+(post.title || 'draft')) : ''}`;
  if(slides.length)return `<div class="content-slides" tabindex="0" aria-label="Carousel slides. Scroll to see each slide.">${slides.map((url,i)=>image(url,`Slide ${i+1} of ${slides.length}`)).join('')}</div><p class="provider-note">${slides.length} slides · Scroll to review every slide.</p>`;
  return cover ? image(cover,post.title || 'Draft cover') : '<div class="content-preview-placeholder">Preview will appear when this draft’s media is available.</div>';
}
function contentGate(post) {
  const gate=post.gate || {}, issues=gate.issues || [];
  return `<div class="content-gate${gate.passed ? ' passed' : ''}"><p><strong>${gate.passed ? 'Quality gate passed' : 'Quality gate not passed'}</strong>${gate.summary ? ' · '+esc(gate.summary) : ''}</p>${issues.length ? `<details><summary>Review ${issues.length} gate finding${issues.length===1?'':'s'}</summary><ul>${issues.map(issue=>`<li>${esc(typeof issue==='string'?issue:issue.message || issue.detail || JSON.stringify(issue))}</li>`).join('')}</ul></details>` : ''}</div>`;
}
function contentMetric(value) {
  if(value==null)return 'Not measured yet';
  if(typeof value!=='object')return esc(value);
  const entries=Object.entries(value).filter(([,v])=>v!=null);
  return entries.length ? entries.map(([key,v])=>`${esc(key.replaceAll('_',' '))}: ${typeof v==='object'?contentMetric(v):esc(typeof v==='number'?num(v):v)}`).join(' · ') : 'Not measured yet';
}
function contentMetricWindow(post, window) {
  const metrics=post.metrics || {}, key=window==='48h'?'h48':'d7';
  const channels=Object.entries(metrics).filter(([name,value])=>value && typeof value==='object' && (name==='instagram' || name==='youtube'));
  if(channels.length)return channels.map(([name,value])=>`${esc(name==='instagram'?'Instagram':'YouTube')} · ${contentMetric(value[key])}`).join('<br>');
  return contentMetric(metrics[window] ?? post['metrics_'+window]);
}
function renderContent() {
  const c=contentData, controls=c.controls || {};
  $('contentMode').textContent=controls.paused ? 'Paused' : c.setup?.find(s=>s.key==='engine')?.connected ? 'Enabled' : 'Setup';
  $('contentSetup').innerHTML=(c.setup || []).map(row=>`<li class="${row.connected?'connected':''}"><div><strong>${esc(row.label)}</strong><span class="content-state">${esc(row.status || (row.connected?'Connected':'Not connected'))}</span></div>${/^https:\/\/github\.com\/Parthuss\/stash\//.test(row.href || '') ? `<a href="${esc(row.href)}" target="_blank" rel="noopener">${row.connected?'Review':'Set up'}<span class="sr-only"> ${esc(row.label)}</span></a>` : ''}</li>`).join('');
  $('contentActions').hidden=!controls.configured;
  $('contentActions').querySelectorAll('button').forEach(button=>button.disabled=false);
  $('contentPause').dataset.contentAction=controls.paused?'resume':'pause';
  $('contentPause').textContent=controls.paused?'Resume engine':'Pause engine';
  $('contentNote').textContent=c.note || 'Approvals apply to the reviewed content and its quality report. Changes require another review.';
  const ideas=[...(c.ideas || [])].sort((a,b)=>(Number(b.score)||0)-(Number(a.score)||0));
  const commonScoreLabel=ideas.length && ideas.every(idea=>idea.score_label===ideas[0].score_label) ? ideas[0].score_label : '';
  $('contentIdeas').innerHTML=ideas.length ? `<table><caption class="sr-only">Ideas backlog ordered by score</caption><thead><tr><th>Hook</th><th>Format</th><th>Score</th></tr></thead><tbody>${ideas.map(idea=>`<tr><td class="content-hook">${esc(idea.hook || idea.title)}</td><td>${esc(idea.format || 'Not selected')}</td><td>${idea.score==null?'Not scored':esc(idea.score)}${!commonScoreLabel && idea.score_label ? `<small class="content-table-note">${esc(idea.score_label)}</small>` : ''}</td></tr>`).join('')}</tbody></table>${commonScoreLabel ? `<p class="table-note">${esc(commonScoreLabel)}</p>` : ''}` : '<p class="content-empty">No ideas yet. Run research after setup to build the backlog.</p>';
  $('contentDrafts').innerHTML=(c.drafts || []).map(post=>{
    const canDecide=controls.can_approve && !post.sample && !!post.content_hash;
    return `<article class="panel content-draft"><div class="content-preview">${contentPreview(post)}</div><div><span class="plan">${esc(post.format || 'Draft')}${post.sample?' · Local sample':''}</span><h4>${esc(post.title || post.id)}</h4><p class="content-caption">${esc(post.caption || 'Caption not added yet.')}</p>${contentGate(post)}<div class="content-decision"><button type="button" class="primary" data-content-action="approve" data-content-id="${esc(post.id)}" ${canDecide && post.gate?.passed?'':'disabled'}>Approve</button><button type="button" data-content-action="skip" data-content-id="${esc(post.id)}" ${canDecide?'':'disabled'}>Skip</button></div>${post.sample ? '<p class="provider-note">Local sample for preview. Make and stage a gate-passing draft before approval.</p>' : !post.gate?.passed ? '<p class="provider-note">Approval is available after the quality gate passes for this exact draft.</p>' : ''}</div></article>`;
  }).join('') || '<div class="panel"><p class="content-empty">No drafts awaiting approval this week. Run make after setup to prepare the next batch.</p></div>';
  $('contentScheduled').innerHTML=(c.scheduled || []).length ? `<table><caption class="sr-only">Scheduled content, dates in UTC</caption><thead><tr><th>Content</th><th>Channel</th><th>Scheduled · UTC</th><th>Status</th></tr></thead><tbody>${c.scheduled.map(post=>`<tr><td class="content-table-title">${esc(post.title || post.id)}</td><td>${esc(post.platform || post.channel || post.format || 'Not selected')}</td><td>${esc(stamp(post.scheduled_at || post.publish_at))}</td><td>${esc(post.status || 'Scheduled')}</td></tr>`).join('')}</tbody></table>` : '<p class="content-empty">Nothing scheduled yet. Approved drafts will appear here with their publish dates.</p>';
  $('contentPosted').innerHTML=(c.posted || []).length ? `<table><caption class="sr-only">Published content and measured results after 48 hours and 7 days</caption><thead><tr><th>Content</th><th>Posted · UTC</th><th>48 hours</th><th>7 days</th></tr></thead><tbody>${c.posted.map(post=>`<tr><td class="content-table-title">${esc(post.title || post.id)}<span class="content-table-note">${esc(post.platform || post.channel || '')}</span></td><td>${esc(stamp(post.posted_at || post.published_at))}</td><td class="content-metric">${contentMetricWindow(post,'48h')}</td><td class="content-metric">${contentMetricWindow(post,'7d')}</td></tr>`).join('')}</tbody></table>` : '<p class="content-empty">No engine posts yet. Results appear after each post’s 48-hour and 7-day measurement windows.</p>';
}
async function loadContentMedia(requestId) {
  const credential=token;
  await Promise.all([...$('contentDrafts').querySelectorAll('[data-content-media]')].map(async element=>{
    const url=element.dataset.contentMedia;
    if(url.startsWith('/content-samples/')) { if(requestId===contentLoadId)element.src=url; return; }
    try {
      const response=await fetch(url,{cache:'no-store',headers:{Authorization:'Bearer '+credential}});
      if(storedToken()!==credential) { clearOwnerSession();return; }
      if(requestId!==contentLoadId)return;
      if(response.status===401) { clearOwnerSession(); return; }
      if(!response.ok)throw new Error('preview');
      const blob=await response.blob();
      if(requestId!==contentLoadId)return;
      const objectUrl=URL.createObjectURL(blob);contentBlobUrls.push(objectUrl);element.src=objectUrl;
    } catch { if(requestId===contentLoadId && element.isConnected) { const note=document.createElement('p');note.className='provider-note';note.textContent='Preview unavailable. Refresh to try again.';element.replaceWith(note); } }
  }));
}
async function loadContent() {
  const id=++contentLoadId;
  $('contentStatus').textContent='Refreshing content…';
  try {
    const next=await api('/v1/admin/content');
    if(id!==contentLoadId)return;
    contentBlobUrls.forEach(url=>URL.revokeObjectURL(url));contentBlobUrls=[];
    contentData=next;renderContent();
    $('contentStatus').textContent=next.updated_at?'Content updated '+stamp(next.updated_at):'';
    loadContentMedia(id);
  } catch(error) {
    if(id!==contentLoadId)return;
    if(error.message==='owner-access') { clearOwnerSession();return; }
    $('contentStatus').textContent=contentData ? 'Couldn’t refresh content. Showing the last successful update; try Refresh again.' : 'Couldn’t load content. Check your connection and try Refresh.';
  }
}
$('content').addEventListener('click',async event=>{
  const button=event.target.closest('[data-content-action]');if(!button || button.disabled || !contentData)return;
  const action=button.dataset.contentAction, post=(contentData.drafts || []).find(p=>p.id===button.dataset.contentId);
  const payload={action};
  if(post){payload.id=post.id;payload.content_hash=post.content_hash;}
  const session=token, buttons=[...$('content').querySelectorAll('[data-content-action]')];
  buttons.forEach(b=>b.disabled=true);$('contentStatus').textContent='Submitting content action…';
  try {
    const result=await api('/v1/admin/content/action',{method:'POST',body:JSON.stringify(payload)});
    if(token!==session)return;
    const message=result.message || (post?'Decision queued for the next engine tick.':'Workflow request accepted.');
    await loadContent();
    if(token===session){$('contentStatus').textContent=message;toast(message);}
  } catch(error) {
    if(error.message==='owner-access'){clearOwnerSession();return;}
    if(token===session)$('contentStatus').textContent=error.message;
  } finally { if(token===session && contentData) { contentBlobUrls.forEach(url=>URL.revokeObjectURL(url));contentBlobUrls=[];renderContent();loadContentMedia(contentLoadId); } }
});
function closeDrawer() { $('userDrawer').close(); }
async function openUser(id, action) {
  const user = data.users.find(u=>u.id===id);
  if(!user){toast('This user is outside the loaded table. Find them in the newest 500 accounts.');return;}
  selectedUser=user; opener=document.activeElement;
  const u=user;
  $('drawerBody').innerHTML = `<h2 id="drawerName">${esc(u.name)}</h2><span class="plan ${u.plan==='plus'?'plus':''}">${esc(u.plan)}</span><dl class="facts drawer-facts"><div><dt>Joined</dt><dd>${esc(stamp(u.created_at))}</dd></div><div><dt>Last seen</dt><dd>${esc(stamp(u.last_seen))}</dd></div><div><dt>Saves</dt><dd>${num(u.done)} done · ${num(u.pending)} pending · ${num(u.failed)} failed</dd></div><div><dt>Email</dt><dd>${u.email ? `<a href="mailto:${esc(u.email)}">${esc(u.email)}</a>` : 'Not added'}</dd></div><div><dt>Found Skwirl via</dt><dd>${esc(u.found_via || 'Not recorded')}</dd></div><div><dt>Push devices</dt><dd>${num(u.push_devices)}</dd></div><div><dt>Own Groq key</dt><dd>${u.own_key ? 'Yes' : 'No'}</dd></div></dl><div class="drawer-actions"><button type="button" data-drawer-action="push" ${u.push_devices?'':'disabled'}>Send push</button><button type="button" data-drawer-action="message">Owner message</button><button type="button" data-drawer-action="requeue" ${u.failed?'':'disabled'}>Requeue ${num(u.failed)} failed</button></div><div id="actionEditor"></div><h3>Recent journey</h3><div id="journey">Loading visits and activity…</div>`;
  if(!$('userDrawer').open)$('userDrawer').showModal();
  if(action)editAction(action);
  const requestId=++journeyId;
  try {
    const j=await api('/v1/admin/journey?user='+encodeURIComponent(id));
    if(requestId!==journeyId || selectedUser?.id!==id)return;
    const visits=(j.visits||[]).slice(-12).reverse();
    $('journey').innerHTML=visits.length ? visits.map(v=>`<div class="journey-item"><time>${esc(stamp(v.started_at))}</time><b>${esc([v.device,v.browser,v.country].filter(Boolean).join(' · '))}</b><ul class="journey-events">${(j.events||[]).filter(e=>e.visit_id===v.id).slice(-8).map(e=>`<li>${esc(e.name)}${e.detail ? ': '+esc(e.detail) : ''}</li>`).join('') || '<li>No events recorded.</li>'}</ul></div>`).join('') : '<p class="muted">No browser visits recorded.</p>';
    const server=(j.server||[]).slice(-12).reverse();
    if(server.length)$('journey').innerHTML+=`<h3 style="margin-top:24px">Recent server actions</h3>${server.map(e=>`<div class="journey-item"><time>${esc(stamp(e.at))}</time>${esc(actionLabels[e.name]||e.name)}</div>`).join('')}`;
  } catch { if(requestId===journeyId && $('journey'))$('journey').textContent='Couldn’t load this journey. Close and reopen the user to retry.'; }
}
function editAction(action) {
  const u=selectedUser;if(!u)return;
  let content;
  if(action==='requeue')content=`<p>Retry ${num(u.failed)} failed saves for ${esc(u.name)}. Completed saves are kept.</p><button class="primary" type="submit">Requeue failed saves</button>`;
  else {
    const isPush=action==='push';
    const oldMessage=String(u.owner_msg||'').replace(/^#\w+ /,'');
    content=`<label for="actionText">${isPush ? 'Push notification' : 'Message in Skwirl'}</label><p>${isPush ? 'Send now to this person’s registered devices.' : 'Appears in their app until they dismiss it. Leave blank to clear the current message.'}</p><textarea id="actionText" maxlength="${isPush?240:500}" ${isPush?'required':''}>${isPush?'':esc(oldMessage)}</textarea><button class="primary" type="submit">${isPush?'Send push now':'Save owner message'}</button>`;
  }
  $('actionEditor').innerHTML=`<form class="action-form" id="actionForm" data-action="${action}">${content}<p id="actionStatus" class="action-status" role="status"></p></form>`;
  const field=$('actionText');if(field)field.focus();else $('actionForm').querySelector('button').focus();
}
$('userDrawer').addEventListener('submit',async event=>{
  if(event.target.id!=='actionForm')return;
  event.preventDefault();
  const form=event.target, action=form.dataset.action, user=selectedUser;
  const value=$('actionText')?.value || '';
  const button=form.querySelector('button[type="submit"]');button.disabled=true;
  try {
    const result=await api('/v1/admin/users/'+encodeURIComponent(user.id)+'/'+action,{method:'POST',body:JSON.stringify(action==='message'?{message:value}:action==='push'?{body:value}:{})});
    const message=action==='message'?'Owner message saved.':action==='requeue'?`${num(result.requeued)} failed saves requeued.`:result.devices?`${num(result.sent)} notifications sent; ${num(result.failed)} failed.`:'No registered push devices remain.';
    if(action==='message')user.owner_msg=value;
    if(action==='requeue') { await load(); if(selectedUser?.id===user.id)await openUser(user.id); }
    toast(message);
    if(selectedUser?.id===user.id && $('actionStatus'))$('actionStatus').textContent=message;
  } catch(error) { if($('actionStatus'))$('actionStatus').textContent=error.message==='owner-access'?'Owner access expired. Sign in again.':error.message; }
  finally {if(button.isConnected)button.disabled=false;}
});
$('closeDrawer').addEventListener('click',closeDrawer);
$('userDrawer').addEventListener('close',()=>{selectedUser=null;++journeyId;if(opener?.isConnected)opener.focus();});
$('userDrawer').addEventListener('click',event=>{const b=event.target.closest('[data-drawer-action]');if(b)editAction(b.dataset.drawerAction);});
$('main').addEventListener('click',event=>{
  const action=event.target.closest('[data-user-action]');if(action){openUser(action.dataset.id,action.dataset.userAction);return;}
  const view=event.target.closest('[data-view]');if(view){openUser(view.dataset.view);return;}
  const row=event.target.closest('tr[data-user]');if(row && !event.target.closest('button,a,input,select'))openUser(row.dataset.user);
});
$('userSearch').addEventListener('input',()=>{if(data)userRows();});
$('planFilter').addEventListener('change',()=>{if(data)userRows();});
$('period').addEventListener('change',load);
$('refresh').addEventListener('click',load);
window.addEventListener('storage',event=>{if((event.key==='stash_token' || event.key===null) && storedToken()!==token){clearOwnerSession();load();}});
document.querySelectorAll('.rail nav a').forEach(a=>a.addEventListener('click',()=>{document.querySelectorAll('.rail nav a').forEach(n=>n.removeAttribute('aria-current'));a.setAttribute('aria-current','location');}));
load();
