const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const ts = require('typescript');
const vm = require('node:vm');
const compiled = ts.transpileModule(readFileSync(join(__dirname, '../src/db.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const context = { exports: {} };
vm.runInNewContext(compiled, context);
const { plannedDriver, recordRegularPassenger, migrateDb } = context.exports;
const LOCK = 12 * 60 * 60 * 1000;
const instant = new Date('2026-10-08T06:00:00.000Z');
function database() {
  const sql = new DatabaseSync(':memory:');
  return { sql, execAsync: async q => sql.exec(q), runAsync: async (q, ...args) => sql.prepare(q).run(...args), getFirstAsync: async (q, ...args) => sql.prepare(q).get(...args) };
}
async function withDb(check) {
  const db = database();
  try { await migrateDb(db); await check(db); } finally { db.sql.close(); }
}
const save = (db, name = 'Hanes', now = instant) => recordRegularPassenger(db, '2026-10-08', 'Ranní', name, 0.5, 45, LOCK, now);
test('rotation follows calendar weeks before and after the anchor, across DST', () => {
  const names = ['Já', 'Tade', 'Fany'];
  for (const anchor of ['2026-03-28', '2026-10-24']) {
    for (let offset = -370; offset <= 370; offset++) {
      const date = new Date(anchor + 'T12:00:00Z');
      date.setUTCDate(date.getUTCDate() + offset);
      for (let base = 0; base < names.length; base++) {
        const expected = names[((base + Math.floor(offset / 7)) % 3 + 3) % 3];
        assert.equal(plannedDriver(date.toISOString().slice(0, 10), anchor, names[base]), expected);
      }
    }
  }
});
test('simultaneous taps save only one passenger entry', () => withDb(async db => {
  const result = await Promise.all([save(db), save(db), save(db)]);
  assert.deepEqual(result, [true, false, false]);
  const row = db.sql.prepare('SELECT COUNT(*) AS count, SUM(amount) AS total FROM passenger_entries').get();
  assert.equal(row.count, 1); assert.equal(row.total, 45);
}));
test('lock expires at exactly twelve hours', () => withDb(async db => {
  assert.equal(await save(db), true);
  assert.equal(await save(db, 'Hanes', new Date(instant.getTime() + LOCK - 1)), false);
  assert.equal(await save(db, 'Hanes', new Date(instant.getTime() + LOCK)), true);
}));
test('each regular passenger has an independent lock', () => withDb(async db => {
  assert.equal(await save(db), true);
  assert.equal(await save(db, 'Vorel'), true);
}));
test('retroactive and guest entries do not activate the regular lock', () => withDb(async db => {
  const insert = db.sql.prepare('INSERT INTO passenger_entries(date,shift,passenger_name,fraction,amount,is_guest,is_retro,created_at) VALUES(?,?,?,?,?,?,?,?)');
  insert.run('2026-10-07', 'Ranní', 'Hanes', 1, 90, 0, 1, instant.toISOString());
  insert.run('2026-10-08', 'Ranní', 'Hanes', 1, 90, 1, 0, instant.toISOString());
  assert.equal(await save(db), true);
}));
