// Command Center. All plan content is read at runtime from .colaberry/*.json — nothing about the plan is typed in here.
// Only SAMPLE (clearly labelled made-up data) and MODEL (a proposed data model) live in this file.
const TABS = [
  ['overview', 'Overview'], ['outcomes', 'Outcomes'], ['users', 'Users and use case'],
  ['guardrails', 'Guardrails'], ['systems', 'Systems'], ['projects', 'Project management'],
  ['agents', 'AI agents'], ['knowledge', 'Knowledge base'], ['data', 'Data model'],
];
const DAY = 86400000;
let D = null;

let SAMPLE = null, MODEL = [];

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const getJSON = async p => { const r = await fetch(p, { cache: 'no-store' }); if (!r.ok) throw new Error(p + ' → ' + r.status); return r.json(); };
const sample = () => (localStorage.getItem('cc-mode') || 'real') === 'sample';
const P = () => (sample() && SAMPLE ? SAMPLE.plan : D.plan);
const G = () => (sample() && SAMPLE ? SAMPLE.progress : D.progress);
const stateOf = id => { const s = (G().stories || []).find(x => x.id === id); return (s && s.verification && s.verification.state) || 'not_started'; };
const stateLabel = s => ({ not_started: 'Not started', in_progress: 'In progress', submitted: 'Submitted', verified: 'Verified' }[s] || s);
const card = (href, inner) => `<a class="card" href="${href}">${inner}</a>`;
const grid = items => `<div class="grid">${items.join('')}</div>`;
const back = (tab, label) => `<a class="back" href="#/${tab}">← ${esc(label)}</a>`;
const empty = (title, msg) => `<div class="card"><strong>${esc(title)}</strong><p class="muted">${msg}</p></div>`;
const dot = (cls, text) => `<span class="dot ${cls}"></span>${esc(text)}`;

function stamp() {
  const el = document.getElementById('stamp');
  const g = D.manifest && D.manifest.generated_at;
  if (!g) { el.textContent = 'Data as of: unknown — sync from the portal to refresh'; el.className = 'stamp warn'; return; }
  const d = new Date(g), age = Date.now() - d.getTime(), days = Math.floor(age / DAY);
  const rel = days >= 1 ? days + (days === 1 ? ' day ago' : ' days ago') : (age < 3600000 ? 'under an hour ago' : Math.floor(age / 3600000) + ' hours ago');
  const abs = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const old = age > 7 * DAY;
  el.textContent = `Data as of ${abs} (${rel})` + (old ? ' — sync from the portal to refresh' : '');
  el.className = 'stamp' + (old ? ' warn' : '');
}

function nav(active) {
  document.getElementById('nav').innerHTML = TABS.map(([k, t]) => `<a href="#/${k}" class="${k === active ? 'on' : ''}">${t}</a>`).join('');
}

const sampleBanner = () => (sample() ? '<div class="sample">SAMPLE DATA — made up for illustration, not from your project</div>' : '');

// ---------- tabs ----------
function overview() {
  const plan = P(), t = G().totals || {}, s = plan.schedule || {};
  const demo = (plan.releases || []).find(r => r.key === s.demo_release_key);
  return `<h2>${esc(plan.project.name)}</h2><p>${esc(plan.project.descriptor)}</p>
    ${grid([
      card('#/projects/' + (demo ? 'rel:' + demo.key : ''), `<div class="l">Current release (demo target)</div><div class="n">${esc(demo ? demo.key : '—')}</div><div class="l">${esc(demo ? demo.name : '')}</div>`),
      card('#/projects', `<div class="l">Demo day</div><div class="n">${esc(s.demo_day || '—')}</div><div class="l">Build ends ${esc(s.build_end || '—')}</div>`),
    ])}
    ${grid([
      card('#/projects', `<div class="n">${esc(t.stories_verified)} of ${esc(t.stories_total)}</div><div class="l">Stories verified</div>`),
      card('#/knowledge', `<div class="n">${esc(t.criteria_passed)} of ${esc(t.criteria_total)}</div><div class="l">Criteria passed</div>`),
      card('#/projects', `<div class="n">${esc(t.points_awarded)}</div><div class="l">Points awarded</div>`),
    ])}
    <h3>Releases</h3>
    ${grid((plan.releases || []).map(r => card('#/projects/rel:' + r.key, `<div class="l">${esc(r.key)}${r.is_demo_target ? ' · demo target' : ''}</div><strong>${esc(r.name)}</strong><div class="l">${(r.story_ids || []).length} stories</div>`)))}
    <p class="muted">"Live" means as of the last sync — nothing here updates between syncs. Nothing is shown as connected or running because nothing has reported that.</p>`;
}

