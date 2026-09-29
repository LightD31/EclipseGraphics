/* Theme: colours, fonts and shapes, as CSS custom properties on the output
   page's root — every graphic draws with var(--c-accent), var(--f-head)…,
   so changing the theme restyles everything at once, live.

   show.theme = {
     preset: 'direct',                 the preset it started from (informative)
     colors: { accent, onAccent, base, base2, onBase, surface, onSurface, highlight, live },
     fonts:  { head: { family, weight, upper, tracking, width },   headlines, names, titles
               text: { family, weight, strong },                  labels, body text
               num:  { family, weight } },                        timers, clocks, figures
     shape:  { scale, radius, shadow, gloss } }

   Derived tones (translucent panels, muted text, hairlines) are computed here
   rather than with color-mix(), which older OBS builds (CEF < 111) lack. */
(function () {
  'use strict';

  /* Bundled fonts (engine/fonts/fonts.css). tnum: tabular figures, so a
     timer set in it doesn't jitter; width: the range font-stretch can take. */
  var FONTS = [
    { family: 'Barlow Condensed', label: 'Barlow Condensed', weights: [400, 500, 600, 700, 800, 900], tnum: true, note: 'condensée, la police par défaut' },
    { family: 'Archivo', label: 'Archivo (largeur variable)', weights: [100, 900], tnum: true, width: [62, 125] },
    { family: 'Saira', label: 'Saira (largeur variable)', weights: [100, 900], tnum: true, width: [50, 125] },
    { family: 'Oswald', label: 'Oswald', weights: [200, 700], tnum: false, note: 'chiffres proportionnels : à éviter pour les minuteurs' },
    { family: 'Bebas Neue', label: 'Bebas Neue', weights: [400], tnum: true, note: 'capitales uniquement, un seul poids' },
    { family: 'Inter', label: 'Inter', weights: [100, 900], tnum: true },
    { family: 'JetBrains Mono', label: 'JetBrains Mono', weights: [100, 800], tnum: true, note: 'chasse fixe' }
  ];
  var FALLBACK = "'Arial Narrow', 'Helvetica Neue Condensed', 'Segoe UI', Arial, sans-serif";

  var TOKENS = [
    ['accent', 'Accent', 'bandeau du titre, flashs, pastilles'],
    ['onAccent', 'Texte sur l\'accent', ''],
    ['base', 'Fond', 'bandeau d\'info, panneaux, cartes'],
    ['base2', 'Fond secondaire', 'horloge, piste de progression'],
    ['onBase', 'Texte sur le fond', ''],
    ['surface', 'Bande claire', 'bande d\'info blanche, fonctions'],
    ['onSurface', 'Texte sur la bande claire', ''],
    ['highlight', 'Accent sur la bande claire', 'lieu, mots mis en avant'],
    ['live', 'Direct', 'pastille « en direct »']
  ];

  /* Presets. "Direct" is the default: the identity the eclipse and A350F
     overlays share (red headline band, navy ticker, white strap), with a
     real condensed font instead of the Arial Narrow fallback and the navy
     taken a touch deeper for contrast under the red. "Classique" is that
     identity exactly as it was. */
  var PRESETS = {
    direct: {
      label: 'Direct', desc: 'Rouge, bleu nuit, blanc — l\'identité maison, affinée',
      colors: { accent: '#E1000F', onAccent: '#FFFFFF', base: '#0E1538', base2: '#1C2656', onBase: '#FFFFFF',
                surface: '#FFFFFF', onSurface: '#0B0F1E', highlight: '#2A5BD7', live: '#E1000F' },
      fonts: { head: { family: 'Barlow Condensed', weight: 800, upper: true, tracking: -0.3 },
               text: { family: 'Barlow Condensed', weight: 500, strong: 800 },
               num: { family: 'Barlow Condensed', weight: 700 } },
      shape: { scale: 1, radius: 0, shadow: 0.3, gloss: 0 }
    },
    classique: {
      label: 'Classique', desc: 'Les habillages éclipse et A350F tels quels (Univers Next si installée)',
      colors: { accent: '#E1000F', onAccent: '#FFFFFF', base: '#10173A', base2: '#1B2450', onBase: '#FFFFFF',
                surface: '#FFFFFF', onSurface: '#111111', highlight: '#2857C8', live: '#E1000F' },
      fonts: { head: { family: 'Univers Next', weight: 900, upper: true, tracking: -0.5 },
               text: { family: 'Univers Next', weight: 400, strong: 900 },
               num: { family: 'Univers Next', weight: 900 } },
      shape: { scale: 1, radius: 0, shadow: 0, gloss: 0 }
    },
    nuit: {
      label: 'Nuit', desc: 'Noir profond et ambre, pour les directs du soir',
      colors: { accent: '#F2A900', onAccent: '#111111', base: '#0B0B10', base2: '#1C1C26', onBase: '#F5F2EA',
                surface: '#F5F2EA', onSurface: '#111111', highlight: '#A66A00', live: '#FF4D2E' },
      fonts: { head: { family: 'Oswald', weight: 600, upper: true, tracking: 0.5 },
               text: { family: 'Barlow Condensed', weight: 500, strong: 700 },
               num: { family: 'Barlow Condensed', weight: 700 } },
      shape: { scale: 1, radius: 2, shadow: 0.45, gloss: 0 }
    },
    sport: {
      label: 'Sport', desc: 'Jaune et noir, capitales serrées',
      colors: { accent: '#FFD400', onAccent: '#0A0A0A', base: '#0A0A0A', base2: '#232323', onBase: '#FFFFFF',
                surface: '#FFFFFF', onSurface: '#0A0A0A', highlight: '#0050E6', live: '#FF2A2A' },
      fonts: { head: { family: 'Bebas Neue', weight: 400, upper: true, tracking: 1 },
               text: { family: 'Barlow Condensed', weight: 600, strong: 800 },
               num: { family: 'Barlow Condensed', weight: 800 } },
      shape: { scale: 1.05, radius: 0, shadow: 0.4, gloss: 0 }
    },
    info: {
      label: 'Info', desc: 'Bleu franc et blanc, style chaîne d\'info',
      colors: { accent: '#0046C8', onAccent: '#FFFFFF', base: '#0A1633', base2: '#15264D', onBase: '#FFFFFF',
                surface: '#FFFFFF', onSurface: '#0A1633', highlight: '#E1000F', live: '#E1000F' },
      fonts: { head: { family: 'Archivo', weight: 800, upper: true, tracking: -0.3, width: 75 },
               text: { family: 'Archivo', weight: 500, strong: 700, width: 85 },
               num: { family: 'Archivo', weight: 700, width: 85 } },
      shape: { scale: 1, radius: 0, shadow: 0.25, gloss: 0 }
    },
    minimal: {
      label: 'Épuré', desc: 'Blanc cassé et graphite, coins arrondis, sans capitales',
      colors: { accent: '#16181D', onAccent: '#FFFFFF', base: '#FFFFFF', base2: '#EEF0F3', onBase: '#16181D',
                surface: '#16181D', onSurface: '#FFFFFF', highlight: '#9CC2FF', live: '#E5484D' },
      fonts: { head: { family: 'Inter', weight: 700, upper: false, tracking: -0.6 },
               text: { family: 'Inter', weight: 450, strong: 650 },
               num: { family: 'Inter', weight: 600 } },
      shape: { scale: 0.95, radius: 10, shadow: 0.2, gloss: 0 }
    },
    neon: {
      label: 'Néon', desc: 'Bleu électrique et magenta sur nuit, pour la tech',
      colors: { accent: '#00D1FF', onAccent: '#001018', base: '#070B1A', base2: '#121A36', onBase: '#E8F6FF',
                surface: '#141D3D', onSurface: '#E8F6FF', highlight: '#FF3EA5', live: '#FF3EA5' },
      fonts: { head: { family: 'Saira', weight: 700, upper: true, tracking: 1, width: 80 },
               text: { family: 'Saira', weight: 400, strong: 600, width: 90 },
               num: { family: 'JetBrains Mono', weight: 600 } },
      shape: { scale: 1, radius: 4, shadow: 0.5, gloss: 0.15 }
    },
    ambre: {
      label: 'Ambre', desc: 'Les tons dorés du petit bandeau de l\'éclipse',
      colors: { accent: '#FFB347', onAccent: '#1A1206', base: '#0C0E1A', base2: '#1B1D2E', onBase: '#F5EFE2',
                surface: '#F5EFE2', onSurface: '#1A1206', highlight: '#B86B00', live: '#FF7D4D' },
      fonts: { head: { family: 'Barlow Condensed', weight: 700, upper: true, tracking: 2 },
               text: { family: 'Inter', weight: 450, strong: 650 },
               num: { family: 'JetBrains Mono', weight: 700 } },
      shape: { scale: 1, radius: 14, shadow: 0.5, gloss: 0.1 }
    }
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  /* The theme with every gap filled from its preset (or Direct) */
  function resolve(theme) {
    theme = theme || {};
    var base = clone(PRESETS[theme.preset] || PRESETS.direct);
    var out = { preset: theme.preset || 'direct', colors: {}, fonts: {}, shape: {} };
    ['colors', 'shape'].forEach(function (k) { out[k] = Object.assign(base[k], theme[k] || {}); });
    ['head', 'text', 'num'].forEach(function (r) { out.fonts[r] = Object.assign(base.fonts[r], (theme.fonts || {})[r] || {}); });
    return out;
  }
  function rgb(hex) {
    var m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || '').trim());
    if (!m) return [255, 255, 255];
    var h = m[1].length === 3 ? m[1].replace(/./g, '$&$&') : m[1];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function rgba(hex, a) { var c = rgb(hex); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function mix(hexA, hexB, t) {
    var a = rgb(hexA), b = rgb(hexB);
    return '#' + a.map(function (v, i) { return Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0'); }).join('');
  }
  function stack(family) {
    family = String(family || '').replace(/['"]/g, '').trim();
    if (family === 'Univers Next') return "'Univers Next', 'Univers Next Pro', 'UniversNext', 'Univers Next W1G', " + FALLBACK;
    return (family ? "'" + family + "', " : '') + FALLBACK;
  }
  /* Every custom property the graphics use */
  function vars(theme) {
    var t = resolve(theme), c = t.colors, f = t.fonts, s = t.shape, v = {};
    for (var k in c) v['--c-' + k] = c[k];
    // translucent panels (the fullscreen column, the corner card) and tones
    v['--c-base-88'] = rgba(c.base, 0.88);
    v['--c-base-95'] = rgba(c.base, 0.95);
    v['--c-base-fade'] = rgba(c.base, 0);
    v['--c-onBase-72'] = rgba(c.onBase, 0.72);
    v['--c-onBase-62'] = rgba(c.onBase, 0.62);
    v['--c-onBase-55'] = rgba(c.onBase, 0.55);
    v['--c-onBase-22'] = rgba(c.onBase, 0.22);
    v['--c-onBase-12'] = rgba(c.onBase, 0.12);
    v['--c-onSurface-60'] = rgba(c.onSurface, 0.6);
    v['--c-onAccent-28'] = rgba(c.onAccent, 0.28);
    v['--c-accent-deep'] = mix(c.accent, '#000000', 0.18);
    v['--c-live-idle'] = mix(c.onSurface, c.surface, 0.5);
    v['--f-head'] = stack(f.head.family);
    v['--f-text'] = stack(f.text.family);
    v['--f-num'] = stack(f.num.family);
    v['--w-head'] = String(f.head.weight || 800);
    v['--w-text'] = String(f.text.weight || 500);
    v['--w-strong'] = String(f.text.strong || 800);
    v['--w-num'] = String(f.num.weight || 700);
    v['--tt-head'] = f.head.upper === false ? 'none' : 'uppercase';
    v['--ls-head'] = (+f.head.tracking || 0) + 'px';
    v['--fs-head'] = f.head.width ? f.head.width + '%' : 'normal';
    v['--fs-text'] = f.text.width ? f.text.width + '%' : 'normal';
    v['--fs-num'] = f.num.width ? f.num.width + '%' : 'normal';
    v['--s'] = String(Math.max(0.5, Math.min(2, +s.scale || 1)));
    v['--radius'] = (Math.max(0, +s.radius || 0)) + 'px';
    var sh = Math.max(0, Math.min(1, +s.shadow || 0));
    v['--shadow'] = sh ? '0 ' + Math.round(4 + 10 * sh) + 'px ' + Math.round(14 + 30 * sh) + 'px rgba(0,0,0,' + (0.15 + 0.5 * sh).toFixed(2) + ')' : 'none';
    var gl = Math.max(0, Math.min(1, +s.gloss || 0));
    v['--gloss'] = gl ? 'linear-gradient(180deg, rgba(255,255,255,' + (0.22 * gl).toFixed(3) + '), rgba(255,255,255,0) 55%, rgba(0,0,0,' + (0.18 * gl).toFixed(3) + '))' : 'none';
    return v;
  }
  function apply(theme, el) {
    el = el || document.documentElement;
    var v = vars(theme);
    for (var k in v) el.style.setProperty(k, v[k]);
  }
  /* Fonts uploaded from the panel (media/*.woff2…): an @font-face each, the
     family being the file name without its extension */
  function fontFamilyOf(name) { return String(name).replace(/\.(woff2?|ttf|otf)$/i, '').replace(/[-_]+/g, ' '); }
  function uploadedFaces(media, base) {
    return (media || []).filter(function (m) { return m.kind === 'font'; }).map(function (m) {
      var fmt = /\.woff2$/i.test(m.name) ? 'woff2' : /\.woff$/i.test(m.name) ? 'woff' : /\.otf$/i.test(m.name) ? 'opentype' : 'truetype';
      return "@font-face { font-family: '" + fontFamilyOf(m.name).replace(/'/g, '') + "'; src: url('" + (base || '') + m.url + "') format('" + fmt + "'); font-display: block; }";
    }).join('\n');
  }
  function useUploaded(media, base) {
    var st = document.getElementById('gfx-uploaded-fonts');
    if (!st) { st = document.createElement('style'); st.id = 'gfx-uploaded-fonts'; document.head.appendChild(st); }
    var css = uploadedFaces(media, base);
    if (st.textContent !== css) st.textContent = css;
  }

  window.GFXTheme = { FONTS: FONTS, TOKENS: TOKENS, PRESETS: PRESETS, resolve: resolve, vars: vars, apply: apply,
                      rgba: rgba, mix: mix, stack: stack, fontFamilyOf: fontFamilyOf, useUploaded: useUploaded };
})();
