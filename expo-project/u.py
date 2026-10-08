O#!/usr/bin/env python3
"""Upgrade UI of the October 8th Expo SDK 57 version of Jízdy a směny.

Usage: python3 update_jizdy.py [path/to/App.tsx]
Safe: validates original anchors before writing; stores one .bak copy; idempotent.
"""
from pathlib import Path
import hashlib, sys

DEFAULT = Path('expo-project/RideShiftExpo_iPhone_SDK54/App.tsx')
TARGET = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT
if not TARGET.is_file():
    print(f'CHYBA: Nenalezen {TARGET}. Otevři terminál v kořeni repozitáře.', file=sys.stderr)
    raise SystemExit(2)
original = TARGET.read_text(encoding='utf-8')
FLAG = '// UI UPGRADE: driver-avatar + monthly trips + modal actions (2026-10-08)'
if FLAG in original:
    print('Aktualizace již byla použita. Nic se nemění.')
    raise SystemExit(0)

source = original

def replace_once(old: str, new: str, label: str):
    global source
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f'Kontrola selhala ({label}): očekáván 1 výskyt, nalezeno {count}. Soubor nebyl změněn.')
    source = source.replace(old, new, 1)

def replace_section(begin: str, end: str, replacement: str, label: str):
    global source
    if source.count(begin) != 1 or source.count(end) != 1:
        raise RuntimeError(f'Kontrola sekce selhala ({label}). Soubor nebyl změněn.')
    i = source.index(begin)
    j = source.index(end, i)
    source = source[:i] + replacement.rstrip() + '\n\n' + source[j:]

replace_once("type MonthRow = { month: string };",
"""type MonthRow = { month: string };
// UI UPGRADE: driver-avatar + monthly trips + modal actions (2026-10-08)
type HistoryMode = 'day' | 'month';
type MonthlyShift = {
  date: string;
  shift: ShiftName;
  actual_driver: DriverName | null;
  passenger_count: number;
  total: number;
};""",'types')

replace_once('function formatMoney(n: number) {',
"""function shiftMonth(key: string, amount: number) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + amount, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function formatMoney(n: number) {""",'month navigation')

replace_section('function SteeringWheel() {', 'function SegmentedDrivers(', '''function SteeringWheel({ driver, confirmed }: { driver: DriverName; confirmed: boolean }) {
  const colors: Record<DriverName, string> = { 'Já': '#4c9cff', Tade: '#ff843b', Fany: '#9a61ff' };
  return (
    <View style={styles.driverWheelWrap} accessibilityLabel={`Vybraný řidič: ${driver}${confirmed ? ', potvrzeno' : ', nepotvrzeno'}`}>
      <View style={styles.driverWheelRing}>
        <Avatar name={driver} size={84} accent={colors[driver]} />
        {confirmed && <View style={styles.driverWheelCheck}><Text style={styles.driverWheelCheckText}>✓</Text></View>}
      </View>
      <Text style={[styles.driverWheelStatus, confirmed && styles.driverWheelStatusConfirmed]}>
        {confirmed ? 'POTVRZENO' : 'VYBRANÝ ŘIDIČ'}
      </Text>
    </View>
  );
}''','steering wheel')

replace_once("  const [actualDriver, setActualDriver] = useState<DriverName>('Já');",
"  const [actualDriver, setActualDriver] = useState<DriverName>('Já');\n  const [confirmedDriver, setConfirmedDriver] = useState<DriverName | null>(null);",'driver confirmation state')

replace_once('''  useEffect(() => {
    setActualDriver(plan);
  }, [plan, shift]);''', '''  useEffect(() => {
    let active = true;
    (async () => {
      const recorded = await db.getFirstAsync<{ actual_driver: DriverName }>(
        'SELECT actual_driver FROM drives WHERE date=? AND shift=?', today, shift
      );
      if (active) {
        setConfirmedDriver(recorded?.actual_driver ?? null);
        setActualDriver(recorded?.actual_driver ?? plan);
      }
    })().catch(() => { if (active) setConfirmedDriver(null); });
    return () => { active = false; };
  }, [db, today, shift, plan, version]);''','driver confirmation load')

replace_once('''    refresh();
  };

  const addPassenger''', '''    setConfirmedDriver(actualDriver);
    refresh();
  };

  const addPassenger''','persist driver confirmation')

