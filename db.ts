import type { SQLiteDatabase } from 'expo-sqlite';
import type { DriverName, ShiftName } from './types';

export async function migrateDb(db: SQLiteDatabase) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS drives (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      shift TEXT NOT NULL,
      planned_driver TEXT NOT NULL,
      actual_driver TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(date, shift)
    );

    CREATE TABLE IF NOT EXISTS passenger_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      shift TEXT NOT NULL,
      passenger_name TEXT NOT NULL,
      fraction REAL NOT NULL,
      amount REAL NOT NULL,
      is_guest INTEGER NOT NULL DEFAULT 0,
      is_retro INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `);

  const anchor = await db.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key='rotation_anchor_date'");
  if (!anchor) {
    await db.runAsync("INSERT INTO settings(key,value) VALUES('rotation_anchor_date','2026-10-03')");
    await db.runAsync("INSERT INTO settings(key,value) VALUES('rotation_anchor_driver','Já')");
  }
}

export async function getSetting(db: SQLiteDatabase, key: string, fallback: string) {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key=?', key);
  return row?.value ?? fallback;
}

export async function setSetting(db: SQLiteDatabase, key: string, value: string) {
  await db.runAsync(
    `INSERT INTO settings(key,value) VALUES(?,?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
    key,
    value
  );
}

export function formatDateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDateKey(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0);
}

export function monthKey(dateKey: string) {
  return dateKey.slice(0, 7);
}

export function shiftOptions(dateKey: string): ShiftName[] {
  const day = parseDateKey(dateKey).getDay();
  return day === 6 ? ['Sobota 12 h'] : ['Ranní', 'Odpolední', 'Noční'];
}

export function plannedDriver(dateKey: string, anchorDateKey: string, anchorDriver: DriverName): DriverName {
  const drivers: DriverName[] = ['Já', 'Tade', 'Fany'];
  const days = Math.floor((parseDateKey(dateKey).getTime() - parseDateKey(anchorDateKey).getTime()) / 86400000);
  const week = Math.floor(days / 7);
  const base = drivers.indexOf(anchorDriver);
  return drivers[((base + week) % drivers.length + drivers.length) % drivers.length];
}
