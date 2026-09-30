#!/usr/bin/env node
/* npm start: NodeCG with this bundle, from this folder (NodeCG installed as
   the bundle's dependency by npm install; its cfg/, db/, assets/ and logs/
   go next to this file, git-ignored).

   NodeCG listens on every network interface unless told otherwise; on the
   first start, cfg/nodecg.json keeps it to this machine (127.0.0.1:9090).
   Change "host" to "0.0.0.0" there to open the dashboard to the network —
   and turn on NodeCG's login ("login" in the same file): without it, anyone
   on the network can edit the show and put anything on air. */
'use strict';
const fs = require('fs');
const path = require('path');

const root = process.env.NODECG_ROOT || __dirname;
const cfg = path.join(root, 'cfg', 'nodecg.json');
if (!fs.existsSync(cfg)) {
  fs.mkdirSync(path.dirname(cfg), { recursive: true });
  fs.writeFileSync(cfg, JSON.stringify({ host: '127.0.0.1', port: 9090 }, null, 2) + '\n');
  console.log('cfg/nodecg.json créé : NodeCG écoute sur 127.0.0.1:9090 (cette machine seulement).');
}
const nodecg = path.join(__dirname, 'node_modules', 'nodecg', 'index.js');
if (!fs.existsSync(nodecg)) {
  console.error('NodeCG n\'est pas installé : lancez d\'abord « npm install ».');
  process.exit(1);
}
process.chdir(__dirname);
require(nodecg);
