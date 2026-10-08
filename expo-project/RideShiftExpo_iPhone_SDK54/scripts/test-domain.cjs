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

// CALENDAR+STORNO V2 tests.
const compiledCalendar = ts.transpileModule(readFileSync(join(__dirname, '../src/shiftCalendar.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS }
}).outputText;
const calendarContext = { exports: {} };
vm.runInNewContext(compiledCalendar, calendarContext);
const { workCodeForDate, workShiftName } = calendarContext.exports;
const after = (key, n) => { const d = new Date(key + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
test('four work groups repeat exactly after 28 days', () => {
  for (const g of ['A', 'B', 'C', 'D']) {
    for (let delta = -365; delta <= 365; delta++) {
      assert.equal(workCodeForDate(after('2026-10-05', delta), g),
                   workCodeForDate(after('2026-10-05', delta + 28), g));
    }
  }
});
test('group A/B/C/D roster matches October 2026 screenshots', () => {
  const examples = [
    ['A', '2026-10-05', 'O'], ['A', '2026-10-12', 'R'], ['A', '2026-10-26', 'N'],
    ['B', '2026-10-05', 'N'], ['B', '2026-10-12', 'O'], ['B', '2026-10-30', 'R'],
    ['C', '2026-10-08', 'V'], ['C', '2026-10-09', 'R'], ['C', '2026-10-16', 'V'],
    ['C', '2026-10-19', 'O'], ['C', '2026-10-23', 'O'], ['C', '2026-10-27', 'R'],
    ['D', '2026-10-05', 'R'], ['D', '2026-10-09', 'N'], ['D', '2026-10-26', 'O'],
  ];
  for (const [g, d, code] of examples) assert.equal(workCodeForDate(d, g), code);
});
test('personal overtime is omitted from predicted C shift', () => {
  for (const d of ['2026-09-18', '2026-10-16']) assert.equal(workCodeForDate(d, 'C'), 'V');
  assert.equal(workCodeForDate('2026-10-01', 'C'), 'R');
  assert.equal(workCodeForDate('2026-10-12', 'C'), 'N');
  assert.equal(workCodeForDate('2026-10-19', 'C'), 'O');
});
test('Saturday work shift remains compatible with original DB', () => {
  assert.equal(workShiftName('R', '2026-10-10'), 'Ranní');
  assert.equal(workShiftName('N', '2026-10-10'), 'Noční');
  assert.equal(workShiftName('V', '2026-10-10'), null);
});
test('cancelled entry stops locking passenger and is excluded from totals', () => withDb(async db => {
  assert.equal(await save(db), true);
  await db.runAsync("UPDATE passenger_entries SET is_cancelled=1,cancelled_at=? WHERE id=1", instant.toISOString());
  assert.equal(await save(db), true);
  const row = db.sql.prepare('SELECT COUNT(*) AS count,SUM(amount) AS total FROM passenger_entries WHERE is_cancelled=0').get();
  assert.equal(row.count, 1); assert.equal(row.total, 45);
}));
test('migration preserves existing records on second initialization', () => withDb(async db => {
  assert.equal(await save(db), true);
  await migrateDb(db);
  assert.equal(db.sql.prepare('SELECT COUNT(*) AS n FROM passenger_entries').get().n, 1);
}));
