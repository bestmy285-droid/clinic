'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function copyDir(name) {
  const from = path.join(root, name);
  const to = path.join(root, 'functions', name);
  fs.rmSync(to, { recursive: true, force: true });
  fs.cpSync(from, to, { recursive: true });
  console.log('copied', name, '->', path.relative(root, to));
}

copyDir('lib');
copyDir('public');
