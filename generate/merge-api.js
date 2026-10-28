#!/usr/bin/env node
'use strict';

// Merges the pages of a glua-api-snippets JSON release, one JSON file per wiki page, into the
// single api/wiki.json the generator reads. Usage:
//
//   gh release download -R luttje/glua-api-snippets -p "*.json.zip" -D /tmp/glua
//   unzip /tmp/glua/*.json.zip -d /tmp/glua/pages
//   node merge-api.js /tmp/glua/pages

const fs = require('fs');
const path = require('path');

const source = process.argv[2];
if (!source) {
    console.error('usage: node merge-api.js <directory of the unzipped release>');
    process.exit(1);
}

function pages(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) return pages(full);
        return entry.name.endsWith('.json') ? [full] : [];
    });
}

const entries = [];
let lastUpdate = null;
for (const file of pages(source).sort()) {
    const content = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const entry of Array.isArray(content) ? content : [content]) {
        if (entry.lastUpdate) lastUpdate = entry.lastUpdate;
        else if (entry.type) entries.push(entry);
    }
}

entries.sort((a, b) => a.address.localeCompare(b.address));
const out = path.resolve(__dirname, '..', 'api', 'wiki.json');
fs.writeFileSync(out, JSON.stringify({ lastUpdate, entries }, null, 1) + '\n');
console.log(`Merged ${entries.length} wiki pages into ${path.relative(process.cwd(), out)} (${(fs.statSync(out).size / 1024 / 1024).toFixed(1)} MiB)`);