function outcomes(id) {
  const ms = P().derived.measures || [];
  if (id) {
    const m = ms.find(x => x.id === id);
    return back('outcomes', 'Outcomes') + (m ? `<h2>${esc(m.id)}</h2><p>${esc(m.statement)}</p>${empty('No target or actual value', 'Your plan has no numeric target for this measure yet, so no number is shown.')}` : empty('Not found', 'No such measure.'));
  }
  return `<h2>Outcomes — the numbers this has to move</h2>${sampleBanner()}` +
    (ms.length ? grid(ms.map(m => card('#/outcomes/' + m.id, `<strong>${esc(m.id)}</strong><p>${esc(m.statement)}</p><div class="l">No target set yet</div>`)))
      : empty('No outcome measures defined yet', 'Your plan carries no numeric target. When one is added to the plan, it appears here as its own card. Raise this with your instructor.'));
}

function users(id) {
  const plan = P(), roles = plan.derived.roles || [];
  const forRole = r => (plan.stories || []).filter(s => (s.narrative || '').toLowerCase().includes('as a ' + r.toLowerCase()));
  if (id) {
    const r = roles.find(x => x === id);
    return back('users', 'Users') + (r ? `<h2>${esc(r)}</h2>` + forRole(r).map(s => card('#/projects/' + s.id, `<strong>${esc(s.id)}</strong> ${esc(s.title)}<p class="muted">${esc(s.narrative)}</p>`)).join('') : empty('Not found', 'No such role.'));
  }
  return `<h2>Users and use case</h2>${sampleBanner()}` +
    (roles.length ? grid(roles.map(r => card('#/users/' + encodeURIComponent(r), `<strong>${esc(r)}</strong><div class="l">${forRole(r).length} stories</div>`))) : empty('No roles yet', 'No roles were found in your stories.'));
}

function guardrails(id) {
  const plan = P(), gs = plan.derived.guardrails || [];
  const status = g => {
    const stories = (plan.requirements || []).filter(r => r.id === g.id).flatMap(r => r.fulfilled_by || []);
    const ok = stories.length > 0 && stories.every(s => stateOf(s) === 'verified');
    return { stories, ok };
  };
  const say = st => (st.ok ? 'Enforced: its stories are verified' : 'A promise you have made and not yet kept — its stories are not verified');
  if (id) {
    const g = gs.find(x => x.id === id);
    if (!g) return back('guardrails', 'Guardrails') + empty('Not found', 'No such guardrail.');
    const st = status(g);
    return back('guardrails', 'Guardrails') + `<h2>${esc(g.id)}</h2><p>${esc(g.statement)}</p><p>${say(st)}</p>` + st.stories.map(s => card('#/projects/' + s, `${esc(s)} — ${stateLabel(stateOf(s))}`)).join('');
  }
  return `<h2>Guardrails — what must never happen</h2>${sampleBanner()}` +
    (gs.length ? grid(gs.map(g => card('#/guardrails/' + g.id, `<strong>${esc(g.id)}</strong><p>${esc(g.statement)}</p><div class="l">${say(status(g))}</div>`)))
      : empty('No guardrails defined', 'Your plan has no requirement typed SAFE yet, which usually means the promise was recorded as a normal feature. Raise this with your instructor — worth fixing early.'));
}

