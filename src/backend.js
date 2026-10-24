/* Connection to the ReForm3D backend (the AI design server).
   Backend address, first found wins:
     1. ?api=https://host in the page address (remembered on this browser; ?api=off forgets it)
     2. window.REFORM3D_API set before this script runs, or <meta name="reform3d-api" content="https://host">
   With no address the page stays a demo: the form explains that nothing was sent. */
import './reform3d-client.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const list = (title, items, cls = '') => {
  items = (items || []).filter(Boolean);
  return items.length ? `<div class="rf-sec ${cls}"><h3>${esc(title)}</h3><ul>${items.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>` : '';
};

export function backendUrl() {
  let api = '';
  try {
    const q = new URLSearchParams(location.search).get('api');
    if (q === 'off') localStorage.removeItem('rf-api');
    else if (q) localStorage.setItem('rf-api', q);
    if (q !== 'off') api = q || localStorage.getItem('rf-api') || '';
  } catch (e) { /* storage blocked: fall through */ }
  if (!api) api = window.REFORM3D_API || ($('meta[name="reform3d-api"]') || {}).content || '';
  return api.replace(/\/$/, '');
}

const STAGES = {
  asking: 'Reading your request',
  queued: 'In the queue',
  planning: 'Reading your request',
  designing: 'The AI is designing your part. This can take a minute or two.',
  building: 'Building the files and checking they can be printed'
};

