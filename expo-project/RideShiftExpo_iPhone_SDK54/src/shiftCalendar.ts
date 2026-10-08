// CALENDAR+STORNO V2: 28denní tovární rotace. V=volno, R=ranní, O=odpolední, N=noční.
// Zdroj: snímky Šichtovníku Continental Barum pro září–říjen 2026.
// Individuální přesčasy skupiny C nejsou součástí vzorce.
export type WorkGroup = 'A' | 'B' | 'C' | 'D';
export type WorkCode = 'R' | 'O' | 'N' | 'V';
export const WORK_GROUPS: WorkGroup[] = ['A', 'B', 'C', 'D'];
export const SHIFT_ANCHOR = '2026-10-05';
const repeat = (symbol: string, count: number) => symbol.repeat(count);
const patterns: Record<WorkGroup, string> = {
  A: repeat('O', 5) + repeat('V', 2) + repeat('R', 4) + repeat('N', 3) + repeat('V', 4) + repeat('R', 3) + repeat('N', 4) + repeat('V', 3),
  B: repeat('N', 4) + repeat('V', 3) + repeat('O', 5) + repeat('V', 2) + repeat('R', 4) + repeat('N', 3) + repeat('V', 4) + repeat('R', 3),
  C: repeat('V', 4) + repeat('R', 3) + repeat('N', 4) + repeat('V', 3) + repeat('O', 5) + repeat('V', 2) + repeat('R', 4) + repeat('N', 3),
  D: repeat('R', 4) + repeat('N', 3) + repeat('V', 4) + repeat('R', 3) + repeat('N', 4) + repeat('V', 3) + repeat('O', 5) + repeat('V', 2),
};
function utcDay(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
}
export function workCodeForDate(key: string, group: WorkGroup): WorkCode {
  const offset = utcDay(key) - utcDay(SHIFT_ANCHOR);
  const index = ((offset % 28) + 28) % 28;
  return patterns[group][index] as WorkCode;
}
export function workCodeLabel(code: WorkCode) {
  return ({ R: 'Ranní', O: 'Odpolední', N: 'Noční', V: 'Volno' } as const)[code];
}
export function workShiftName(code: WorkCode, _dateKey: string) {
  if (code === 'V') return null;
  // I při sobotní 12h směně zachováme druh směny, aby se nezaměnily dvě skupiny.
  return ({ R: 'Ranní', O: 'Odpolední', N: 'Noční' } as const)[code];
}
