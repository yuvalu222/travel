/* HotelMozil globe: d3-geo orthographic on canvas. No framework. */
(function () {
  'use strict';
  const BASE = document.documentElement.dataset.base || '/';
  const DEST = (window.HM && window.HM.dest) || [];
  const AREAS = (window.HM && window.HM.areas) || [];
  const byIso = new Map(DEST.map(d => [d.iso, d]));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const C = {
    ocean1: '#173049', ocean2: '#0b1824', land: '#2c4a63', land2: '#33556f', border: 'rgba(11,24,36,.85)',
    grat: 'rgba(244,239,230,.07)', hot: '#e2552c', hot2: '#f07a50', hover: '#f4efe6', pick: '#ffb38f',
    pin: '#fff6ea', label: '#f4efe6', rim: 'rgba(120,180,255,.28)'
  };

  function loadJSON(url) { return fetch(url).then(r => r.json()); }

  async function boot() {
    const host = document.getElementById('globe');
    if (!host) return;
    const canvas = host.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const tip = host.querySelector('.globe-tip');
    const card = document.getElementById('globe-card');
    const [t110, names] = await Promise.all([loadJSON(BASE + 'data/countries-110m.json'), loadJSON(BASE + 'data/names.json')]);
    let world = topojson.feature(t110, t110.objects.countries).features;
    let world110 = world, world50 = null;
    const mesh110 = topojson.mesh(t110, t110.objects.countries, (a, b) => a !== b);
    let mesh = mesh110;
    // hi-res borders after first paint
    loadJSON(BASE + 'data/countries-50m.json').then(t50 => {
      world50 = topojson.feature(t50, t50.objects.countries).features;
      world50.forEach(prep);
      world = world50; mesh = topojson.mesh(t50, t50.objects.countries, (a, b) => a !== b);
      draw();
    }).catch(() => {});
    function prep(f) { f.b = d3.geoBounds(f); f.hot = byIso.has(String(f.id)); }
    world.forEach(prep);

    const proj = d3.geoOrthographic().clipAngle(90).precision(0.6);
    const path = d3.geoPath(proj, ctx);
    const grat = d3.geoGraticule10();
    let W = 0, H = 0, R = 0, dpr = 1, zoom = 1;
    let rot = [-35, -22, 0];
    let hoverF = null, pickF = null, moving = false, lastInteract = 0, anim = null;
    const startTime = performance.now();

    function size() {
      const r = host.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = r.width; H = r.height;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      R = Math.min(W, H) / 2 * 0.86;
      draw();
    }

    function visible(lonlat) { return d3.geoDistance(lonlat, [-rot[0], -rot[1]]) < Math.PI / 2 - 0.05; }

    const base = document.createElement('canvas'), bctx = base.getContext('2d');
    const bpath = d3.geoPath(proj, bctx);
    let baseKey = '';
    function drawBase(r) {
      const key = [W, H, dpr, rot[0].toFixed(2), rot[1].toFixed(2), zoom.toFixed(3), hoverF && hoverF.id, pickF && pickF.id, moving, world.length].join('|');
      if (key === baseKey) return;
      baseKey = key;
      if (base.width !== canvas.width || base.height !== canvas.height) { base.width = canvas.width; base.height = canvas.height; }
      const c = bctx;
      c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
      const cx = W / 2, cy = H / 2;
      const atm = c.createRadialGradient(cx, cy, r * 0.96, cx, cy, r * 1.16);
      atm.addColorStop(0, 'rgba(120,180,255,.22)'); atm.addColorStop(1, 'rgba(120,180,255,0)');
      c.fillStyle = atm; c.beginPath(); c.arc(cx, cy, r * 1.16, 0, 2 * Math.PI); c.fill();
      const oc = c.createRadialGradient(cx - r * .35, cy - r * .4, r * .1, cx, cy, r);
      oc.addColorStop(0, C.ocean1); oc.addColorStop(1, C.ocean2);
      c.fillStyle = oc; c.beginPath(); bpath({ type: 'Sphere' }); c.fill();
      c.beginPath(); bpath(grat); c.strokeStyle = C.grat; c.lineWidth = 1; c.stroke();
      const feats = (moving && world110) ? world110 : world;
      c.beginPath(); for (const f of feats) if (!f.hot) bpath(f); c.fillStyle = C.land; c.fill();
      c.beginPath(); for (const f of feats) if (f.hot) bpath(f); c.fillStyle = C.hot; c.fill();
      if (hoverF) { c.beginPath(); bpath(hoverF); c.fillStyle = hoverF.hot ? C.hot2 : C.land2; c.fill(); }
      if (pickF) { c.beginPath(); bpath(pickF); c.fillStyle = pickF.hot ? C.pick : '#46708f'; c.fill(); }
      c.beginPath(); bpath(moving ? mesh110 : mesh); c.strokeStyle = C.border; c.lineWidth = 0.7; c.stroke();
      c.beginPath(); bpath({ type: 'Sphere' }); c.strokeStyle = C.rim; c.lineWidth = 1.2; c.stroke();
    }

    function draw() {
      if (!W) return;
      const r = R * zoom;
      proj.translate([W / 2, H / 2]).scale(r).rotate(rot);
      drawBase(r);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(base, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const t = (performance.now() - startTime) / 1000;
      ctx.font = `700 ${Math.max(12, Math.min(15, r / 22))}px Assistant, Heebo, Arial, sans-serif`;
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      for (const d of DEST) {
        if (!visible(d.at)) continue;
        const p = proj(d.at); if (!p) continue;
        const pulse = reduce ? 0 : (t * 0.8 + d.phase) % 1;
        ctx.beginPath(); ctx.arc(p[0], p[1], 4 + pulse * 12, 0, 2 * Math.PI);
        ctx.strokeStyle = `rgba(255,246,234,${0.55 * (1 - pulse)})`; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.beginPath(); ctx.arc(p[0], p[1], 3.6, 0, 2 * Math.PI); ctx.fillStyle = C.pin; ctx.fill();
        if (zoom > 1.25 || r > 300) {
          const label = d.short || d.name;
          const w = ctx.measureText(label).width;
          ctx.fillStyle = 'rgba(11,24,36,.62)';
          ctx.fillRect(p[0] - 10 - w - 6, p[1] - 11, w + 12, 22);
          ctx.fillStyle = C.label; ctx.fillText(label, p[0] - 10, p[1] + 1);
        }
      }
    }

    let lastFrame = 0, spinning = false, onScreen = true;
    new IntersectionObserver(es => { onScreen = es[0].isIntersecting; }).observe(host);
    function loop(now) {
      requestAnimationFrame(loop);
      if (!onScreen || document.hidden || now - lastFrame < 33) return;
      lastFrame = now;
      const idle = performance.now() - lastInteract > 5000;
      const spin = !anim && !drag && idle && !(card && card.classList.contains('show')) && !reduce;
      if (spin) { rot[0] += 0.12; moving = true; spinning = true; }
      else if (spinning) { spinning = false; if (!anim && !drag) moving = false; }
      if (!reduce) draw();
    }

    // ---- hit test ----
    function featureAt(x, y) {
      const ll = proj.invert([x, y]);
      if (!ll || d3.geoDistance(ll, [-rot[0], -rot[1]]) > Math.PI / 2) return null;
      for (const f of world) {
        const b = f.b;
        if (b) {
          const [[x0, y0], [x1, y1]] = b;
          if (ll[1] < y0 - .5 || ll[1] > y1 + .5) continue;
          if (x0 <= x1 && (ll[0] < x0 - .5 || ll[0] > x1 + .5)) continue;
        }
        if (d3.geoContains(f, ll)) return f;
      }
      return null;
    }
    function nameOf(id) { const d = byIso.get(String(id)); if (d) return d.name; const n = names[String(id)]; return n ? n.he : ''; }

    // ---- interaction ----
    let drag = null, vel = [0, 0];
    canvas.addEventListener('pointerdown', e => {
      canvas.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), r0: rot.slice() };
      vel = [0, 0]; moving = true; lastInteract = performance.now(); cancelAnim();
      canvas.classList.add('dragging');
    });
    const pointers = new Map(); let pinch0 = null;
    canvas.addEventListener('pointerdown', e => { pointers.set(e.pointerId, e); if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch0 = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), z: zoom }; } });
    canvas.addEventListener('pointermove', e => {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, e);
      if (pinch0 && pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        zoom = Math.max(1, Math.min(6, pinch0.z * Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) / pinch0.d));
        draw(); return;
      }
      if (drag) {
        const k = 0.25 / zoom;
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        rot[0] += dx * k; rot[1] = Math.max(-80, Math.min(80, rot[1] - dy * k));
        const now = performance.now(), dt = Math.max(8, now - drag.t);
        vel = [dx * k / dt * 16, -dy * k / dt * 16];
        drag.x = e.clientX; drag.y = e.clientY; drag.t = now;
        lastInteract = now; draw(); hideTip(); return;
      }
      const rect = canvas.getBoundingClientRect();
      const f = featureAt(e.clientX - rect.left, e.clientY - rect.top);
      if (f !== hoverF) { hoverF = f; draw(); }
      if (f) showTip(e.clientX - rect.left, e.clientY - rect.top, f); else hideTip();
      canvas.style.cursor = f ? 'pointer' : 'grab';
    });
    function endDrag(e) {
      pointers.delete(e.pointerId); if (pointers.size < 2) pinch0 = null;
      if (!drag) return;
      const moved = Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy);
      drag = null; canvas.classList.remove('dragging');
      if (moved < 6 && e.type === 'pointerup') {
        const rect = canvas.getBoundingClientRect();
        const f = featureAt(e.clientX - rect.left, e.clientY - rect.top);
        if (f) select(f, false);
        moving = false; draw(); return;
      }
      // inertia
      const step = () => {
        if (drag || (Math.abs(vel[0]) < 0.01 && Math.abs(vel[1]) < 0.01)) { moving = false; draw(); return; }
        rot[0] += vel[0]; rot[1] = Math.max(-80, Math.min(80, rot[1] + vel[1]));
        vel[0] *= 0.94; vel[1] *= 0.94; lastInteract = performance.now(); draw(); requestAnimationFrame(step);
      };
      reduce ? (moving = false, draw()) : requestAnimationFrame(step);
    }
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('pointerleave', () => { if (!drag) { hoverF = null; hideTip(); draw(); } });
    canvas.addEventListener('wheel', e => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault(); zoom = Math.max(1, Math.min(6, zoom * Math.exp(-e.deltaY * 0.002))); lastInteract = performance.now(); draw();
    }, { passive: false });
    host.querySelectorAll('[data-zoom]').forEach(b => b.addEventListener('click', () => {
      flyTo([-rot[0], -rot[1]], Math.max(1, Math.min(6, zoom * (b.dataset.zoom === 'in' ? 1.6 : 1 / 1.6))));
    }));
    canvas.addEventListener('keydown', e => {
      const k = { ArrowLeft: [-6, 0], ArrowRight: [6, 0], ArrowUp: [0, 6], ArrowDown: [0, -6] }[e.key];
      if (k) { e.preventDefault(); rot[0] += k[0]; rot[1] = Math.max(-80, Math.min(80, rot[1] + k[1])); lastInteract = performance.now(); draw(); }
    });

    function showTip(x, y, f) {
      const d = byIso.get(String(f.id));
      tip.innerHTML = '';
      tip.append(nameOf(f.id));
      const s = document.createElement('small');
      s.textContent = d ? (d.count + ' מדריכים · לחצו לפתיחה') : 'עוד אין לנו מדריך לכאן';
      tip.append(s);
      tip.style.left = x + 'px'; tip.style.top = y + 'px'; tip.classList.add('show');
    }
    function hideTip() { tip.classList.remove('show'); }

    // ---- fly ----
    function cancelAnim() { if (anim) { cancelAnimationFrame(anim.raf); anim = null; } }
    function flyTo(lonlat, z) {
      cancelAnim();
      const r0 = rot.slice(), r1 = [-lonlat[0], -lonlat[1], 0];
      let dl = ((r1[0] - r0[0]) % 360 + 540) % 360 - 180; // shortest way round
      const z0 = zoom, z1 = z || zoom;
      if (reduce) { rot = [r0[0] + dl, r1[1], 0]; zoom = z1; draw(); return; }
      const t0 = performance.now(), dur = 1300;
      const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      anim = {};
      const tick = now => {
        const k = Math.min(1, (now - t0) / dur), e = ease(k);
        rot = [r0[0] + dl * e, r0[1] + (r1[1] - r0[1]) * e, 0];
        const hop = Math.sin(Math.PI * k) * 0.18 * Math.min(1, Math.abs(dl) / 90);
        zoom = z0 + (z1 - z0) * e - hop * zoom;
        moving = k < 1; draw();
        if (k < 1) anim.raf = requestAnimationFrame(tick); else { anim = null; moving = false; draw(); }
      };
      anim.raf = requestAnimationFrame(tick);
      lastInteract = performance.now();
    }

    function zoomFor(f) {
      const [[x0, y0], [x1, y1]] = f.b || d3.geoBounds(f);
      let span = Math.max(Math.abs(y1 - y0), Math.abs(((x1 - x0) + 360) % 360));
      if (span > 180) span = 40;
      return Math.max(1.2, Math.min(5.5, 70 / Math.max(span, 6)));
    }

    function select(f, fromSearch) {
      pickF = f;
      const d = byIso.get(String(f.id));
      const at = d ? d.at : d3.geoCentroid(f);
      flyTo(at, d ? d.zoom : zoomFor(f));
      openCard(f, d);
    }

    function openCard(f, d) {
      if (!card) return;
      const img = card.querySelector('img'), h = card.querySelector('h3'), p = card.querySelector('p'), a = card.querySelector('a');
      card.classList.toggle('empty', !d);
      if (d) {
        img.hidden = !d.photo; if (d.photo) { img.src = d.photo; img.alt = d.name; }
        h.textContent = d.name; p.textContent = d.tagline;
        a.textContent = d.count + ' מדריכים ל' + d.name + ' ←'; a.href = d.url; a.hidden = false;
      } else {
        h.textContent = nameOf(f.id);
        p.textContent = 'עוד לא כתבנו על היעד הזה. אנחנו מוסיפים יעדים כל הזמן, ובינתיים יש מה לקרוא על היעדים המסומנים בכתום.';
        a.textContent = 'לכל היעדים ←'; a.href = BASE + 'destinations/'; a.hidden = false;
      }
      card.classList.add('show');
    }
    card && card.querySelector('.gc-x').addEventListener('click', () => { card.classList.remove('show'); pickF = null; draw(); });

    // ---- chips ----
    document.querySelectorAll('[data-fly]').forEach(b => b.addEventListener('click', e => {
      e.preventDefault();
      const f = world.find(x => String(x.id) === b.dataset.fly);
      if (f) select(f, false);
      document.querySelectorAll('[data-fly]').forEach(x => x.classList.toggle('on', x === b));
    }));

    // ---- search ----
    const input = document.getElementById('globe-q'), list = document.getElementById('globe-suggest');
    if (input && list) {
      const norm = s => (s || '').toLowerCase().replace(/[֑-ׇ'"׳״\-\s.]/g, '');
      const index = [];
      for (const [id, n] of Object.entries(names)) {
        const d = byIso.get(id);
        const keys = [n.he, n.en, ...(n.alias || []), d && d.name, d && d.en].filter(Boolean);
        index.push({ id, label: d ? d.name : n.he, sub: n.en, keys: keys.map(norm), has: !!d });
      }
      for (const a of AREAS) {
        index.push({ id: a.iso, label: a.name, sub: a.dest, keys: [norm(a.name), norm(a.en)], has: true, area: true });
      }
      let items = [], sel = -1;
      const render = () => {
        list.innerHTML = '';
        items.forEach((it, i) => {
          const li = document.createElement('li');
          li.setAttribute('role', 'option'); li.setAttribute('aria-selected', String(i === sel));
          if (it.has) li.className = 'has';
          const b = document.createElement('b'); b.textContent = it.label;
          const s = document.createElement('small'); s.textContent = it.has ? (it.area ? it.sub : 'יש מדריכים') : it.sub;
          li.append(b, s);
          li.addEventListener('mousedown', ev => { ev.preventDefault(); choose(it); });
          list.append(li);
        });
        list.classList.toggle('open', items.length > 0);
        input.setAttribute('aria-expanded', String(items.length > 0));
      };
      const choose = it => {
        const f = world.find(x => String(x.id) === String(it.id));
        input.value = it.label; items = []; render();
        if (f) select(f, true);
      };
      input.addEventListener('input', () => {
        const q = norm(input.value);
        if (!q) { items = []; render(); return; }
        items = index.map(it => {
          let s = 0;
          for (const k of it.keys) { if (k === q) s = Math.max(s, 3); else if (k.startsWith(q)) s = Math.max(s, 2); else if (k.includes(q)) s = Math.max(s, 1); }
          return [s + (it.has ? 0.5 : 0) + (it.area ? 0.2 : 0), it];
        }).filter(x => x[0] >= 1).sort((a, b) => b[0] - a[0]).slice(0, 8).map(x => x[1]);
        sel = items.length ? 0 : -1; render();
      });
      input.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown') { sel = Math.min(items.length - 1, sel + 1); render(); e.preventDefault(); }
        else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); render(); e.preventDefault(); }
        else if (e.key === 'Enter' && items[sel]) { choose(items[sel]); e.preventDefault(); }
        else if (e.key === 'Escape') { items = []; render(); }
      });
      input.addEventListener('blur', () => setTimeout(() => { items = []; render(); }, 120));
    }

    new ResizeObserver(size).observe(host);
    size(); requestAnimationFrame(loop);
    host.classList.add('ready');
  }

  // ---- small locator globe on destination pages ----
  async function locator() {
    const el = document.querySelector('.locator[data-iso]');
    if (!el) return;
    const canvas = el.querySelector('canvas'), ctx = canvas.getContext('2d');
    const t = await loadJSON(BASE + 'data/countries-110m.json');
    const feats = topojson.feature(t, t.objects.countries).features;
    const iso = el.dataset.iso, at = JSON.parse(el.dataset.at);
    const me = feats.find(f => String(f.id) === iso);
    const dpr = Math.min(devicePixelRatio || 1, 2), W = el.clientWidth;
    canvas.width = W * dpr; canvas.height = W * dpr;
    ctx.scale(dpr, dpr);
    const proj = d3.geoOrthographic().translate([W / 2, W / 2]).scale(W / 2 * .92).rotate([-at[0], -at[1]]).clipAngle(90);
    const path = d3.geoPath(proj, ctx);
    ctx.beginPath(); path({ type: 'Sphere' }); ctx.fillStyle = '#e4dccb'; ctx.fill();
    ctx.beginPath(); path(d3.geoGraticule10()); ctx.strokeStyle = 'rgba(21,23,28,.06)'; ctx.stroke();
    ctx.beginPath(); for (const f of feats) path(f); ctx.fillStyle = '#c9bea8'; ctx.fill();
    ctx.beginPath(); path(topojson.mesh(t, t.objects.countries, (a, b) => a !== b)); ctx.strokeStyle = '#f4efe6'; ctx.lineWidth = .6; ctx.stroke();
    if (me) { ctx.beginPath(); path(me); ctx.fillStyle = '#e2552c'; ctx.fill(); }
    const p = proj(at);
    if (p) { ctx.beginPath(); ctx.arc(p[0], p[1], 4, 0, 7); ctx.fillStyle = '#15171c'; ctx.fill(); ctx.beginPath(); ctx.arc(p[0], p[1], 9, 0, 7); ctx.strokeStyle = '#15171c'; ctx.lineWidth = 1.2; ctx.stroke(); }
    ctx.beginPath(); path({ type: 'Sphere' }); ctx.strokeStyle = 'rgba(21,23,28,.25)'; ctx.stroke();
  }

  function common() {
    const btn = document.querySelector('.menu-btn'), nav = document.querySelector('.nav');
    if (btn && nav) btn.addEventListener('click', () => { const o = nav.classList.toggle('open'); btn.setAttribute('aria-expanded', String(o)); });
    const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' }) : null;
    document.querySelectorAll('.rv').forEach(el => io ? io.observe(el) : el.classList.add('in'));
    const head = document.querySelector('.site-head[data-dark]');
    if (head) {
      const hero = document.querySelector('.hero, .dhero');
      const upd = () => head.classList.toggle('on-dark', !!hero && hero.getBoundingClientRect().bottom > 70);
      addEventListener('scroll', upd, { passive: true }); upd();
    }
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

  document.addEventListener('DOMContentLoaded', () => { common(); boot(); locator(); });
})();
