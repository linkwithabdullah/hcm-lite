#!/usr/bin/env node
'use strict';
/**
 * HCM Lite: fix extensionless relative imports that crash under Vercel Node ESM.
 * Run from the HCM Lite repository root: node scripts/fix-vercel-esm-imports.cjs
 * This changes only import specifiers and preserves all existing application logic.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const replacements = {
  'api/index.ts': ['../src/server/db', '../src/server/routes'],
  'src/server/routes.ts': ['./db', './auth', './rules', './ai', './testRunner'],
  'src/server/auth.ts': ['./db'],
  'src/server/ai.ts': ['./db', './rules'],
  'src/server/testRunner.ts': ['./db', './routes'],
  'server.ts': ['./src/server/db', './api/index'],
};
function regexEscape(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function findAndReplace(source, importPath) {
  let count = 0;
  const regex = new RegExp("(\\bfrom\\s*|\\bimport\\s*\\(\\s*)([\'\"])" + "(" + regexEscape(importPath) + ")\\2", "g");
  const result = source.replace(regex, (_all, prefix, quote, relativePath) => {
    count += 1;
    return `${prefix}${quote}${relativePath}.js${quote}`;
  });
  return {result, count};
}
if (!fs.existsSync(path.join(root, 'package.json')) || !fs.existsSync(path.join(root, 'api/index.ts'))) {
  console.error('ERROR: Run this command from your HCM Lite project root (the folder containing package.json and api/index.ts).');
  process.exit(1);
}
const planned = [];
for (const [relativeFile, imports] of Object.entries(replacements)) {
  const abs = path.join(root, relativeFile);
  if (!fs.existsSync(abs)) {
    console.error(`ERROR: Required source file not found: ${relativeFile}`);
    process.exit(1);
  }
  const original = fs.readFileSync(abs, 'utf8');
  let updated = original;
  let numberChanged = 0;
  for (const specifier of imports) {
    const {result,count} = findAndReplace(updated, specifier);
    updated = result;
    numberChanged += count;
  }
  planned.push({abs, relativeFile, original, updated, numberChanged});
}
let changedFiles = 0, changedImports = 0;
for (const item of planned) {
  if (item.updated !== item.original) {
    fs.writeFileSync(item.abs, item.updated, 'utf8');
    changedFiles += 1;
    changedImports += item.numberChanged;
    console.log(`UPDATED ${item.relativeFile}: ${item.numberChanged} imports`);
  } else {
    console.log(`UNCHANGED ${item.relativeFile}`);
  }
}
console.log(`\nDone. ${changedImports} import(s) updated in ${changedFiles} file(s).`);
console.log('Next: npm run lint && npm run build');
console.log('Your existing Git commit can be used to review/undo changes (git diff).');