replace_once('''          <SteeringWheel />''', '''          <SteeringWheel driver={actualDriver} confirmed={confirmedDriver === actualDriver} />''','dynamic avatar')
replace_once('''        <CopperButton label="✓ Potvrdit odřízenou směnu" onPress={confirmDrive} />''',
'''        <CopperButton
          label={confirmedDriver === actualDriver ? '✓ Směna potvrzena' : '✓ Potvrdit odřízenou směnu'}
          onPress={confirmDrive}
          disabled={confirmedDriver === actualDriver}
        />''','confirmation button')

# Address the same vertical-button flex issue in the guest sheet as well.
replace_once('''            <CopperButton label="Přidat cestujícího" onPress={addGuest} />
            <Pressable onPress={() => setGuestOpen(false)} style={styles.closeLink}><Text style={styles.closeLinkText}>Zrušit</Text></Pressable>''',
'''            <View style={styles.modalActions}>
              <View style={styles.modalPrimaryAction}><CopperButton label="Přidat cestujícího" onPress={addGuest} compact /></View>
              <Pressable onPress={() => setGuestOpen(false)} style={styles.modalCancelAction}><Text style={styles.closeLinkText}>Zrušit</Text></Pressable>
            </View>''','guest modal controls')

trips = r'''function TripsScreen({ version, refresh }: { version: number; refresh: () => void }) {
  const db = useSQLiteContext();
  const { anchorDate, anchorDriver } = useSettings(version);
  const [mode, setMode] = useState<HistoryMode>('day');
  const [dateKey, setDateKey] = useState(formatDateKey(new Date()));
  const [selectedMonth, setSelectedMonth] = useState(monthKey(formatDateKey(new Date())));
  const [shift, setShift] = useState<ShiftName>(shiftOptions(dateKey)[0]);
  const [entries, setEntries] = useState<PassengerEntry[]>([]);
  const [monthlyShifts, setMonthlyShifts] = useState<MonthlyShift[]>([]);
  const [actual, setActual] = useState<DriverName | null>(null);
  const [driverChoice, setDriverChoice] = useState<DriverName>('Já');
  const [retroOpen, setRetroOpen] = useState(false);
  const [retroPassenger, setRetroPassenger] = useState('Hanes');
  const [retroFraction, setRetroFraction] = useState(1);
  const [guestName, setGuestName] = useState('');
  const [retroSaving, setRetroSaving] = useState(false);
  const plan = plannedDriver(dateKey, anchorDate, anchorDriver);

  useEffect(() => {
    const valid = shiftOptions(dateKey);
    if (!valid.includes(shift)) setShift(valid[0]);
  }, [dateKey, shift]);

  useEffect(() => {
    if (mode !== 'day') return;
    let active = true;
    (async () => {
      const r = await db.getFirstAsync<{ actual_driver: DriverName }>(
        'SELECT actual_driver FROM drives WHERE date=? AND shift=?', dateKey, shift
      );
      const es = await db.getAllAsync<PassengerEntry>(
        'SELECT * FROM passenger_entries WHERE date=? AND shift=? ORDER BY id DESC', dateKey, shift
      );
      if (!active) return;
      setActual(r?.actual_driver ?? null);
      setDriverChoice(r?.actual_driver ?? plan);
      setEntries(es);
    })().catch(() => { if (active) Alert.alert('Načítání jízd', 'Záznamy se nepodařilo načíst.'); });
    return () => { active = false; };
  }, [db, version, dateKey, shift, plan, mode]);

  useEffect(() => {
    if (mode !== 'month') return;
    let active = true;
    (async () => {
      const rows = await db.getAllAsync<MonthlyShift>(
        `SELECT days.date, days.shift, d.actual_driver,
                COUNT(p.id) AS passenger_count,
                COALESCE(SUM(p.amount), 0) AS total
         FROM (
           SELECT date,shift FROM drives WHERE substr(date,1,7)=?
           UNION
           SELECT date,shift FROM passenger_entries WHERE substr(date,1,7)=?
         ) days
         LEFT JOIN drives d ON d.date=days.date AND d.shift=days.shift
         LEFT JOIN passenger_entries p ON p.date=days.date AND p.shift=days.shift
         GROUP BY days.date,days.shift,d.actual_driver
         ORDER BY days.date DESC,
                  CASE days.shift WHEN 'Ranní' THEN 1 WHEN 'Odpolední' THEN 2
                       WHEN 'Noční' THEN 3 WHEN 'Sobota 12 h' THEN 4 ELSE 5 END`,
        selectedMonth, selectedMonth
      );
      if (active) setMonthlyShifts(rows);
    })().catch(() => { if (active) Alert.alert('Měsíční historie', 'Záznamy se nepodařilo načíst.'); });
    return () => { active = false; };
  }, [db, version, selectedMonth, mode]);

  const saveDriver = async () => {
    try {
      await db.runAsync(
        `INSERT INTO drives(date,shift,planned_driver,actual_driver,created_at)
         VALUES(?,?,?,?,?) ON CONFLICT(date,shift)
         DO UPDATE SET planned_driver=excluded.planned_driver,
                       actual_driver=excluded.actual_driver, created_at=excluded.created_at`,
        dateKey, shift, plan, driverChoice, new Date().toISOString()
      );
      setActual(driverChoice);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      refresh();
    } catch { Alert.alert('Uložení řidiče', 'Řidiče se nepodařilo uložit.'); }
  };

  const saveRetro = async () => {
    if (retroSaving) return;
    const name = retroPassenger === 'Host' ? guestName.trim() : retroPassenger;
    if (!name) { Alert.alert('Jméno', 'Zadej jméno hosta.'); return; }
    setRetroSaving(true);
    try {
      await db.runAsync(
        `INSERT INTO passenger_entries(date,shift,passenger_name,fraction,amount,is_guest,is_retro,created_at)
         VALUES(?,?,?,?,?,?,?,?)`,
        dateKey, shift, name, retroFraction, retroFraction * PRICE_FULL,
        retroPassenger === 'Host' ? 1 : 0, 1, new Date().toISOString()
      );
      setGuestName('');
      setRetroOpen(false);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      refresh();
    } catch { Alert.alert('Zpětný zápis', 'Záznam se nepodařilo uložit.'); }
    finally { setRetroSaving(false); }
  };

  const openDay = (date: string, selectedShift: ShiftName) => {
    setDateKey(date);
    setShift(selectedShift);
    setMode('day');
  };
  const monthTotal = monthlyShifts.reduce((total, item) => total + Number(item.total || 0), 0);
  const monthPassengers = monthlyShifts.reduce((total, item) => total + Number(item.passenger_count || 0), 0);

  return (
    <ScrollView contentContainerStyle={styles.screenScroll} showsVerticalScrollIndicator={false}>
      <Text style={styles.bigTitle}>Přehled jízd</Text>
      <Text style={styles.subtitle}>Historie jízd, směn a cestujících</Text>

      <GlassCard>
        <View style={styles.segmentRow}>
          <Pressable onPress={() => setMode('day')}
            style={[styles.segment, mode === 'day' && styles.segmentActive]}>
            <Text style={[styles.segmentText, mode === 'day' && styles.activeSegmentText]}>Denní náhled</Text>
          </Pressable>
          <Pressable onPress={() => { setSelectedMonth(monthKey(dateKey)); setMode('month'); }}
            style={[styles.segment, mode === 'month' && styles.segmentActive]}>
            <Text style={[styles.segmentText, mode === 'month' && styles.activeSegmentText]}>Kompletní měsíc</Text>
          </Pressable>
        </View>
        {mode === 'day' ? <>
          <View style={styles.dateNav}>
            <Pressable accessibilityLabel="Předchozí den" onPress={() => setDateKey(addDays(dateKey, -1))} style={styles.navRound}><Text style={styles.navRoundText}>‹</Text></Pressable>
            <View style={{ alignItems: 'center', flexShrink: 1 }}><Text style={styles.heroTitle}>{czDate(dateKey)}</Text><Text style={styles.mutedMini}>{monthLabel(monthKey(dateKey))}</Text></View>
            <Pressable accessibilityLabel="Další den" onPress={() => setDateKey(addDays(dateKey, 1))} style={styles.navRound}><Text style={styles.navRoundText}>›</Text></Pressable>
          </View>
          <View style={styles.shiftRow}>{shiftOptions(dateKey).map((s) => (
            <Pressable key={s} onPress={() => setShift(s)} style={[styles.shiftChip, shift === s && styles.shiftChipActive]}><Text style={styles.shiftChipText}>{s}</Text></Pressable>
          ))}</View>
        </> : <>
          <View style={styles.dateNav}>
            <Pressable accessibilityLabel="Předchozí měsíc" onPress={() => setSelectedMonth(shiftMonth(selectedMonth, -1))} style={styles.navRound}><Text style={styles.navRoundText}>‹</Text></Pressable>
            <Text style={styles.heroTitle}>{monthLabel(selectedMonth)}</Text>
            <Pressable accessibilityLabel="Další měsíc" onPress={() => setSelectedMonth(shiftMonth(selectedMonth, 1))} style={styles.navRound}><Text style={styles.navRoundText}>›</Text></Pressable>
          </View>
        </>}
      </GlassCard>

      {mode === 'day' ? <>
        <GlassCard>
          <Text style={styles.cardTitle}>Řízení</Text>
          <View style={styles.infoRow}><Text style={styles.lineLabel}>Měl řídit</Text><Text style={styles.infoValue}>{plan}</Text></View>
          <View style={styles.infoRow}><Text style={styles.lineLabel}>Skutečně řídil</Text><Text style={[styles.infoValue, { color: actual ? '#9af1ad' : '#969aa0' }]}>{actual ?? 'Nepotvrzeno'}</Text></View>
          <SegmentedDrivers value={driverChoice} onChange={setDriverChoice} />
          <CopperButton label="Uložit skutečného řidiče" onPress={saveDriver} disabled={actual === driverChoice} />
        </GlassCard>
        <GlassCard>
          <View style={styles.cardHeader}><Text style={styles.cardTitle}>Cestující</Text><Pressable onPress={() => setRetroOpen(true)}><Text style={styles.textLink}>＋ Zpětný zápis</Text></Pressable></View>
          {entries.length === 0 ? <Text style={styles.emptyText}>Pro tuto směnu zatím není žádný záznam.</Text> : entries.map((e) => (
            <View key={e.id} style={styles.entryRow}>
              <View><Text style={styles.entryName}>{e.passenger_name}</Text><Text style={styles.mutedMini}>{e.is_retro ? 'zpětně · ' : ''}{e.fraction === 1 ? 'celá jízda' : 'půl jízdy'}</Text></View>
              <Text style={styles.entryMoney}>{formatMoney(e.amount)}</Text>
            </View>
          ))}
        </GlassCard>
      </> : <>
        <GlassCard>
          <Text style={styles.cardTitle}>Souhrn měsíce</Text>
          <View style={styles.infoRow}><Text style={styles.lineLabel}>Zaznamenané směny</Text><Text style={styles.infoValue}>{monthlyShifts.length}</Text></View>
          <View style={styles.infoRow}><Text style={styles.lineLabel}>Zápisy cestujících</Text><Text style={styles.infoValue}>{monthPassengers}</Text></View>
          <Text style={styles.financeBig}>{formatMoney(monthTotal)}</Text>
        </GlassCard>
        <GlassCard>
          <Text style={styles.cardTitle}>Všechny záznamy</Text>
          {monthlyShifts.length === 0 ? <Text style={styles.emptyText}>V tomto měsíci zatím nejsou žádné jízdy ani potvrzené směny.</Text> : monthlyShifts.map((r, i) => (
            <React.Fragment key={`${r.date}-${r.shift}`}>
              {(i === 0 || monthlyShifts[i - 1].date !== r.date) && <Text style={styles.monthDayTitle}>{czDate(r.date)}</Text>}
              <Pressable onPress={() => openDay(r.date, r.shift)} style={styles.monthTripRow} accessibilityLabel={`Otevřít ${czDate(r.date)} ${r.shift}`}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.entryName}>{r.shift}  ›</Text>
                  <Text style={styles.mutedMini}>Řidič: {r.actual_driver ?? 'nepotvrzen'} · {Number(r.passenger_count)} zápisů</Text>
                </View>
                <Text style={styles.entryMoney}>{formatMoney(Number(r.total))}</Text>
              </Pressable>
            </React.Fragment>
          ))}
        </GlassCard>
      </>}

      <Modal visible={retroOpen} transparent animationType="fade" onRequestClose={() => setRetroOpen(false)}>
        <View style={styles.modalShade}><GlassCard style={styles.modalCard}>
          <Text style={styles.cardTitle}>Zpětný zápis · {czDate(dateKey)}</Text>
          <View style={styles.segmentRow}>{['Hanes','Vorel','Host'].map((p) => <Pressable key={p} onPress={() => setRetroPassenger(p)} style={[styles.segment, retroPassenger === p && styles.segmentActive]}><Text style={styles.segmentText}>{p}</Text></Pressable>)}</View>
          {retroPassenger === 'Host' && <TextInput value={guestName} onChangeText={setGuestName} placeholder="Jméno hosta" placeholderTextColor="#777" style={styles.input} />}
          <View style={styles.segmentRow}>
            <Pressable onPress={() => setRetroFraction(1)} style={[styles.segment, retroFraction === 1 && styles.segmentActive]}><Text style={styles.segmentText}>90 Kč</Text></Pressable>
            <Pressable onPress={() => setRetroFraction(0.5)} style={[styles.segment, retroFraction === 0.5 && styles.segmentActive]}><Text style={styles.segmentText}>45 Kč</Text></Pressable>
          </View>
          <View style={styles.modalActions}>
            <View style={styles.modalPrimaryAction}><CopperButton label={retroSaving ? 'Ukládám…' : 'Uložit zpětně'} onPress={saveRetro} compact disabled={retroSaving} /></View>
            <Pressable disabled={retroSaving} onPress={() => setRetroOpen(false)} style={styles.modalCancelAction}><Text style={styles.closeLinkText}>Zrušit</Text></Pressable>
          </View>
        </GlassCard></View>
      </Modal>
    </ScrollView>
  );
}
'''
replace_section('function TripsScreen(', 'function FinanceScreen(', trips, 'TripsScreen')

