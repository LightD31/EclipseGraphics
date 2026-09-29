/* Motion: how graphics come on and go off air.

   Every graphic names its parts by role — bandA (the accent band), bandB
   (the info band), surface (the light strap), panel (a side square), title,
   text, items (lists, staggered), figure (a timer), clock, line (a progress
   or accent line), tag, badge, visual (a mark that pops), sheen (a light
   sweep), bg (a full-screen background), block (a secondary panel). A preset
   says, for each role, which effect runs, when and for how long, in and out.
   The same preset therefore choreographs a bandeau, a name strap or a card,
   and switching presets restyles every entrance at once.

   Effects are Web Animations (element.animate) built from keyframes: no
   class juggling, any duration, and an entrance interrupted by an exit
   reverses from where it is instead of jumping. show.motion = { preset,
   speed, stagger, morph, change }; a graphic's own motion overrides it. */
(function () {
  'use strict';

  var EASE = {
    out: 'cubic-bezier(0.22, 1, 0.36, 1)',      /* the house curve: fast, long settle */
    expo: 'cubic-bezier(0.16, 1, 0.3, 1)',
    soft: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
    back: 'cubic-bezier(0.34, 1.56, 0.64, 1)',  /* overshoot */
    snap: 'cubic-bezier(0.7, 0, 0.2, 1)',
    in: 'cubic-bezier(0.5, 0, 0.75, 0)',        /* exits: accelerate away */
    easeIn: 'ease-in', easeOut: 'ease-out', linear: 'linear'
  };

  /* Keyframes from hidden to shown. An exit plays them backwards unless it
     names one of its own (the exit* effects, which leave the other way). */
  var FX = {
    none: [{ opacity: 1 }, { opacity: 1 }],
    cut: [{ opacity: 0, offset: 0 }, { opacity: 0, offset: 0.999 }, { opacity: 1 }],
    fade: [{ opacity: 0 }, { opacity: 1 }],
    fadeUp: [{ opacity: 0, transform: 'translate3d(0,14px,0)' }, { opacity: 1, transform: 'none' }],
    fadeDown: [{ opacity: 0, transform: 'translate3d(0,-14px,0)' }, { opacity: 1, transform: 'none' }],
    textR: [{ opacity: 0, transform: 'translate3d(-24px,0,0)' }, { opacity: 1, transform: 'none' }],
    textL: [{ opacity: 0, transform: 'translate3d(24px,0,0)' }, { opacity: 1, transform: 'none' }],
    wipeR: [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)' }],
    wipeL: [{ clipPath: 'inset(0 0 0 100%)' }, { clipPath: 'inset(0 0 0 0%)' }],
    wipeU: [{ clipPath: 'inset(100% 0 0 0)' }, { clipPath: 'inset(0% 0 0 0)' }],
    wipeD: [{ clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0% 0)' }],
    wipeC: [{ clipPath: 'inset(0 50% 0 50%)' }, { clipPath: 'inset(0 0% 0 0%)' }],
    wipeSkew: [{ clipPath: 'polygon(0 0, 0 0, -12% 100%, -12% 100%)' }, { clipPath: 'polygon(0 0, 112% 0, 100% 100%, -12% 100%)' }],
    /* slides revealed inside the element's own box (no wrapper needed): the
       content moves while a clip keeps it within where it will rest */
    maskUp: [{ transform: 'translate3d(0,100%,0)', clipPath: 'inset(0 0 100% 0)' }, { transform: 'translate3d(0,0,0)', clipPath: 'inset(0 0 0% 0)' }],
    maskDown: [{ transform: 'translate3d(0,-100%,0)', clipPath: 'inset(100% 0 0 0)' }, { transform: 'translate3d(0,0,0)', clipPath: 'inset(0% 0 0 0)' }],
    maskRight: [{ transform: 'translate3d(-100%,0,0)', clipPath: 'inset(0 0 0 100%)' }, { transform: 'translate3d(0,0,0)', clipPath: 'inset(0 0 0 0%)' }],
    maskLeft: [{ transform: 'translate3d(100%,0,0)', clipPath: 'inset(0 100% 0 0)' }, { transform: 'translate3d(0,0,0)', clipPath: 'inset(0 0% 0 0)' }],
    /* plain travels, visible all the way (from off the edge they sit on) */
    slideL: [{ transform: 'translate3d(-110%,0,0)' }, { transform: 'translate3d(0,0,0)' }],
    slideR: [{ transform: 'translate3d(110%,0,0)' }, { transform: 'translate3d(0,0,0)' }],
    slideU: [{ transform: 'translate3d(0,110%,0)' }, { transform: 'translate3d(0,0,0)' }],
    slideD: [{ transform: 'translate3d(0,-110%,0)' }, { transform: 'translate3d(0,0,0)' }],
    pop: [{ transform: 'scale(0)' }, { transform: 'scale(1.09)', offset: 0.7 }, { transform: 'scale(1)' }],
    zoom: [{ opacity: 0, transform: 'scale(1.12)' }, { opacity: 1, transform: 'scale(1)' }],
    shrink: [{ opacity: 0, transform: 'scale(0.86)' }, { opacity: 1, transform: 'scale(1)' }],
    blur: [{ opacity: 0, filter: 'blur(14px)' }, { opacity: 1, filter: 'blur(0px)' }],
    growX: [{ transform: 'scaleX(0)', transformOrigin: 'left center' }, { transform: 'scaleX(1)', transformOrigin: 'left center' }],
    growXC: [{ transform: 'scaleX(0)', transformOrigin: 'center' }, { transform: 'scaleX(1)', transformOrigin: 'center' }],
    growY: [{ transform: 'scaleY(0)', transformOrigin: 'center bottom' }, { transform: 'scaleY(1)', transformOrigin: 'center bottom' }],
    flip: [{ opacity: 0, transform: 'perspective(900px) rotateX(-88deg)', transformOrigin: 'center top' },
           { opacity: 1, transform: 'perspective(900px) rotateX(0deg)', transformOrigin: 'center top' }],
    sheen: [{ transform: 'translateX(-300%) skewX(-15deg)' }, { transform: 'translateX(340%) skewX(-15deg)' }],
    /* exits that leave the other way (played forwards) */
    exitR: [{ clipPath: 'inset(0 0 0 0%)' }, { clipPath: 'inset(0 0 0 100%)' }],
    exitL: [{ clipPath: 'inset(0 0% 0 0)' }, { clipPath: 'inset(0 100% 0 0)' }],
    exitUp: [{ transform: 'translate3d(0,0,0)', clipPath: 'inset(0% 0 0 0)' }, { transform: 'translate3d(0,-100%,0)', clipPath: 'inset(100% 0 0 0)' }],
    exitFade: [{ opacity: 1 }, { opacity: 0 }]
  };
  var LABELS = {
    none: 'aucun', cut: 'coupe franche', fade: 'fondu', fadeUp: 'fondu montant', fadeDown: 'fondu descendant',
    textR: 'glisse depuis la gauche', textL: 'glisse depuis la droite', wipeR: 'volet vers la droite', wipeL: 'volet vers la gauche',
    wipeU: 'volet vers le haut', wipeD: 'volet vers le bas', wipeC: 'volet depuis le centre', wipeSkew: 'volet oblique',
    maskUp: 'monte (masqué)', maskDown: 'descend (masqué)', maskRight: 'entre par la gauche (masqué)', maskLeft: 'entre par la droite (masqué)',
    slideL: 'arrive de la gauche', slideR: 'arrive de la droite', slideU: 'arrive du bas', slideD: 'arrive du haut',
    pop: 'rebond', zoom: 'zoom arrière', shrink: 'zoom avant', blur: 'net depuis le flou', growX: 'trait qui s\'allonge',
    growXC: 'trait depuis le centre', growY: 'trait qui monte', flip: 'bascule', sheen: 'reflet',
    exitR: 'sort par la droite', exitL: 'sort par la gauche', exitUp: 'sort par le haut', exitFade: 'fondu de sortie'
  };

  /* role: [effect, start (s), duration (s), easing, stagger (s, items only)] */
  var PRESETS = {
    direct: {
      label: 'Direct', desc: 'Volets et montées nets, en moins d\'une seconde — la chorégraphie maison, resserrée',
      morph: 0.6,
      in: {
        banner: ['wipeR', 0, 0.5, 'out'],
        bandA: ['wipeR', 0, 0.4, 'out'], panel: ['slideL', 0.06, 0.45, 'out'], title: ['textR', 0.14, 0.4, 'out'],
        tag: ['wipeR', 0.1, 0.3, 'out'], bandB: ['maskUp', 0.24, 0.42, 'out'], figure: ['fadeUp', 0.28, 0.35, 'easeOut'],
        visual: ['pop', 0.32, 0.45, 'back'], sheen: ['sheen', 0.36, 0.62, 'soft'], surface: ['maskUp', 0.38, 0.4, 'out'],
        text: ['textR', 0.3, 0.38, 'out'], items: ['textR', 0.44, 0.3, 'easeOut', 0.09], clock: ['fadeUp', 0.72, 0.3, 'easeOut'],
        line: ['growX', 0.58, 0.4, 'out'], badge: ['pop', 0.2, 0.4, 'back'], bg: ['fade', 0, 0.45, 'soft'], block: ['fadeUp', 0.46, 0.4, 'easeOut']
      },
      out: {
        banner: ['exitR', 0, 0.36, 'in'],
        line: ['growX', 0, 0.22, 'easeIn'], items: ['textR', 0, 0.18, 'easeIn', 0], clock: ['fadeUp', 0, 0.18, 'easeIn'],
        figure: ['fadeUp', 0, 0.22, 'easeIn'], block: ['fadeUp', 0, 0.22, 'easeIn'], badge: ['fade', 0, 0.2, 'easeIn'],
        surface: ['maskUp', 0.04, 0.26, 'easeIn'], text: ['textR', 0.04, 0.22, 'easeIn'], title: ['textR', 0.06, 0.26, 'easeIn'],
        tag: ['wipeR', 0.06, 0.24, 'in'], bandB: ['maskUp', 0.1, 0.3, 'easeIn'], bandA: ['wipeR', 0.15, 0.35, 'in'],
        panel: ['slideL', 0.18, 0.35, 'in'], visual: ['none', 0, 0.01, 'linear'], sheen: ['none', 0, 0.01, 'linear'],
        bg: ['fade', 0.2, 0.35, 'easeIn']
      }
    },
    classique: {
      label: 'Classique', desc: 'Les timings exacts des habillages éclipse et A350F',
      morph: 0.65,
      in: {
        banner: ['wipeR', 0, 0.55, 'out'],
        bandA: ['wipeR', 0, 0.45, 'out'], panel: ['slideL', 0.1, 0.5, 'out'], title: ['textR', 0.2, 0.45, 'out'],
        tag: ['wipeR', 0.15, 0.35, 'out'], bandB: ['maskUp', 0.35, 0.5, 'out'], figure: ['fadeUp', 0.38, 0.4, 'easeOut'],
        visual: ['pop', 0.45, 0.5, 'back'], sheen: ['sheen', 0.5, 0.7, 'soft'], surface: ['maskUp', 0.55, 0.45, 'out'],
        text: ['textR', 0.4, 0.4, 'out'], items: ['textR', 0.6, 0.35, 'easeOut', 0.12], clock: ['fadeUp', 1.05, 0.35, 'easeOut'],
        line: ['growX', 0.85, 0.45, 'out'], badge: ['pop', 0.3, 0.45, 'back'], bg: ['fade', 0, 0.5, 'soft'], block: ['fadeUp', 0.6, 0.45, 'easeOut']
      },
      out: {
        banner: ['exitR', 0, 0.4, 'in'],
        line: ['growX', 0, 0.25, 'easeIn'], items: ['textR', 0, 0.2, 'easeIn', 0], clock: ['fadeUp', 0, 0.2, 'easeIn'],
        figure: ['fadeUp', 0, 0.25, 'easeIn'], block: ['fadeUp', 0, 0.25, 'easeIn'], badge: ['fade', 0, 0.25, 'easeIn'],
        surface: ['maskUp', 0.05, 0.3, 'easeIn'], text: ['textR', 0.05, 0.3, 'easeIn'], title: ['textR', 0.08, 0.3, 'easeIn'],
        tag: ['wipeR', 0.08, 0.3, 'in'], bandB: ['maskUp', 0.12, 0.35, 'easeIn'], bandA: ['wipeR', 0.18, 0.4, 'in'],
        panel: ['slideL', 0.22, 0.4, 'in'], visual: ['none', 0, 0.01, 'linear'], sheen: ['none', 0, 0.01, 'linear'],
        bg: ['fade', 0.25, 0.4, 'easeIn']
      }
    },
    fluide: {
      label: 'Fluide', desc: 'Fondus et petites montées, courbes longues : discret, élégant',
      morph: 0.8,
      in: {
        banner: ['fadeUp', 0, 0.6, 'expo'],
        bandA: ['fade', 0, 0.6, 'expo'], panel: ['fade', 0.05, 0.6, 'expo'], title: ['fadeUp', 0.15, 0.6, 'expo'],
        tag: ['fade', 0.1, 0.5, 'expo'], bandB: ['fadeUp', 0.2, 0.6, 'expo'], figure: ['fadeUp', 0.25, 0.6, 'expo'],
        visual: ['shrink', 0.2, 0.7, 'expo'], sheen: ['none', 0, 0.01, 'linear'], surface: ['fadeUp', 0.3, 0.6, 'expo'],
        text: ['fadeUp', 0.3, 0.6, 'expo'], items: ['fadeUp', 0.35, 0.55, 'expo', 0.07], clock: ['fade', 0.5, 0.5, 'expo'],
        line: ['growXC', 0.45, 0.7, 'expo'], badge: ['fade', 0.2, 0.5, 'expo'], bg: ['fade', 0, 0.7, 'soft'], block: ['fadeUp', 0.4, 0.6, 'expo']
      },
      out: {
        banner: ['fade', 0, 0.4, 'easeIn'],
        line: ['fade', 0, 0.3, 'easeIn'], items: ['fade', 0, 0.3, 'easeIn', 0], clock: ['fade', 0, 0.3, 'easeIn'],
        figure: ['fade', 0, 0.3, 'easeIn'], block: ['fade', 0, 0.3, 'easeIn'], badge: ['fade', 0, 0.3, 'easeIn'],
        surface: ['fade', 0.05, 0.35, 'easeIn'], text: ['fade', 0.05, 0.3, 'easeIn'], title: ['fade', 0.05, 0.35, 'easeIn'],
        tag: ['fade', 0.05, 0.3, 'easeIn'], bandB: ['fade', 0.1, 0.4, 'easeIn'], bandA: ['fade', 0.12, 0.4, 'easeIn'],
        panel: ['fade', 0.12, 0.4, 'easeIn'], visual: ['fade', 0.05, 0.3, 'easeIn'], sheen: ['none', 0, 0.01, 'linear'],
        bg: ['fade', 0.15, 0.45, 'easeIn']
      }
    },
    impact: {
      label: 'Impact', desc: 'Volets obliques, rebonds et reflet : pour le sport et les annonces',
      morph: 0.5,
      in: {
        banner: ['wipeSkew', 0, 0.34, 'snap'],
        bandA: ['wipeSkew', 0, 0.32, 'snap'], panel: ['maskRight', 0.04, 0.34, 'snap'], title: ['zoom', 0.12, 0.34, 'expo'],
        tag: ['pop', 0.08, 0.36, 'back'], bandB: ['wipeSkew', 0.16, 0.32, 'snap'], figure: ['pop', 0.2, 0.4, 'back'],
        visual: ['pop', 0.2, 0.4, 'back'], sheen: ['sheen', 0.26, 0.5, 'soft'], surface: ['wipeSkew', 0.24, 0.3, 'snap'],
        text: ['textR', 0.26, 0.3, 'expo'], items: ['flip', 0.3, 0.32, 'expo', 0.06], clock: ['pop', 0.45, 0.35, 'back'],
        line: ['growX', 0.38, 0.28, 'snap'], badge: ['pop', 0.12, 0.36, 'back'], bg: ['wipeSkew', 0, 0.4, 'snap'], block: ['maskUp', 0.34, 0.34, 'expo']
      },
      out: {
        banner: ['exitR', 0, 0.24, 'in'],
        line: ['growX', 0, 0.16, 'easeIn'], items: ['fade', 0, 0.14, 'easeIn', 0], clock: ['fade', 0, 0.14, 'easeIn'],
        figure: ['zoom', 0, 0.18, 'easeIn'], block: ['fade', 0, 0.16, 'easeIn'], badge: ['fade', 0, 0.16, 'easeIn'],
        surface: ['exitR', 0.02, 0.2, 'in'], text: ['fade', 0.02, 0.16, 'easeIn'], title: ['fade', 0.04, 0.18, 'easeIn'],
        tag: ['exitR', 0.04, 0.2, 'in'], bandB: ['exitR', 0.06, 0.22, 'in'], bandA: ['exitR', 0.1, 0.24, 'in'],
        panel: ['exitL', 0.1, 0.24, 'in'], visual: ['fade', 0, 0.16, 'easeIn'], sheen: ['none', 0, 0.01, 'linear'],
        bg: ['exitR', 0.12, 0.3, 'in']
      }
    },
    rideau: {
      label: 'Rideau', desc: 'Tout s\'ouvre depuis le centre, les textes en fondu',
      morph: 0.7,
      in: {
        banner: ['wipeC', 0, 0.5, 'expo'],
        bandA: ['wipeC', 0, 0.5, 'expo'], panel: ['wipeC', 0.05, 0.5, 'expo'], title: ['fade', 0.25, 0.45, 'soft'],
        tag: ['wipeC', 0.15, 0.4, 'expo'], bandB: ['wipeC', 0.15, 0.5, 'expo'], figure: ['fade', 0.35, 0.45, 'soft'],
        visual: ['blur', 0.3, 0.5, 'soft'], sheen: ['none', 0, 0.01, 'linear'], surface: ['wipeC', 0.25, 0.5, 'expo'],
        text: ['fade', 0.4, 0.45, 'soft'], items: ['fade', 0.45, 0.4, 'soft', 0.06], clock: ['fade', 0.55, 0.4, 'soft'],
        line: ['growXC', 0.4, 0.5, 'expo'], badge: ['wipeC', 0.2, 0.4, 'expo'], bg: ['wipeC', 0, 0.6, 'expo'], block: ['wipeU', 0.4, 0.5, 'expo']
      },
      out: {
        banner: ['wipeC', 0, 0.32, 'in'],
        line: ['growXC', 0, 0.25, 'easeIn'], items: ['fade', 0, 0.2, 'easeIn', 0], clock: ['fade', 0, 0.2, 'easeIn'],
        figure: ['fade', 0, 0.2, 'easeIn'], block: ['wipeU', 0, 0.3, 'in'], badge: ['wipeC', 0, 0.25, 'in'],
        surface: ['wipeC', 0.1, 0.3, 'in'], text: ['fade', 0, 0.2, 'easeIn'], title: ['fade', 0, 0.2, 'easeIn'],
        tag: ['wipeC', 0.1, 0.25, 'in'], bandB: ['wipeC', 0.12, 0.3, 'in'], bandA: ['wipeC', 0.18, 0.32, 'in'],
        panel: ['wipeC', 0.18, 0.32, 'in'], visual: ['fade', 0, 0.2, 'easeIn'], sheen: ['none', 0, 0.01, 'linear'],
        bg: ['wipeC', 0.2, 0.4, 'in']
      }
    },
    coupe: {
      label: 'Coupe', desc: 'Aucune animation : le graphique apparaît et disparaît net',
      morph: 0,
      in: {}, out: {}, all: ['cut', 0, 0.001, 'linear']
    }
  };
  var ROLES = ['banner', 'bandA', 'bandB', 'surface', 'panel', 'visual', 'title', 'text', 'items', 'figure', 'clock', 'line',
               'tag', 'badge', 'sheen', 'bg', 'block'];

  /* show.motion + a graphic's motion → { preset, speed, stagger, morph, change } */
  function config(showMotion, own) {
    var s = showMotion || {}, g = own || {};
    var name = g.preset || s.preset || 'direct';
    var P = PRESETS[name] || PRESETS.direct;
    var speed = +g.speed || +s.speed || 1;
    return {
      preset: name, P: P, speed: Math.max(0.25, Math.min(4, speed)),
      stagger: g.stagger != null && g.stagger !== '' ? +g.stagger : s.stagger != null && s.stagger !== '' ? +s.stagger : 1,
      morph: (s.morph != null && s.morph !== '' ? +s.morph : P.morph) / Math.max(0.25, speed),
      change: g.change || s.change || 'fade'
    };
  }
  function spec(cfg, dir, role) {
    var P = cfg.P;
    if (P.all) return P.all;
    return (P[dir] && P[dir][role]) || (dir === 'in' ? ['fade', 0.1, 0.35, 'out'] : ['fade', 0, 0.25, 'easeIn']);
  }
  function frames(name, dir) {
    var f = FX[name] || FX.fade;
    if (dir === 'out' && !/^exit/.test(name) && name !== 'cut') f = f.slice().reverse().map(function (k, i, a) {
      var c = Object.assign({}, k);
      if (c.offset != null) c.offset = 1 - c.offset;
      return c;
    });
    if (dir === 'out' && name === 'cut') f = [{ opacity: 1 }, { opacity: 1, offset: 0.001 }, { opacity: 0 }];
    return f;
  }

  /* Run one direction over a graphic's parts → a handle:
       { dir, finished (Promise), running(), cancel(), reverse() }
     parts: [{ el, role, i }] — i orders the items of a list for the stagger.
     In: the parts wait in their hidden state (fill backwards) until their
     turn. Out: they hold their hidden state (fill forwards) until cancelled
     — the caller parks the graphic first, so nothing flashes back. */
  function play(parts, dir, cfg) {
    cfg = cfg || config();
    var anims = [];
    (parts || []).forEach(function (p) {
      if (!p || !p.el || !p.el.animate) return;
      var sp = spec(cfg, dir, p.role);
      var st = (sp[4] || 0) * (cfg.stagger == null ? 1 : cfg.stagger);
      var delay = (sp[1] + (p.i || 0) * st) / cfg.speed;
      var dur = Math.max(0.001, sp[2] / cfg.speed);
      try {
        anims.push(p.el.animate(frames(sp[0], dir), {
          duration: dur * 1000, delay: delay * 1000, easing: EASE[sp[3]] || sp[3] || EASE.out,
          fill: dir === 'in' ? 'backwards' : 'forwards'
        }));
      } catch (e) { /* a keyframe this browser can't animate: that part just appears */ }
    });
    var handle = {
      dir: dir, anims: anims,
      finished: Promise.all(anims.map(function (a) { return a.finished.catch(function () {}); })),
      running: function () { return anims.some(function (a) { return a.playState === 'running'; }); },
      cancel: function () { anims.forEach(function (a) { try { a.cancel(); } catch (e) { /* gone */ } }); },
      /* Turn back from wherever it is (an exit during an entrance or the
         reverse): the same curves, run backwards → the new direction's handle */
      reverse: function () {
        anims.forEach(function (a) {
          try { a.effect.updateTiming({ fill: 'both' }); a.reverse(); } catch (e) { /* ignore */ }
        });
        handle.dir = dir === 'in' ? 'out' : 'in';
        handle.finished = Promise.all(anims.map(function (a) { return a.finished.catch(function () {}); }));
        return handle;
      }
    };
    return handle;
  }
  /* A text changing while on air: out, swap, in — on one element */
  function change(el, apply, cfg) {
    var kind = (cfg && cfg.change) || 'fade';
    if (!el || !el.animate || kind === 'none') { apply(); return Promise.resolve(); }
    var sp = (cfg && cfg.speed) || 1;
    var outK = kind === 'slide' ? [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translate3d(0,-40%,0)' }]
                                : [{ opacity: 1 }, { opacity: 0 }];
    var inK = kind === 'slide' ? [{ opacity: 0, transform: 'translate3d(0,40%,0)' }, { opacity: 1, transform: 'none' }]
                               : [{ opacity: 0 }, { opacity: 1 }];
    var a = el.animate(outK, { duration: 180 / sp, easing: EASE.in, fill: 'forwards' });
    return a.finished.then(function () {
      apply();
      var b = el.animate(inK, { duration: 260 / sp, easing: EASE.out, fill: 'backwards' });
      a.cancel();
      return b.finished;
    }, function () { apply(); });
  }

  window.GFXMotion = { EASE: EASE, FX: FX, LABELS: LABELS, PRESETS: PRESETS, ROLES: ROLES,
                       config: config, play: play, change: change, spec: spec };
})();