function systems(id) {
  const ss = P().derived.systems || [];
  const row = s => dot('grey', 'Not checked from here') + ' · last checked: never';
  if (id) {
    return back('systems', 'Systems') + `<h2>${esc(id)}</h2><p>${row(id)}</p>${empty('Connection status unknown', 'Nothing in this repo can tell whether this system is connected. The indicator stays grey until your running system reports a status.')}`;
  }
  return `<h2>Systems — what this connects to</h2>${sampleBanner()}` +
    grid(ss.map(s => card('#/systems/' + encodeURIComponent(s), `<strong>${esc(s)}</strong><p>${row(s)}</p>`)));
}

function projects(id) {
  const plan = P(), rels = plan.releases || [], stories = plan.stories || [];
  if (id && id.startsWith('rel:')) {
    const r = rels.find(x => x.key === id.slice(4));
    if (!r) return back('projects', 'Project management') + empty('Not found', 'No such release.');
    return back('projects', 'Project management') + `<h2>${esc(r.key)} — ${esc(r.name)}</h2><p>${esc(r.goal)}</p><p class="muted">${esc(r.starts_on)} → ${esc(r.ends_on)}${r.is_demo_target ? ' · demo target' : ''}</p>` +
      ((r.story_ids || []).length ? grid(r.story_ids.map(sid => { const s = stories.find(x => x.id === sid) || {}; return card('#/projects/' + sid, `<strong>${esc(sid)}</strong> ${esc(s.title)}<div class="l">${stateLabel(stateOf(sid))}</div>`); })) : empty('No stories in this release', 'Stories will be listed here once they are planned.'));
  }
  if (id) {
    const s = stories.find(x => x.id === id);
    if (!s) return back('projects', 'Project management') + empty('Not found', 'No such story.');
    const slip = s.due_on && s.due_baseline_on && s.due_on !== s.due_baseline_on;
    return back('projects', 'Project management') + `<h2>${esc(s.id)} — ${esc(s.title)}</h2><p>${esc(s.narrative)}</p>
      <p>Status: <strong>${stateLabel(stateOf(s.id))}</strong></p>
      <p>Due: <strong>${esc(s.due_on)}</strong> · First given: ${esc(s.due_baseline_on)}${slip ? ' <span class="muted">(date has moved)</span>' : ''}</p>
      <p>Release: ${esc(s.release)} · Owner: ${esc(s.owner_agent)} · Fulfils: ${(s.fulfills || []).map(esc).join(', ')}</p>
      ${s.acceptance ? `<h3>Acceptance</h3><pre>${esc(typeof s.acceptance === 'string' ? s.acceptance : JSON.stringify(s.acceptance, null, 1))}</pre>` : ''}`;
  }
  const dates = rels.flatMap(r => [r.starts_on, r.ends_on]).concat(plan.schedule.demo_day || []).filter(Boolean).map(d => +new Date(d));
  const lo = Math.min(...dates), span = Math.max(...dates) - lo || 1;
  const bar = r => { const l = (new Date(r.starts_on) - lo) / span * 100, w = Math.max(3, (new Date(r.ends_on) - new Date(r.starts_on)) / span * 100); return `<a class="bar ${r.is_demo_target ? 'demo' : ''}" style="left:${l}%;width:${w}%" href="#/projects/rel:${esc(r.key)}">${esc(r.key)}</a>`; };
  const demoPos = plan.schedule.demo_day ? (new Date(plan.schedule.demo_day) - lo) / span * 100 : null;
  return `<h2>Project management</h2>${sampleBanner()}
    <div class="gantt">${rels.map(r => `<div class="row"><span class="rl">${esc(r.key)} ${esc(r.name)}</span><div class="track">${r.starts_on ? bar(r) : ''}${demoPos != null ? `<i class="demoline" style="left:${demoPos}%"></i>` : ''}</div></div>`).join('')}</div>
    <p class="muted">${esc(rels.length ? '' : 'No releases in the plan.')}Highlighted bar = demo target. Vertical line = demo day (${esc(plan.schedule.demo_day)}). Releases after it are the roadmap.</p>
    <table><tr><th>Task</th><th>Release</th><th>Due</th><th>First given</th><th>Status</th></tr>
    ${stories.map(s => `<tr><td><a href="#/projects/${esc(s.id)}">${esc(s.id)} ${esc(s.title)}</a></td><td>${esc(s.release)}</td><td>${esc(s.due_on)}</td><td>${esc(s.due_baseline_on)}</td><td>${stateLabel(stateOf(s.id))}</td></tr>`).join('')}</table>`;
}