/* onModel(arrayBuffer, job): put the finished part on the 3D stage. */
export function initBackend({ onModel } = {}) {
  const api = backendUrl();
  const form = $('#repairForm'), note = $('#formNote'), status = $('#rfStatus'), submit = form.querySelector('button[type=submit]');
  const out = document.createElement('div');
  out.id = 'rfOut'; out.className = 'rf-out'; out.hidden = true; out.setAttribute('aria-live', 'polite');
  form.after(out);                       // outside the form: the panel holds forms of its own

  if (!api) {
    form.addEventListener('submit', e => { e.preventDefault(); note.textContent = 'Demo only: nothing was uploaded or sent. In ReForm3D these inputs go to the AI pipeline shown above.'; });
    status.textContent = 'Demo mode: no design server is connected to this page.';
    return { connected: false, makeTemplate: null };
  }

  const rf = new window.ReForm3D(api);
  let aiOn = false, busy = false, current = null, timer = null, t0 = 0, stage = '';

  rf.health().then(h => {
    aiOn = !!h.design;
    status.textContent = h.design
      ? `Design server online. AI design is on (${h.pool ? h.pool.models.length + ' models' : h.provider}); ${h.templates} ready-made parts as a fallback.`
      : `Design server online, AI design is off: requests are matched to ${h.templates} ready-made parts.`;
    status.classList.add('ok');
  }).catch(() => { status.textContent = 'The design server is not reachable right now. Check the server address, then reload.'; status.classList.add('bad'); });

  const setBusy = on => { busy = on; submit.disabled = on; submit.style.opacity = on ? 0.55 : ''; };
  const paint = () => { out.hidden = false; out.innerHTML = `<p class="rf-busy"><i></i><span>${esc(stage)}</span><b class="mono">${Math.round((Date.now() - t0) / 1000)} s</b></p>`; };
  const progress = s => { stage = STAGES[s] || 'Working'; if (!timer) { t0 = Date.now(); timer = setInterval(paint, 1000); } paint(); };
  const stop = () => { clearInterval(timer); timer = null; };
  const fail = msg => { stop(); out.hidden = true; out.innerHTML = ''; note.textContent = msg; note.classList.add('rf-bad'); setBusy(false); };
  const clearNote = () => { note.textContent = ''; note.classList.remove('rf-bad'); };
  const run = p => { setBusy(true); return p.then(show).catch(e => fail(e.message || 'Something went wrong. Try again.')); };

  /* ---------- 1. clarifying questions ---------- */
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (busy) return;
    clearNote();
    if (!($('#what').value || '').trim()) { note.textContent = 'Tell us what is broken or hard to use first.'; note.classList.add('rf-bad'); return; }
    if (!aiOn) return generate([]);
    setBusy(true); progress('asking');
    let qs = [];
    try { qs = ((await rf.clarify(form)) || {}).questions || []; } catch (err) { qs = []; }
    stop(); setBusy(false);
    if (!qs.length) return generate([]);
    askQuestions(qs);
  });

  function askQuestions(qs) {
    out.hidden = false;
    out.innerHTML = `<div class="rf-head"><h3>A few quick questions</h3><p class="mono">So the part fits. Change any answer that is wrong.</p></div>
      <form class="rf-qs" id="rfQs" novalidate>${qs.map((q, i) => {
        const id = 'rfq' + i, val = q.suggestion == null ? '' : q.suggestion;
        const input = q.kind === 'choice' && q.options && q.options.length
          ? `<select id="${id}">${q.options.map(o => `<option${String(o) === String(val) ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`
          : `<input id="${id}" type="${q.kind === 'number' ? 'number' : 'text'}" step="any" value="${esc(val)}" placeholder="${esc(q.unit || '')}">`;
        return `<label class="field" for="${id}">${esc(q.question)}${q.unit && q.kind === 'number' ? ` <span class="mono">(${esc(q.unit)})</span>` : ''}${input}${q.why ? `<span class="rf-why">${esc(q.why)}</span>` : ''}</label>`;
      }).join('')}
      <div class="rf-row"><button class="btn btn-fil" type="submit">Design my part</button><button class="btn btn-ghost" type="button" id="rfSkip">Skip the questions</button></div></form>`;
    $('#rfQs').addEventListener('submit', ev => {
      ev.preventDefault();
      generate(qs.map((q, i) => ({ question: q.question, answer: String($('#rfq' + i).value || '').trim() })).filter(a => a.answer));
    });
    $('#rfSkip').addEventListener('click', () => generate([]));
    out.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* ---------- 2. design ---------- */
  function generate(answers) {
    clearNote(); progress('queued');
    run(rf.generateFromForm(form, { answers, onStatus: progress, timeoutMs: 600000 }));
  }

  /* ---------- 3. result ---------- */
  async function show(job) {
    stop(); setBusy(false); current = job;
    const r = job.result, f = job.files || {}, d = r.design || null, est = r.estimate || null;
    const pieces = (r.pieces || []).map(p => `<li><b>${esc(p.name)}</b> <span class="mono">${esc((p.size_mm || []).join(' × '))} mm · ${esc(p.volume_cm3)} cm³ · ${p.ok ? 'closed solid' : 'needs attention'}</span>${(p.warnings || []).length ? `<br><span class="rf-warn">${esc(p.warnings.join(' '))}</span>` : ''}</li>`).join('');
    const estLine = est ? `<p class="rf-est mono">${est.source ? 'Sliced with ' + esc(est.source) + ': ' : 'Rough estimate: '}about ${esc(est.filament_g)} g of ${esc(est.material)}, about ${esc(est.print_minutes)} min to print.</p>` : '';
    const origin = d ? (d.cached_from ? 'Made earlier for the same request, so no AI call was needed.' : d.tuned_from ? 'Rebuilt with your sizes, no AI involved.' : d.revised_from ? 'Changed as you asked.' : '') : '';
    const how = d ? `${d.attempts} design pass${d.attempts === 1 ? '' : 'es'}${d.reviewed ? ', checked against a picture of its own result' : ''}${d.models && d.models.length ? '. Designed by ' + d.models.join(' and ') : ''}.` : '';
    out.hidden = false;
    out.innerHTML =
      `<div class="rf-head"><h3>${esc(r.part_name || 'Your part')}</h3><p class="mono">${d ? 'Designed from scratch by the AI' : 'Ready-made part, sized for you'}</p></div>
      <p class="rf-stage-note mono" id="rfStageNote">${f.glb && innerWidth >= 900 ? 'Your part is on the stage to the left. Drag to turn it.' : ''}</p>
      ${f.preview ? `<img class="rf-prev" id="rfPrev" src="${esc(f.preview)}" alt="Preview of the generated part" loading="lazy">` : ''}
      ${d && d.understanding ? `<p class="rf-und">${esc(d.understanding)}</p>` : job.plan && job.plan.rationale && !/chosen directly/.test(job.plan.rationale) ? `<p class="rf-und">${esc(job.plan.rationale)}</p>` : ''}
      ${origin || how ? `<p class="rf-est mono">${esc([origin, how].filter(Boolean).join(' '))}</p>` : ''}
      ${estLine}
      <div class="rf-dl">${f.zip ? `<a class="btn btn-fil" href="${esc(f.zip)}" target="_blank" rel="noopener">Download everything (.zip)</a>` : ''}${(f.stl || []).map(s => `<a class="btn btn-ghost" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.piece)}.stl</a>`).join('')}${f.fit_test ? `<a class="btn btn-ghost" href="${esc(f.fit_test)}" target="_blank" rel="noopener">Fit test</a>` : ''}${f.readme ? `<a class="btn btn-ghost" href="${esc(f.readme)}" target="_blank" rel="noopener">Print notes</a>` : ''}</div>
      ${pieces ? `<ul class="rf-pieces">${pieces}</ul>` : ''}
      ${list('Check before you print', r.warnings, 'warn')}
      ${d ? list('Sizes it assumed. Check these against the real object.', d.assumptions) : ''}
      ${list('How to print it', r.print_notes)}${list('Fit', r.fit_notes)}
      <div id="rfTools"></div>
      <p class="rf-disc">${esc(r.disclaimer || 'Test print before relying on it. Printed parts are light-duty aids, not safety equipment.')}</p>`;
    tools(job);
    out.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (f.glb && onModel) {
      try { const buf = await (await fetch(f.glb)).arrayBuffer(); await onModel(buf, job); }
      catch (err) { const n = $('#rfStageNote'); if (n) n.textContent = ''; }
    }
  }

  /* ---------- 4. change it: sizes without AI, words with AI ---------- */
  async function tools(job) {
    const box = $('#rfTools'), r = job.result, d = r.design;
    let fields = [], rebuild = null;
    if (d && (d.parameters || []).length) {
      fields = d.parameters.map(p => ({ name: p.name, label: p.name.replace(/_/g, ' '), value: p.value ?? p.default, unit: /angle|deg|count|n_|number/.test(p.name) ? '' : 'mm' }));
      rebuild = params => rf.tune(job.id, params, { onStatus: progress });
    } else if (!d && r.part_id) {
      try {
        const spec = await rf.part(r.part_id);
        fields = (spec.params || []).filter(p => p.kind === 'float' || p.kind === 'int').slice(0, 6).map(p => ({ name: p.name, label: p.label, value: (r.params || {})[p.name] ?? p.default, unit: p.unit || '', min: p.min, max: p.max }));
      } catch (e) { fields = []; }
      rebuild = params => rf.build(r.part_id, Object.assign({}, r.params, params), { onStatus: progress });
    }
    box.innerHTML =
      (fields.length ? `<form class="rf-tune" id="rfTune" novalidate><h3>Adjust the sizes <span class="mono">no AI, a few seconds</span></h3><div class="rf-grid">${fields.map((p, i) =>
        `<label class="field" for="rft${i}">${esc(p.label)}${p.unit ? ` <span class="mono">(${esc(p.unit)})</span>` : ''}<input id="rft${i}" type="number" step="any" data-name="${esc(p.name)}" value="${esc(p.value)}"${p.min != null ? ` min="${p.min}" max="${p.max}"` : ''}></label>`).join('')}</div><button class="btn btn-ghost" type="submit">Rebuild with these sizes</button></form>` : '') +
      (d && aiOn ? `<form class="rf-rev" id="rfRev" novalidate><label class="field" for="rfFb">Want the design changed?<textarea id="rfFb" placeholder="Make the grip 10 mm longer and round the edges."></textarea></label><button class="btn btn-ghost" type="submit">Change the design</button></form>` : '');
    const tune = $('#rfTune');
    if (tune) tune.addEventListener('submit', e => {
      e.preventDefault(); if (busy) return; clearNote();
      const params = {}; tune.querySelectorAll('input').forEach(i => { if (i.value !== '') params[i.dataset.name] = Number(i.value); });
      progress('building'); run(rebuild(params));
    });
    const rev = $('#rfRev');
    if (rev) rev.addEventListener('submit', e => {
      e.preventDefault(); if (busy) return; clearNote();
      const fb = ($('#rfFb').value || '').trim(); if (!fb) return;
      progress('designing'); run(rf.revise(job.id, fb, { onStatus: progress, timeoutMs: 600000 }));
    });
  }

  /* ---------- 5. the example parts: build the real template ---------- */
  function makeTemplate(id) {
    if (busy) return Promise.resolve();
    clearNote(); progress('building');
    return run(rf.build(id, {}, { onStatus: progress }));
  }

  return { connected: true, makeTemplate };
}
