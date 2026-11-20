// `flowdiag` appends this file to a temporary copy of a diagram and reads the JSON that replaces <body> via --dump-dom.
'use strict';

const HEAD = 8, LINE = 1.5;

function flowdiagRun(mode, opts) {
  const ready = document.fonts ? document.fonts.ready : Promise.resolve();
  ready.then(() => {
    let out;
    try {
      out = {check, nojs, measure}[mode](opts || {});
    } catch (e) {
      out = {error: String((e && e.stack) || e)};
    }
    document.body.textContent = JSON.stringify(out);
  });
}

function measure() {
  const d = document.documentElement;
  return {width: d.scrollWidth, height: d.scrollHeight};
}

function sectionName(dg) {
  for (let el = dg; el; el = el.parentElement) {
    for (let p = el.previousElementSibling; p; p = p.previousElementSibling) {
      if (/^H[1-6]$/.test(p.tagName)) return p.textContent.trim();
    }
  }
  return 'схема';
}

function name(el) {
  return el.id ? '#' + el.id : '«' + el.textContent.trim().slice(0, 40) + '»';
}

function items(dg) {
  return [...dg.children].filter((el) => el.tagName.toLowerCase() !== 'svg' && el.getClientRects().length);
}

function overlap(a, b, t) {
  return Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > t &&
    Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > t;
}

function crosses(p, q, r) {
  if (p[1] === q[1]) {
    const y = p[1];
    return y > r.y + 1 && y < r.y + r.h - 1 &&
      Math.min(Math.max(p[0], q[0]), r.x + r.w) - Math.max(Math.min(p[0], q[0]), r.x) > 1;
  }
  const x = p[0];
  return x > r.x + 1 && x < r.x + r.w - 1 &&
    Math.min(Math.max(p[1], q[1]), r.y + r.h) - Math.max(Math.min(p[1], q[1]), r.y) > 1;
}

function palettes() {
  const found = {};
  for (const sheet of document.styleSheets) {
    for (const rule of sheet.cssRules) {
      const sel = (rule.selectorText || '').replace(/\s|"|'/g, '');
      if (sel === ':root') found.light = rule.style.cssText;
      if (sel === ':root[data-theme=dark]') found.dark = rule.style.cssText;
    }
  }
  return found;
}

function routes(dg, problems) {
  const F = window.flowDiagram, o = dg.getBoundingClientRect(), where = sectionName(dg), list = [];
  for (const e of F.edges(dg)) {
    const tag = `стрелка ${e.from}>${e.to}`;
    const A = document.getElementById(e.from), B = document.getElementById(e.to);
    if (!A || !B) {
      problems.push(`${where}: ${tag}: нет блока #${A ? e.to : e.from}`);
      continue;
    }
    if (A.parentElement !== dg || B.parentElement !== dg) {
      problems.push(`${where}: ${tag}: блок из другой схемы`);
      continue;
    }
    const a = F.box(A, o), b = F.box(B, o);
    if (overlap(a, b, 0)) {
      problems.push(`${where}: ${tag}: блоки касаются, стрелке нет места`);
      continue;
    }
    list.push(Object.assign(F.route(a, b, o.width), {A, B, tag, label: e.label}));
  }
  return list;
}

function inspect(root) {
  const F = window.flowDiagram;
  if (!F) throw new Error('нет window.flowDiagram: скрипт из template.html удалён или изменён');
  F.draw();
  const problems = [], stats = {diagrams: 0, blocks: 0, edges: 0};
  const seen = {};
  root.querySelectorAll('[id]').forEach((el) => { seen[el.id] = (seen[el.id] || 0) + 1; });
  for (const id in seen) if (seen[id] > 1) problems.push(`id «${id}» повторяется: ${seen[id]}`);
  for (const t of ['light', 'dark']) {
    if (!root.querySelector(`.theme-switch [data-set-theme="${t}"]`)) problems.push(`нет кнопки темы «${t}» в .theme-switch`);
  }
  const pal = palettes();
  if (!pal.light || !pal.dark) problems.push('нет палитры в правилах :root и :root[data-theme="dark"]');

  for (const dg of root.querySelectorAll('.dg')) {
    const where = sectionName(dg), o = dg.getBoundingClientRect();
    const its = items(dg).map((el) => ({el, r: F.box(el, o)}));
    stats.diagrams++;
    stats.blocks += its.filter((i) => i.el.classList.contains('bx')).length;

    its.forEach((a, i) => {
      if (a.el.scrollWidth > a.el.clientWidth + 1) problems.push(`${where}: содержимое ${name(a.el)} шире блока`);
      its.slice(i + 1).forEach((b) => {
        if (overlap(a.r, b.r, 1)) problems.push(`${where}: ${name(a.el)} перекрывает ${name(b.el)}`);
      });
    });

    for (const r of routes(dg, problems)) {
      stats.edges++;
      for (let k = 0; k + 1 < r.pts.length; k++) {
        const p = r.pts[k], q = r.pts[k + 1];
        for (const it of its) {
          if (it.el !== r.A && it.el !== r.B && crosses(p, q, it.r)) problems.push(`${where}: ${r.tag} проходит через ${name(it.el)}`);
        }
      }
      const p = r.pts[r.pts.length - 2], q = r.pts[r.pts.length - 1];
      if (Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) < 12) problems.push(`${where}: ${r.tag} короче 12 px, наконечник не виден`);
    }

    const svg = dg.querySelector(':scope > svg.wires');
    const labels = svg ? [...svg.querySelectorAll('text')].map((t) => ({t: t.textContent, r: F.box(t, o)})) : [];
    labels.forEach((l, i) => {
      for (const it of its) if (overlap(l.r, it.r, 0.5)) problems.push(`${where}: подпись «${l.t}» заходит на ${name(it.el)}`);
      for (const m of labels.slice(i + 1)) if (overlap(l.r, m.r, 0.5)) problems.push(`${where}: подписи «${l.t}» и «${m.t}» перекрываются`);
    });
  }
  return {problems, stats};
}