function agents(id) {
  const plan = P(), real = plan.agents || [];
  const owners = [...new Set((plan.stories || []).map(s => s.owner_agent).filter(Boolean))];
  const none = '<div class="l">No runs recorded</div><div class="l">No skills registered yet</div>';
  if (id) {
    const a = real.find(x => x.name === id);
    const owned = (plan.stories || []).filter(s => s.owner_agent === id);
    return back('agents', 'AI agents') + `<h2>${esc(id)}</h2>${a ? `<p>${esc(a.purpose)}</p>` : '<p class="muted">An owner of stories, not a scoped AI agent.</p>'}${none}
      <h3>Owns</h3>${owned.map(s => card('#/projects/' + s.id, `${esc(s.id)} ${esc(s.title)} — ${stateLabel(stateOf(s.id))}`)).join('') || '<p class="muted">Nothing.</p>'}`;
  }
  return `<h2>AI agents</h2>${sampleBanner()}` + (real.length ? '' : '<div class="banner">Your plan has no scoped agent roster yet. These cards are story owners — a job title is not an AI agent.</div>') +
    grid((real.length ? real.map(a => a.name) : owners).map(n => card('#/agents/' + encodeURIComponent(n), `<strong>${esc(n)}</strong><div class="l">Owns ${(plan.stories || []).filter(s => s.owner_agent === n).map(s => s.id).join(', ')}</div>${none}`)));
}

function knowledge(id) {
  const plan = P(), reqs = plan.requirements || [], stories = plan.stories || [];
  if (id && id.startsWith('story:')) return projects(id.slice(6));
  if (id) {
    const r = reqs.find(x => x.id === id);
    if (!r) return back('knowledge', 'Knowledge base') + empty('Not found', 'No such requirement.');
    return back('knowledge', 'Knowledge base') + `<h2>${esc(r.id)}</h2><p>${esc(r.statement)}</p><p class="muted">${esc(r.kind)} · ${esc(r.priority)}${r.cluster ? ' · ' + esc(r.cluster) : ''}</p>` +
      ((r.fulfilled_by || []).map(s => card('#/projects/' + s, `${esc(s)} — ${stateLabel(stateOf(s))}`)).join('') || empty('Gap', 'No story covers this requirement.'));
  }
  const rows = reqs.map(r => {
    const f = r.fulfilled_by || [];
    const cov = f.length ? f.map(s => `${esc(s)} (${stateLabel(stateOf(s))})`).join(', ') : (r.priority === 'must' ? '<strong>GAP — a must with no story</strong>' : 'none');
    return `<tr><td><a href="#/knowledge/${esc(r.id)}">${esc(r.id)}</a></td><td>${esc(r.statement)}</td><td>${esc(r.priority)}</td><td>${cov}</td></tr>`;
  }).join('');
  return `<h2>Knowledge base</h2>${sampleBanner()}
    <h3>Traceability</h3><table><tr><th>Requirement</th><th>Statement</th><th>Priority</th><th>Covered by</th></tr>${rows}</table>
    <h3>Stories</h3>${grid(stories.map(s => card('#/knowledge/story:' + s.id, `<strong>${esc(s.id)}</strong> ${esc(s.title)}<div class="l">${stateLabel(stateOf(s.id))}</div>`)))}
    <p class="muted">Notes and decisions will be added here as the project grows.</p>
    <h3>Ask about this data</h3>
    <form id="ask"><input id="q" placeholder="e.g. what covers REQ-002?" autocomplete="off"><button>Ask</button></form><div id="ans" class="card muted">Ask a question about the requirements, stories, releases or systems on this page.</div>`;
}

