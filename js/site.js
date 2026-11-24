/* HotelMozil travel guides: menu, filters, month tabs, share, site search, small locator map. No framework. */
(function () {
  'use strict';
  const BASE = document.documentElement.dataset.base || '/';

  function common() {
    const btn = document.querySelector('.menu-btn'), nav = document.querySelector('.nav');
    if (btn && nav) btn.addEventListener('click', () => { const o = nav.classList.toggle('open'); btn.setAttribute('aria-expanded', String(o)); });
    document.querySelectorAll('[data-filter]').forEach(b => b.addEventListener('click', () => {
      const v = b.dataset.filter;
      document.querySelectorAll('[data-filter]').forEach(x => x.classList.toggle('on', x === b));
      document.querySelectorAll('[data-cat]').forEach(c => { c.hidden = v !== 'all' && c.dataset.cat !== v; });
    }));
    document.querySelectorAll('[data-month]').forEach(b => b.addEventListener('click', () => {
      document.querySelectorAll('[data-month]').forEach(x => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-selected', String(on)); });
      document.querySelectorAll('[data-month-panel]').forEach(p => { p.hidden = p.dataset.monthPanel !== b.dataset.month; });
    }));
    const sh = document.querySelector('[data-share]');
    if (sh) sh.addEventListener('click', async () => {
      try { if (navigator.share) await navigator.share({ title: document.title, url: location.href }); else { await navigator.clipboard.writeText(location.href); sh.textContent = 'הקישור הועתק'; } } catch (e) {}
    });
  }

  // ---- site search: destinations, areas, guides and places ----
  function search() {
    const input = document.getElementById('site-q'), list = document.getElementById('site-suggest');
    if (!input || !list) return;
    const form = input.form;
    // strip Hebrew points, quotes, dashes, dots and spaces so that typing variants still match
    const junk = new RegExp('[' + String.fromCharCode(0x0591) + '-' + String.fromCharCode(0x05c7) + String.fromCharCode(0x05f3, 0x05f4) + '\'"\\-\\s.,:]', 'g');
    const norm = s => (s || '').toLowerCase().replace(junk, '');
    let index = null, loading = null, items = [], sel = -1;
    const load = () => loading || (loading = fetch(BASE + 'data/search.json').then(r => r.json()).then(rows => {
      index = rows.map(r => ({ r, keys: [r.t].concat(r.k || []).map(norm) }));
    }).catch(() => { index = []; }));
    const go = it => { location.href = BASE + it.u; };
    const render = (empty) => {
      list.innerHTML = '';
      items.forEach((it, i) => {
        const li = document.createElement('li');
        li.setAttribute('role', 'option'); li.setAttribute('aria-selected', String(i === sel));
        const b = document.createElement('span'); b.textContent = it.t;
        const s = document.createElement('small'); s.textContent = it.s;
        li.append(b, s);
        li.addEventListener('mousedown', ev => { ev.preventDefault(); go(it); });
        list.append(li);
      });
      if (!items.length && empty) { const li = document.createElement('li'); li.className = 'none'; li.textContent = 'לא מצאנו. נסו שם של יעד, עיר או מקום.'; list.append(li); }
      const open = items.length > 0 || !!empty;
      list.classList.toggle('open', open);
      input.setAttribute('aria-expanded', String(open));
    };
    const run = () => {
      const q = norm(input.value);
      if (!q || !index) { items = []; sel = -1; render(false); return; }
      items = index.map(it => {
        let s = 0;
        for (const k of it.keys) { if (k === q) s = Math.max(s, 3); else if (k.startsWith(q)) s = Math.max(s, 2); else if (k.includes(q)) s = Math.max(s, 1); }
        return [s ? s * 10 + (it.r.w || 0) : 0, it.r];
      }).filter(x => x[0] > 0).sort((a, b) => b[0] - a[0]).slice(0, 8).map(x => x[1]);
      sel = items.length ? 0 : -1; render(true);
    };
    input.addEventListener('focus', load);
    input.addEventListener('input', () => load().then(run));
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { sel = Math.min(items.length - 1, sel + 1); render(true); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); render(true); e.preventDefault(); }
      else if (e.key === 'Escape') { items = []; render(false); }
    });
    input.addEventListener('blur', () => setTimeout(() => { list.classList.remove('open'); input.setAttribute('aria-expanded', 'false'); }, 150));
    if (form) form.addEventListener('submit', e => {
      e.preventDefault();
      load().then(() => { run(); if (items[sel]) go(items[sel]); else if (!norm(input.value)) location.href = form.action; });
    });
  }

  // ---- small locator map on destination pages (d3-geo orthographic) ----
  async function locator() {
    const el = document.querySelector('.locator[data-iso]');
    if (!el || !window.d3 || !window.topojson) return;
    const canvas = el.querySelector('canvas'), ctx = canvas.getContext('2d');
    const t = await fetch(BASE + 'data/countries-110m.json').then(r => r.json());
    const feats = topojson.feature(t, t.objects.countries).features;
    const iso = el.dataset.iso, at = JSON.parse(el.dataset.at);
    const me = feats.find(f => String(f.id) === iso);
    const dpr = Math.min(devicePixelRatio || 1, 2), W = el.clientWidth;
    canvas.width = W * dpr; canvas.height = W * dpr;
    ctx.scale(dpr, dpr);
    const proj = d3.geoOrthographic().translate([W / 2, W / 2]).scale(W / 2 * .96).rotate([-at[0], -at[1]]).clipAngle(90);
    const path = d3.geoPath(proj, ctx);
    const brand = getComputedStyle(document.documentElement).getPropertyValue('--brand').trim() || '#2f5bd7';
    ctx.beginPath(); path({ type: 'Sphere' }); ctx.fillStyle = '#f1f3f5'; ctx.fill();
    ctx.beginPath(); for (const f of feats) path(f); ctx.fillStyle = '#d5d9de'; ctx.fill();
    ctx.beginPath(); path(topojson.mesh(t, t.objects.countries, (a, b) => a !== b)); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = .6; ctx.stroke();
    if (me) { ctx.beginPath(); path(me); ctx.fillStyle = brand; ctx.fill(); }
    const p = proj(at);
    if (p) { ctx.beginPath(); ctx.arc(p[0], p[1], 10, 0, 7); ctx.strokeStyle = brand; ctx.lineWidth = 1.5; ctx.stroke(); }
    ctx.beginPath(); path({ type: 'Sphere' }); ctx.strokeStyle = '#c9ced4'; ctx.lineWidth = 1; ctx.stroke();
  }

  document.addEventListener('DOMContentLoaded', () => { common(); search(); locator(); });
})();
