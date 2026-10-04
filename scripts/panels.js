#!/usr/bin/env node
/* The dashboard's module panels: one NodeCG panel per module of modules/,
   made from its module.js. NodeCG reads its panels from package.json when
   it starts, so a module added (or removed) needs this once:

     npm run panels

   It writes dashboard/module-<id>.html (the same small page for every
   module: engine/panel/modpanel.js does the work) and the panels' entries
   in package.json (nodecg.dashboardPanels), after the Régie's and before
   the dialogs, leaving those as they are. A module can set its panel's
   width in module.js: panelWidth (NodeCG's units, 3 by default). */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PKG = path.join(ROOT, 'package.json');
const DASH = path.join(ROOT, 'dashboard');

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
function page(id, D) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>${esc(D.label)} · habillage</title>
<!-- The "${esc(id)}" module's panel in NodeCG's dashboard: its live controls, its
     state, its variables; its settings in the "Réglages du module" dialog.
     Made by scripts/panels.js (npm run panels): change that, not this. -->
<base href="../">
<link rel="stylesheet" href="engine/fonts/fonts.css">
<link rel="stylesheet" href="engine/panel/panel.css">
</head>
<body class="modpanel" data-module="${esc(id)}">
<main id="mp"></main>
<div id="toast"></div>
<script src="engine/shared.js"></script>
<script src="engine/theme.js"></script>
<script src="engine/motion.js"></script>
<script src="engine/gfx.js"></script>
<script src="engine/panel/forms.js"></script>
<script src="engine/panel/link.js"></script>
<script src="engine/panel/modpanel.js"></script>
</body>
</html>
`;
}

const pkg = JSON.parse(fs.readFileSync(PKG, 'utf8'));
/* in the order of their names, as the Régie lists them */
const mods = fs.readdirSync(path.join(ROOT, 'modules'))
  .filter(d => fs.existsSync(path.join(ROOT, 'modules', d, 'module.js')))
  .map(id => ({ id, D: require(path.join(ROOT, 'modules', id, 'module.js')) }))
  .sort((a, b) => a.D.label.localeCompare(b.D.label, 'fr'));
const ids = mods.map(m => m.id);
const made = mods.map(({ id, D }) => {
  fs.writeFileSync(path.join(DASH, 'module-' + id + '.html'), page(id, D));
  return { name: 'module-' + id, title: D.label, file: 'module-' + id + '.html', width: D.panelWidth || 3, headerColor: '#10173a' };
});
/* a module gone: its page too */
for (const f of fs.readdirSync(DASH)) {
  const m = /^module-(.+)\.html$/.exec(f);
  if (m && !ids.includes(m[1])) fs.unlinkSync(path.join(DASH, f));
}
const others = pkg.nodecg.dashboardPanels.filter(p => !/^module-/.test(p.name));
pkg.nodecg.dashboardPanels = others.filter(p => !p.dialog).concat(made, others.filter(p => p.dialog));
fs.writeFileSync(PKG, JSON.stringify(pkg, null, 2) + '\n');
console.log('Panneaux des modules : ' + ids.join(', '));