function answer(q) {
  const plan = P(), words = q.toLowerCase().split(/\W+/).filter(w => w.length > 2);
  if (!words.length) return 'Please ask a question.';
  const hits = [];
  (plan.requirements || []).forEach(r => { if (words.some(w => (r.id + ' ' + r.statement).toLowerCase().includes(w))) hits.push(`${r.id}: ${r.statement} — covered by ${(r.fulfilled_by || []).join(', ') || 'no story'} <em>(Knowledge base)</em>`); });
  (plan.stories || []).forEach(s => { if (words.some(w => (s.id + ' ' + s.title).toLowerCase().includes(w))) hits.push(`${s.id}: ${s.title}, due ${s.due_on}, ${stateLabel(stateOf(s.id))} <em>(Project management)</em>`); });
  (plan.derived.systems || []).forEach(s => { if (words.some(w => s.toLowerCase().includes(w))) hits.push(`${s} is a planned system; its connection status is unknown <em>(Systems)</em>`); });
  return hits.length ? hits.slice(0, 6).map(h => `<p>${h}</p>`).join('') : 'I can\'t answer that from the data on this page.';
}

function data(id) {
  const reqText = r => { const q = (P().requirements || []).find(x => x.id === r); return `<li><a href="#/knowledge/${esc(r)}">${esc(r)}</a>${q ? ' — ' + esc(q.statement) : ''}</li>`; };
  if (id) {
    const m = MODEL.find(x => x.name === id);
    return back('data', 'Data model') + (m ? `<h2>${esc(m.name)}</h2><p class="muted">${esc(m.relations)}</p><ul>${m.fields.map(f => `<li>${esc(f)}</li>`).join('')}</ul><h3>Requirements</h3><ul>${m.requirements.map(reqText).join('')}</ul>` : empty('Not found', 'No such table.'));
  }
  return `<h2>Data model</h2><div class="banner">Proposed model, derived from your requirements — not built. Review it before any table is created.</div>${sampleBanner()}` +
    (sample() ? '' : '') + (MODEL.length ? grid(MODEL.map(m => card('#/data/' + m.name, `<strong>${esc(m.name)}</strong><div class="l">${m.fields.length} fields · ${esc(m.requirements.join(', '))}</div><div class="l">${esc(m.relations)}</div>`))) : empty('No data model yet', 'Nothing in .colaberry/data-model.json.'));
}

const VIEWS = { overview, outcomes, users, guardrails, systems, projects, agents, knowledge, data };

function render() {
  if (!D) return;
  const [k, ...rest] = location.hash.replace('#/', '').split('/');
  const key = VIEWS[k] ? k : 'overview';
  const id = rest.length ? decodeURIComponent(rest.join('/')) : '';
  nav(key); stamp();
  const html = VIEWS[key](id);
  document.getElementById('view').innerHTML = (html.includes('class="sample"') ? '' : sampleBanner()) + html;
  const f = document.getElementById('ask');
  if (f) f.onsubmit = e => { e.preventDefault(); const a = document.getElementById('ans'); a.className = 'card'; a.innerHTML = answer(document.getElementById('q').value); };
}

async function init() {
  const m = document.getElementById('mode');
  m.value = sample() ? 'sample' : 'real';
  m.onchange = () => { try { localStorage.setItem('cc-mode', m.value); } catch (e) {} render(); };
  window.addEventListener('hashchange', render);
  try {
    const [plan, progress, manifest, sm, dm] = await Promise.all([
      getJSON('.colaberry/plan.json'), getJSON('.colaberry/progress.json'), getJSON('.colaberry/manifest.json').catch(() => null),
      getJSON('command-center/sample.json').catch(() => null), getJSON('.colaberry/data-model.json').catch(() => null)]);
    SAMPLE = sm; MODEL = (dm && dm.tables) || [];
    D = { plan, progress, manifest };
    document.getElementById('proj').textContent = plan.project.name + ' — Command Center';
    render();
  } catch (e) {
    document.getElementById('stamp').textContent = 'Could not load .colaberry data: ' + e.message;
    document.getElementById('stamp').className = 'stamp warn';
  }
}
init();
