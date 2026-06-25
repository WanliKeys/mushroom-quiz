const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

assert.match(app, /const DAILY_DRAW_LIMIT = 3;/, 'daily draw limit should be configured as 3');
assert.match(app, /function getTodayDrawCount\(\)/, 'app should count today draw attempts');
assert.match(app, /getTodayDrawCount\(\)\s*>=\s*DAILY_DRAW_LIMIT/, 'app should block draws after the daily limit');
assert.match(app, /const record=\{date:today,attempts,drawnAt:attempt\.drawnAt/, 'daily draw record should store each attempt');
assert.match(index, /每人每天可抽奖 3 次/, 'draw modal copy should tell users they can draw 3 times daily');

console.log('daily draw limit checks passed');