replace_once('''  dockPosition: { position: 'absolute' ''', '''  dockPosition: { position: 'absolute' ''', 'dock marker sanity') if False else None
styles = r'''  driverWheelWrap: { width: 124, alignItems: 'center', justifyContent: 'center', paddingVertical: 3 },
  driverWheelRing: { width: 112, height: 112, borderRadius: 56, borderWidth: 5, borderColor: '#a36b43', alignItems: 'center', justifyContent: 'center', backgroundColor: '#11141a', shadowColor: '#ff843b', shadowOpacity: 0.5, shadowRadius: 12 },
  driverWheelCheck: { position: 'absolute', right: -2, bottom: -2, width: 27, height: 27, borderRadius: 14, backgroundColor: '#368456', borderWidth: 2, borderColor: '#c3efd0', justifyContent: 'center', alignItems: 'center' },
  driverWheelCheckText: { color: '#fff', fontWeight: '900', fontSize: 16 },
  driverWheelStatus: { color: '#d2a07e', fontSize: 9, fontWeight: '800', marginTop: 7, textAlign: 'center', letterSpacing: 0.7 },
  driverWheelStatusConfirmed: { color: '#9af1ad' },
  activeSegmentText: { color: '#fff' },
  monthDayTitle: { color: '#ffb47f', fontWeight: '800', fontSize: 14, marginTop: 17, marginBottom: 4 },
  monthTripRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 62, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.12)' },
  modalActions: { width: '100%', marginTop: 9, gap: 11 },
  modalPrimaryAction: { width: '100%', alignSelf: 'stretch' },
  modalCancelAction: { minHeight: 48, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)', backgroundColor: 'rgba(255,255,255,0.04)', justifyContent: 'center', alignItems: 'center' },
'''
replace_once('''  root: { flex: 1, backgroundColor: '#080a0d' },''',
'''  root: { flex: 1, backgroundColor: '#080a0d' },
''' + styles.rstrip(), 'styles')

# Keep existing SQLite schema, imports and assets untouched.
backup_dir = Path.home() / '.local' / 'share' / 'jizdy-backups'
backup_dir.mkdir(parents=True, exist_ok=True)
backup_id = hashlib.sha256(str(TARGET.resolve()).encode()).hexdigest()[:10]
backup = backup_dir / f'App-20261008-{backup_id}.tsx.bak'
if backup.exists() and backup.read_text(encoding='utf-8') != original:
    raise RuntimeError(f'Záloha {backup} již existuje s jiným obsahem. Nic nezměněno.')
if not backup.exists():
    backup.write_text(original, encoding='utf-8')
TARGET.write_text(source, encoding='utf-8')
print(f'HOTOVO: aktualizován {TARGET}. Původní verze: {backup.name}')
print('Změny: Den/Měsíc, dynamický avatar řidiče, stav potvrzení, oddělená tlačítka modalů.')