function check() {
  const res = inspect(document);
  const d = document.documentElement;
  if (d.scrollWidth > window.innerWidth + 1) res.problems.push(`страница шире окна: ${d.scrollWidth} px при ${window.innerWidth} px`);
  res.stats.height = d.scrollHeight;
  return res;
}

const px = (v) => Math.round(v * 100) / 100 + 'px';

function put(dg, tag, cls, box, text) {
  const el = document.createElement(tag);
  el.className = cls;
  el.setAttribute('style', Object.entries(box).map(([k, v]) => `${k}: ${px(v)}`).join('; '));
  if (text) el.textContent = text;
  dg.appendChild(el);
  return el;
}

function staticEdge(dg, r) {
  const pts = r.pts.map((p) => p.slice()), n = pts.length;
  const [sx, sy] = pts[n - 2], [tx, ty] = pts[n - 1];
  const dir = tx > sx ? 'r' : tx < sx ? 'l' : ty > sy ? 'd' : 'u';
  const back = {r: [-1, 0], l: [1, 0], d: [0, -1], u: [0, 1]}[dir];
  pts[n - 1] = [tx + back[0] * (HEAD - 1), ty + back[1] * (HEAD - 1)];
  for (let k = 0; k + 1 < n; k++) {
    const [x1, y1] = pts[k], [x2, y2] = pts[k + 1];
    put(dg, 'div', 'edge-line', {
      left: Math.min(x1, x2) - LINE / 2, top: Math.min(y1, y2) - LINE / 2,
      width: Math.abs(x2 - x1) + LINE, height: Math.abs(y2 - y1) + LINE,
    });
  }
  const at = {d: [tx - HEAD / 2, ty - HEAD], u: [tx - HEAD / 2, ty], r: [tx - HEAD, ty - HEAD / 2], l: [tx, ty - HEAD / 2]}[dir];
  put(dg, 'span', 'edge-head ' + dir, {left: at[0], top: at[1]});
  if (!r.label) return;
  const s = put(dg, 'span', 'edge-label', {left: 0, top: r.ly - 11.5}, r.label);
  const w = s.offsetWidth, shift = r.anchor === 'middle' ? w / 2 : r.anchor === 'end' ? w : 0;
  s.style.left = px(r.lx - shift);
}

// The default sanitizer of @diplodoc/html-extension 2.9.7 drops @media and color-scheme but keeps radio inputs, label[for] and `#id:checked ~ .x`.
function staticCss(width, pal) {
  const w = 'var(--wire)';
  return [
    'body{padding:0;background:none}',
    '.static-frame{--sans:Arial,sans-serif;--mono:"Courier New",monospace}',
    '.theme-radio{display:none}',
    `.theme-root{${pal.light}padding:24px;background:var(--bg);color:var(--fg);font:14px/1.55 var(--sans);overflow-x:auto}`,
    `#fd-dark:checked~.theme-root{${pal.dark}}`,
    `@media (prefers-color-scheme: dark){.theme-root{${pal.dark}}#fd-light:checked~.theme-root{${pal.light}}}`,
    `.theme-root .wrap{width:${width}px;max-width:none;margin:0 auto}`,
    '.edge-line{position:absolute;background:var(--wire);pointer-events:none}',
    '.edge-head{position:absolute;width:0;height:0;border-style:solid;border-color:transparent;pointer-events:none}',
    `.edge-head.d{border-width:${HEAD}px ${HEAD / 2}px 0;border-top-color:${w}}`,
    `.edge-head.u{border-width:0 ${HEAD / 2}px ${HEAD}px;border-bottom-color:${w}}`,
    `.edge-head.r{border-width:${HEAD / 2}px 0 ${HEAD / 2}px ${HEAD}px;border-left-color:${w}}`,
    `.edge-head.l{border-width:${HEAD / 2}px ${HEAD}px ${HEAD / 2}px 0;border-right-color:${w}}`,
    '.edge-label{position:absolute;font:11px/14px var(--sans);color:var(--muted);background:var(--bg);white-space:nowrap;pointer-events:none}',
  ].join('\n');
}

function nojs(opts) {
  const width = opts.width || 1040, pal = palettes();
  if (!pal.light || !pal.dark) throw new Error('нет палитры в правилах :root и :root[data-theme="dark"]');
  const extra = staticCss(width, pal);
  const css = [...document.querySelectorAll('style')].map((s) => s.textContent.trim()).concat(extra).join('\n');
  const style = document.createElement('style');
  style.textContent = extra;
  document.head.appendChild(style);

  const frame = document.createElement('div'), themeRoot = document.createElement('div');
  frame.className = 'static-frame';
  themeRoot.className = 'theme-root';
  for (const t of ['light', 'dark']) {
    const input = document.createElement('input');
    Object.assign(input, {type: 'radio', name: 'fd-theme', id: 'fd-' + t, className: 'theme-radio'});
    frame.appendChild(input);
  }
  frame.appendChild(themeRoot);
  for (const n of [...document.body.childNodes]) if (n.nodeName !== 'SCRIPT') themeRoot.appendChild(n);
  document.body.appendChild(frame);

  const res = inspect(themeRoot);
  const plan = [...themeRoot.querySelectorAll('.dg')].map((dg) => {
    const o = dg.getBoundingClientRect();
    return {dg, w: o.width, h: o.height, its: items(dg).map((el) => ({el, r: window.flowDiagram.box(el, o)})), rs: routes(dg, [])};
  });
  themeRoot.querySelectorAll('svg.wires').forEach((s) => s.remove());
  themeRoot.querySelectorAll('.theme-switch [data-set-theme]').forEach((b) => {
    const label = document.createElement('label');
    label.htmlFor = 'fd-' + b.getAttribute('data-set-theme');
    label.textContent = b.textContent;
    b.replaceWith(label);
  });

  let blocks = 0;
  for (const {dg, w, h, its, rs} of plan) {
    dg.setAttribute('style', `display: block; position: relative; width: ${px(w)}; height: ${px(h)}`);
    for (const {el, r} of its) {
      ['grid-column', 'grid-row', 'grid-area', 'align-self', 'justify-self'].forEach((p) => el.style.removeProperty(p));
      Object.assign(el.style, {position: 'absolute', boxSizing: 'border-box', left: px(r.x), top: px(r.y), width: px(r.w), height: px(r.h), margin: '0'});
      if (el.classList.contains('bx')) blocks++;
    }
    for (const r of rs) staticEdge(dg, r);
  }
  document.querySelectorAll('script').forEach((s) => s.remove());
  const count = (sel) => frame.querySelectorAll(sel).length;
  const stats = {
    diagrams: plan.length, blocks, lines: count('.edge-line'), heads: count('.edge-head'),
    labels: count('.edge-label'), height: frame.offsetHeight,
  };
  return {html: `<style>\n${css}\n</style>\n${frame.outerHTML}\n`, problems: res.problems, stats};
}
