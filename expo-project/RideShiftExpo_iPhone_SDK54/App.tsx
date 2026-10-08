import { recordRegularPassenger } from './src/db';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';

import {
  formatDateKey,
  getSetting,
  migrateDb,
  monthKey,
  parseDateKey,
  plannedDriver,
  setSetting,
  shiftOptions,
} from './src/db';
import type { DriverName, PassengerEntry, ShiftName } from './src/types';

const PRICE_FULL = 90;
const PRICE_HALF = 45;
const LOCK_MS = 12 * 60 * 60 * 1000;
const DRIVERS: DriverName[] = ['Já', 'Tade', 'Fany'];

const AVATARS = {
  'Já': require('./assets/me.png'),
  Tade: require('./assets/tade.png'),
  Fany: require('./assets/fany.png'),
  Hanes: require('./assets/hanes.png'),
  Vorel: require('./assets/vorel.png'),
};

type Tab = 'home' | 'trips' | 'finance' | 'settings';

type DriverStat = { actual_driver: DriverName; count: number };
type PassengerTotal = { passenger_name: string; total: number; rides: number };
type MonthRow = { month: string };

function czDate(dateKey: string, withYear = true) {
  const d = parseDateKey(dateKey);
  return new Intl.DateTimeFormat('cs-CZ', {
    weekday: 'short',
    day: 'numeric',
    month: 'numeric',
    ...(withYear ? { year: 'numeric' as const } : {}),
  }).format(d);
}

function monthLabel(key: string) {
  const [y, m] = key.split('-').map(Number);
  const names = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec'];
  return `${names[(m || 1) - 1]} ${y}`;
}

function addDays(key: string, amount: number) {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + amount);
  return formatDateKey(d);
}

function formatMoney(n: number) {
  return `${Math.round(n).toLocaleString('cs-CZ')} Kč`;
}

function GlassCard({ children, style }: { children: React.ReactNode; style?: any }) {
  return (
    <LinearGradient
      colors={['rgba(255,255,255,0.50)', 'rgba(255,133,55,0.38)', 'rgba(255,255,255,0.11)', 'rgba(0,0,0,0.28)']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.glassBorder, style]}
    >
      <BlurView intensity={42} tint="dark" style={styles.glassInner}>
        <LinearGradient
          colors={['rgba(28,31,35,0.78)', 'rgba(12,14,17,0.52)', 'rgba(23,18,15,0.68)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.glassTopShine} />
        {children}
      </BlurView>
    </LinearGradient>
  );
}

function CopperButton({ label, sub, onPress, disabled, compact }: { label: string; sub?: string; onPress: () => void; disabled?: boolean; compact?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [{ opacity: disabled ? 0.38 : pressed ? 0.74 : 1, flex: compact ? undefined : 1 }]}>
      <LinearGradient colors={['#3a241b', '#17191d', '#4d2b1d']} style={[styles.copperButton, compact && { paddingHorizontal: 14 }]}>
        <Text style={styles.copperButtonLabel}>{label}</Text>
        {!!sub && <Text style={styles.copperButtonSub}>{sub}</Text>}
      </LinearGradient>
    </Pressable>
  );
}

function Avatar({ name, size = 50, accent = '#ff873e' }: { name: keyof typeof AVATARS; size?: number; accent?: string }) {
  return (
    <View style={[styles.avatarRing, { width: size, height: size, borderRadius: size / 2, borderColor: accent }]}> 
      <Image source={AVATARS[name]} contentFit="cover" style={{ width: size - 5, height: size - 5, borderRadius: (size - 5) / 2 }} />
    </View>
  );
}

function AppBackground() {
  const lines = [
    { top: 30, left: -70, width: 420, rotate: '-28deg' },
    { top: 230, left: 140, width: 430, rotate: '41deg' },
    { top: 520, left: -120, width: 470, rotate: '-17deg' },
    { top: 830, left: 40, width: 490, rotate: '28deg' },
    { top: 1180, left: -40, width: 460, rotate: '-36deg' },
  ];
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient colors={['#090b0e', '#14171a', '#07080a']} style={StyleSheet.absoluteFill} />
      {lines.map((line, i) => (
        <View key={i} style={[styles.copperLineWrap, { top: line.top, left: line.left, width: line.width, transform: [{ rotate: line.rotate }] }]}> 
          <LinearGradient colors={['transparent', '#8f3f18', '#ff7d31', '#ffcf9a', '#ff6a20', 'transparent']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.copperLine} />
        </View>
      ))}
      <LinearGradient colors={['rgba(255,112,30,0.08)', 'transparent', 'rgba(255,112,30,0.05)']} style={StyleSheet.absoluteFill} />
    </View>
  );
}

function SteeringWheel() {
  return (
    <View style={styles.wheel}>
      <View style={styles.wheelInner} />
      <View style={[styles.spoke, { transform: [{ rotate: '0deg' }] }]} />
      <View style={[styles.spoke, { transform: [{ rotate: '120deg' }] }]} />
      <View style={[styles.spoke, { transform: [{ rotate: '240deg' }] }]} />
      <View style={styles.wheelHub} />
    </View>
  );
}

function SegmentedDrivers({ value, onChange }: { value: DriverName; onChange: (d: DriverName) => void }) {
  return (
    <View style={styles.segmentRow}>
      {DRIVERS.map((d) => (
        <Pressable key={d} onPress={() => onChange(d)} style={[styles.segment, value === d && styles.segmentActive]}>
          <Text style={[styles.segmentText, value === d && { color: '#fff' }]}>{d}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function useSettings(version: number) {
  const db = useSQLiteContext();
  const [anchorDate, setAnchorDateState] = useState('2026-10-03');
  const [anchorDriver, setAnchorDriverState] = useState<DriverName>('Já');

  useEffect(() => {
    (async () => {
      setAnchorDateState(await getSetting(db, 'rotation_anchor_date', '2026-10-03'));
      setAnchorDriverState((await getSetting(db, 'rotation_anchor_driver', 'Já')) as DriverName);
    })();
  }, [db, version]);

  const saveAnchorDate = async (v: string) => {
    setAnchorDateState(v);
    await setSetting(db, 'rotation_anchor_date', v);
  };
  const saveAnchorDriver = async (v: DriverName) => {
    setAnchorDriverState(v);
    await setSetting(db, 'rotation_anchor_driver', v);
  };

  return { anchorDate, anchorDriver, saveAnchorDate, saveAnchorDriver };
}

function HomeScreen({ version, refresh, onTrips, onFinance }: { version: number; refresh: () => void; onTrips: () => void; onFinance: () => void }) {
  const db = useSQLiteContext();
  const today = formatDateKey(new Date());
  const { anchorDate, anchorDriver } = useSettings(version);
  const shifts = shiftOptions(today);
  const [shift, setShift] = useState<ShiftName>(shifts[0]);
  const [actualDriver, setActualDriver] = useState<DriverName>('Já');
  const [driverStats, setDriverStats] = useState<Record<DriverName, number>>({ 'Já': 0, Tade: 0, Fany: 0 });
  const [passengerTotals, setPassengerTotals] = useState<Record<string, number>>({ Hanes: 0, Vorel: 0 });
  const [locks, setLocks] = useState<Record<string, number>>({ Hanes: 0, Vorel: 0 });
  const [guestOpen, setGuestOpen] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestFraction, setGuestFraction] = useState(0.5);

  const plan = useMemo(() => plannedDriver(today, anchorDate, anchorDriver), [today, anchorDate, anchorDriver]);

  useEffect(() => {
    if (!shiftOptions(today).includes(shift)) setShift(shiftOptions(today)[0]);
  }, [today]);

  useEffect(() => {
    setActualDriver(plan);
  }, [plan, shift]);

  const load = async () => {
    const currentMonth = monthKey(today);
    const ds = await db.getAllAsync<DriverStat>(
      `SELECT actual_driver, COUNT(*) as count FROM drives WHERE substr(date,1,7)=? GROUP BY actual_driver`,
      currentMonth
    );
    const nextStats: Record<DriverName, number> = { 'Já': 0, Tade: 0, Fany: 0 };
    ds.forEach((r) => { nextStats[r.actual_driver] = Number(r.count); });
    setDriverStats(nextStats);

    const ps = await db.getAllAsync<PassengerTotal>(
      `SELECT passenger_name, SUM(amount) as total, SUM(fraction) as rides
       FROM passenger_entries
       WHERE substr(date,1,7)=? AND passenger_name IN ('Hanes','Vorel')
       GROUP BY passenger_name`,
      currentMonth
    );
    const nextP: Record<string, number> = { Hanes: 0, Vorel: 0 };
    ps.forEach((r) => { nextP[r.passenger_name] = Number(r.total); });
    setPassengerTotals(nextP);

    const now = Date.now();
    const nextLocks: Record<string, number> = { Hanes: 0, Vorel: 0 };
    for (const name of ['Hanes', 'Vorel']) {
      const last = await db.getFirstAsync<{ created_at: string }>(
        `SELECT created_at FROM passenger_entries
         WHERE passenger_name=? AND is_retro=0 AND is_guest=0
         ORDER BY datetime(created_at) DESC LIMIT 1`,
        name
      );
      if (last) nextLocks[name] = Math.max(0, LOCK_MS - (now - new Date(last.created_at).getTime()));
    }
    setLocks(nextLocks);
  };

  useEffect(() => { load(); }, [version, shift]);
  useEffect(() => {
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, []);

  const confirmDrive = async () => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await db.runAsync(
      `INSERT INTO drives(date,shift,planned_driver,actual_driver,created_at)
       VALUES(?,?,?,?,?)
       ON CONFLICT(date,shift) DO UPDATE SET planned_driver=excluded.planned_driver, actual_driver=excluded.actual_driver, created_at=excluded.created_at`,
      today, shift, plan, actualDriver, new Date().toISOString()
    );
    refresh();
  };

  const addPassenger = async (name: 'Hanes' | 'Vorel', fraction: number) => {
    if (locks[name] > 0) {
      Alert.alert('12hodinový zámek', `${name} už má čerstvý zápis. Zpětný zápis můžeš udělat v Přehledu jízd.`);
      return;
    }
    try {
      const saved = await recordRegularPassenger(
        db, today, shift, name, fraction, fraction * PRICE_FULL, LOCK_MS
      );
      if (!saved) {
        Alert.alert('12hodinový zámek', `${name} už má čerstvý zápis. Zpětný zápis můžeš udělat v Přehledu jízd.`);
        refresh();
        return;
      }
      refresh();
    } catch {
      Alert.alert('Zápis se nepodařil', 'Jízda nebyla uložena. Zkus to prosím znovu.');
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  };

  const addGuest = async () => {
    const name = guestName.trim();
    if (!name) return;
    await db.runAsync(
      `INSERT INTO passenger_entries(date,shift,passenger_name,fraction,amount,is_guest,is_retro,created_at)
       VALUES(?,?,?,?,?,?,?,?)`,
      today, shift, name, guestFraction, guestFraction * PRICE_FULL, 1, 0, new Date().toISOString()
    );
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setGuestName('');
    setGuestOpen(false);
    refresh();
  };

  const max = Math.max(...Object.values(driverStats));
  const min = Math.min(...Object.values(driverStats));
  const fairness = max - min;

  return (
    <ScrollView contentContainerStyle={styles.screenScroll} showsVerticalScrollIndicator={false}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.bigTitle}>Jízdy a směny</Text>
          <Text style={styles.subtitle}>Váš přehled na jednom místě</Text>
        </View>
        <View style={styles.datePill}><Text style={styles.datePillText}>▣ {czDate(today)}</Text></View>
      </View>

      <GlassCard>
        <View style={styles.heroRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionEyebrow}>DNES</Text>
            <Text style={styles.heroTitle}>{shift}</Text>
            <View style={styles.lineItem}><Text style={styles.lineIcon}>👤</Text><Text style={styles.lineLabel}>Má řídit:</Text><Text style={styles.lineValue}>{plan}</Text></View>
            <View style={styles.lineItem}><Text style={styles.lineIcon}>🚘</Text><Text style={styles.lineLabel}>Řídí:</Text><Text style={[styles.lineValue, { color: '#9af1ad' }]}>{actualDriver}</Text></View>
            <Text style={styles.rotationText}>Cyklus řidičů:  Já · Tade · Fany</Text>
          </View>
          <SteeringWheel />
        </View>
        <View style={styles.shiftRow}>
          {shifts.map((s) => (
            <Pressable key={s} onPress={() => setShift(s)} style={[styles.shiftChip, shift === s && styles.shiftChipActive]}>
              <Text style={[styles.shiftChipText, shift === s && { color: '#fff' }]}>{s}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.smallLabel}>Skutečný řidič</Text>
        <SegmentedDrivers value={actualDriver} onChange={setActualDriver} />
        <CopperButton label="✓ Potvrdit odřízenou směnu" onPress={confirmDrive} />
      </GlassCard>

      <GlassCard>
        <View style={styles.cardHeader}><Text style={styles.cardTitle}>⚖ Férovost řidičů</Text><Text style={styles.badge}>Rozdíl: {fairness} směn</Text></View>
        <View style={styles.driverGrid}>
          {DRIVERS.map((d, i) => (
            <View key={d} style={styles.driverStat}>
              <Avatar name={d} size={48} accent={['#4c9cff', '#ff843b', '#9a61ff'][i]} />
              <Text style={styles.driverName}>{d}</Text>
              <Text style={styles.driverCount}>{driverStats[d]}</Text>
              <Text style={styles.mutedMini}>směn</Text>
            </View>
          ))}
        </View>
      </GlassCard>

      <GlassCard>
        <Text style={styles.cardTitle}>◉ Platící cestující</Text>
        <View style={styles.passengerGrid}>
          {(['Hanes', 'Vorel'] as const).map((name) => (
            <View key={name} style={styles.passengerCard}>
              <View style={styles.passengerHead}><Avatar name={name} size={48} /><View><Text style={styles.passengerName}>{name}</Text><Text style={styles.mutedMini}>{formatMoney(passengerTotals[name] || 0)}</Text></View></View>
              <View style={styles.actionRow}>
                <CopperButton label="+90" sub="celá" onPress={() => addPassenger(name, 1)} disabled={locks[name] > 0} />
                <CopperButton label="+45" sub="půl" onPress={() => addPassenger(name, 0.5)} disabled={locks[name] > 0} />
              </View>
              {locks[name] > 0 && <Text style={styles.lockText}>🔒 další zápis za {Math.ceil(locks[name] / 3600000)} h</Text>}
            </View>
          ))}
          <Pressable style={styles.guestCard} onPress={() => setGuestOpen(true)}>
            <Text style={styles.guestIcon}>$</Text>
            <Text style={styles.passengerName}>Host</Text>
            <Text style={styles.mutedMini}>Jednorázový</Text>
            <Text style={styles.guestPlus}>＋</Text>
          </Pressable>
        </View>
      </GlassCard>

      <View style={styles.twoCards}>
        <GlassCard style={{ flex: 1 }}>
          <Pressable onPress={onTrips} style={styles.routeTile}>
            <Text style={styles.routeIcon}>⌁</Text><Text style={styles.routeTitle}>Přehled jízd</Text><Text style={styles.routeSub}>Datum, cestující, řidič, kdo platil</Text><Text style={styles.routeArrow}>›</Text>
          </Pressable>
        </GlassCard>
        <GlassCard style={{ flex: 0.78 }}>
          <Pressable onPress={onFinance} style={styles.routeTile}>
            <Text style={styles.routeIcon}>◫</Text><Text style={styles.routeTitle}>Finance</Text><Text style={styles.routeSub}>Souhrny a platby</Text><Text style={styles.routeArrow}>›</Text>
          </Pressable>
        </GlassCard>
      </View>

      <Modal visible={guestOpen} transparent animationType="fade" onRequestClose={() => setGuestOpen(false)}>
        <View style={styles.modalShade}>
          <GlassCard style={styles.modalCard}>
            <Text style={styles.cardTitle}>Jednorázový cestující</Text>
            <TextInput value={guestName} onChangeText={setGuestName} placeholder="Jméno" placeholderTextColor="#75787c" style={styles.input} />
            <View style={styles.actionRow}>
              <Pressable style={[styles.segment, guestFraction === 1 && styles.segmentActive]} onPress={() => setGuestFraction(1)}><Text style={styles.segmentText}>Celá · 90 Kč</Text></Pressable>
              <Pressable style={[styles.segment, guestFraction === 0.5 && styles.segmentActive]} onPress={() => setGuestFraction(0.5)}><Text style={styles.segmentText}>Půl · 45 Kč</Text></Pressable>
            </View>
            <CopperButton label="Přidat cestujícího" onPress={addGuest} />
            <Pressable onPress={() => setGuestOpen(false)} style={styles.closeLink}><Text style={styles.closeLinkText}>Zrušit</Text></Pressable>
          </GlassCard>
        </View>
      </Modal>
    </ScrollView>
  );
}

function TripsScreen({ version, refresh }: { version: number; refresh: () => void }) {
  const db = useSQLiteContext();
  const { anchorDate, anchorDriver } = useSettings(version);
  const [dateKey, setDateKey] = useState(formatDateKey(new Date()));
  const [shift, setShift] = useState<ShiftName>(shiftOptions(dateKey)[0]);
  const [entries, setEntries] = useState<PassengerEntry[]>([]);
  const [actual, setActual] = useState<DriverName | null>(null);
  const [driverChoice, setDriverChoice] = useState<DriverName>('Já');
  const [retroOpen, setRetroOpen] = useState(false);
  const [retroPassenger, setRetroPassenger] = useState('Hanes');
  const [retroFraction, setRetroFraction] = useState(1);
  const [guestName, setGuestName] = useState('');

  const plan = plannedDriver(dateKey, anchorDate, anchorDriver);

  useEffect(() => {
    const valid = shiftOptions(dateKey);
    if (!valid.includes(shift)) setShift(valid[0]);
  }, [dateKey]);

  const load = async () => {
    const r = await db.getFirstAsync<{ actual_driver: DriverName }>('SELECT actual_driver FROM drives WHERE date=? AND shift=?', dateKey, shift);
    setActual(r?.actual_driver ?? null);
    setDriverChoice(r?.actual_driver ?? plan);
    const es = await db.getAllAsync<PassengerEntry>('SELECT * FROM passenger_entries WHERE date=? AND shift=? ORDER BY id DESC', dateKey, shift);
    setEntries(es);
  };
  useEffect(() => { load(); }, [version, dateKey, shift, plan]);

  const saveDriver = async () => {
    await db.runAsync(
      `INSERT INTO drives(date,shift,planned_driver,actual_driver,created_at)
       VALUES(?,?,?,?,?) ON CONFLICT(date,shift) DO UPDATE SET planned_driver=excluded.planned_driver,actual_driver=excluded.actual_driver,created_at=excluded.created_at`,
      dateKey, shift, plan, driverChoice, new Date().toISOString()
    );
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    refresh();
  };

  const saveRetro = async () => {
    const name = retroPassenger === 'Host' ? guestName.trim() : retroPassenger;
    if (!name) return;
    await db.runAsync(
      `INSERT INTO passenger_entries(date,shift,passenger_name,fraction,amount,is_guest,is_retro,created_at)
       VALUES(?,?,?,?,?,?,?,?)`,
      dateKey, shift, name, retroFraction, retroFraction * PRICE_FULL, retroPassenger === 'Host' ? 1 : 0, 1, new Date().toISOString()
    );
    setGuestName(''); setRetroOpen(false); refresh();
  };

  return (
    <ScrollView contentContainerStyle={styles.screenScroll} showsVerticalScrollIndicator={false}>
      <Text style={styles.bigTitle}>Přehled jízd</Text>
      <Text style={styles.subtitle}>Konkrétní datum, směna a skutečný průběh</Text>

      <GlassCard>
        <View style={styles.dateNav}>
          <Pressable onPress={() => setDateKey(addDays(dateKey, -1))} style={styles.navRound}><Text style={styles.navRoundText}>‹</Text></Pressable>
          <View style={{ alignItems: 'center' }}><Text style={styles.heroTitle}>{czDate(dateKey)}</Text><Text style={styles.mutedMini}>{monthLabel(monthKey(dateKey))}</Text></View>
          <Pressable onPress={() => setDateKey(addDays(dateKey, 1))} style={styles.navRound}><Text style={styles.navRoundText}>›</Text></Pressable>
        </View>
        <View style={styles.shiftRow}>{shiftOptions(dateKey).map((s) => <Pressable key={s} onPress={() => setShift(s)} style={[styles.shiftChip, shift === s && styles.shiftChipActive]}><Text style={styles.shiftChipText}>{s}</Text></Pressable>)}</View>
      </GlassCard>

      <GlassCard>
        <Text style={styles.cardTitle}>Řízení</Text>
        <View style={styles.infoRow}><Text style={styles.lineLabel}>Měl řídit</Text><Text style={styles.infoValue}>{plan}</Text></View>
        <View style={styles.infoRow}><Text style={styles.lineLabel}>Skutečně řídil</Text><Text style={[styles.infoValue, { color: actual ? '#9af1ad' : '#969aa0' }]}>{actual ?? 'Nepotvrzeno'}</Text></View>
        <SegmentedDrivers value={driverChoice} onChange={setDriverChoice} />
        <CopperButton label="Uložit skutečného řidiče" onPress={saveDriver} />
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

      <Modal visible={retroOpen} transparent animationType="fade" onRequestClose={() => setRetroOpen(false)}>
        <View style={styles.modalShade}><GlassCard style={styles.modalCard}>
          <Text style={styles.cardTitle}>Zpětný zápis · {czDate(dateKey)}</Text>
          <View style={styles.segmentRow}>{['Hanes','Vorel','Host'].map((p) => <Pressable key={p} onPress={() => setRetroPassenger(p)} style={[styles.segment, retroPassenger === p && styles.segmentActive]}><Text style={styles.segmentText}>{p}</Text></Pressable>)}</View>
          {retroPassenger === 'Host' && <TextInput value={guestName} onChangeText={setGuestName} placeholder="Jméno hosta" placeholderTextColor="#777" style={styles.input} />}
          <View style={styles.segmentRow}><Pressable onPress={() => setRetroFraction(1)} style={[styles.segment, retroFraction === 1 && styles.segmentActive]}><Text style={styles.segmentText}>90 Kč</Text></Pressable><Pressable onPress={() => setRetroFraction(0.5)} style={[styles.segment, retroFraction === 0.5 && styles.segmentActive]}><Text style={styles.segmentText}>45 Kč</Text></Pressable></View>
          <CopperButton label="Uložit zpětně" onPress={saveRetro} />
          <Pressable onPress={() => setRetroOpen(false)} style={styles.closeLink}><Text style={styles.closeLinkText}>Zrušit</Text></Pressable>
        </GlassCard></View>
      </Modal>
    </ScrollView>
  );
}

function FinanceScreen({ version }: { version: number }) {
  const db = useSQLiteContext();
  const current = monthKey(formatDateKey(new Date()));
  const [months, setMonths] = useState<MonthRow[]>([]);
  const [selected, setSelected] = useState(current);
  const [passengers, setPassengers] = useState<PassengerTotal[]>([]);
  const [drivers, setDrivers] = useState<DriverStat[]>([]);

  useEffect(() => {
    (async () => {
      const ms = await db.getAllAsync<MonthRow>(`
        SELECT month FROM (
          SELECT DISTINCT substr(date,1,7) AS month FROM passenger_entries
          UNION SELECT DISTINCT substr(date,1,7) AS month FROM drives
        ) ORDER BY month DESC`);
      setMonths(ms.length ? ms : [{ month: current }]);
      if (ms.length && !ms.some((m) => m.month === selected)) setSelected(ms[0].month);
    })();
  }, [version]);

  useEffect(() => {
    (async () => {
      setPassengers(await db.getAllAsync<PassengerTotal>(
        `SELECT passenger_name,SUM(amount) as total,SUM(fraction) as rides FROM passenger_entries WHERE substr(date,1,7)=? GROUP BY passenger_name ORDER BY total DESC`, selected
      ));
      setDrivers(await db.getAllAsync<DriverStat>(
        `SELECT actual_driver,COUNT(*) as count FROM drives WHERE substr(date,1,7)=? GROUP BY actual_driver`, selected
      ));
    })();
  }, [selected, version]);

  const total = passengers.reduce((s, p) => s + Number(p.total), 0);

  return (
    <ScrollView contentContainerStyle={styles.screenScroll} showsVerticalScrollIndicator={false}>
      <Text style={styles.bigTitle}>Finance</Text><Text style={styles.subtitle}>Měsíční souhrny a archiv</Text>
      <GlassCard>
        <Text style={styles.sectionEyebrow}>VYBRANÝ MĚSÍC</Text><Text style={styles.heroTitle}>{monthLabel(selected)}</Text><Text style={styles.financeBig}>{formatMoney(total)}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 12 }}>
          {months.map((m) => <Pressable key={m.month} onPress={() => setSelected(m.month)} style={[styles.shiftChip, selected === m.month && styles.shiftChipActive]}><Text style={styles.shiftChipText}>{monthLabel(m.month)}</Text></Pressable>)}
        </ScrollView>
      </GlassCard>
      <GlassCard>
        <Text style={styles.cardTitle}>Platící cestující</Text>
        {passengers.length === 0 ? <Text style={styles.emptyText}>Žádné platby.</Text> : passengers.map((p) => <View key={p.passenger_name} style={styles.entryRow}><View><Text style={styles.entryName}>{p.passenger_name}</Text><Text style={styles.mutedMini}>{Number(p.rides).toLocaleString('cs-CZ')} jízd</Text></View><Text style={styles.entryMoney}>{formatMoney(Number(p.total))}</Text></View>)}
      </GlassCard>
      <GlassCard>
        <Text style={styles.cardTitle}>Odřízené směny</Text>
        <View style={styles.driverGrid}>{DRIVERS.map((d) => { const count = Number(drivers.find((x) => x.actual_driver === d)?.count ?? 0); return <View key={d} style={styles.driverStat}><Avatar name={d} size={46}/><Text style={styles.driverName}>{d}</Text><Text style={styles.driverCount}>{count}</Text><Text style={styles.mutedMini}>směn</Text></View>; })}</View>
      </GlassCard>
      <Text style={styles.archiveNote}>Každý nový měsíc vzniká automaticky. Starší měsíce zůstávají v tomto archivu a nic se nemaže.</Text>
    </ScrollView>
  );
}

function SettingsScreen({ version, refresh }: { version: number; refresh: () => void }) {
  const { anchorDate, anchorDriver, saveAnchorDate, saveAnchorDriver } = useSettings(version);
  const [dateDraft, setDateDraft] = useState(anchorDate);
  useEffect(() => setDateDraft(anchorDate), [anchorDate]);

  const saveDate = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateDraft)) {
      Alert.alert('Datum', 'Použij formát RRRR-MM-DD, například 2026-10-03.'); return;
    }
    await saveAnchorDate(dateDraft); refresh();
  };

  return (
    <ScrollView contentContainerStyle={styles.screenScroll} showsVerticalScrollIndicator={false}>
      <Text style={styles.bigTitle}>Nastavení</Text><Text style={styles.subtitle}>Kolotoč a lokální data</Text>
      <GlassCard>
        <Text style={styles.cardTitle}>Kolotoč řidičů</Text>
        <Text style={styles.smallLabel}>Začátek 7denního cyklu</Text>
        <TextInput value={dateDraft} onChangeText={setDateDraft} onEndEditing={saveDate} style={styles.input} keyboardType="numbers-and-punctuation" />
        <Text style={styles.smallLabel}>První řidič</Text>
        <SegmentedDrivers value={anchorDriver} onChange={async (d) => { await saveAnchorDriver(d); refresh(); }} />
        <Text style={styles.archiveNote}>Rotace běží po 7 dnech: Já → Tade → Fany → Já. Skutečné řízení se počítá zvlášť až po potvrzení směny.</Text>
      </GlassCard>
      <GlassCard>
        <Text style={styles.cardTitle}>Úložiště</Text>
        <Text style={styles.archiveNote}>Záznamy jsou ukládány lokálně v SQLite databázi aplikace a zůstávají po zavření i restartu. Později doplníme export/import zálohy.</Text>
      </GlassCard>
    </ScrollView>
  );
}

function BottomDock({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const items: { tab: Tab; icon: string; label: string }[] = [
    { tab: 'home', icon: '⌂', label: 'Domů' },
    { tab: 'trips', icon: '▣', label: 'Jízdy' },
    { tab: 'finance', icon: '▥', label: 'Finance' },
    { tab: 'settings', icon: '⚙', label: 'Nastavení' },
  ];
  return (
    <LinearGradient colors={['rgba(255,255,255,0.46)', 'rgba(255,133,55,0.22)', 'rgba(255,255,255,0.08)']} style={styles.dockBorder}>
      <BlurView intensity={50} tint="dark" style={styles.dock}>
        {items.map((it) => (
          <Pressable key={it.tab} onPress={() => setTab(it.tab)} style={[styles.dockItem, tab === it.tab && styles.dockItemActive]} accessibilityLabel={it.label}>
            <Text style={[styles.dockIcon, tab === it.tab && { color: '#ffd8ba' }]}>{it.icon}</Text>
          </Pressable>
        ))}
      </BlurView>
    </LinearGradient>
  );
}

function MainApp() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('home');
  const [version, setVersion] = useState(0);
  const refresh = () => setVersion((v) => v + 1);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <AppBackground />
      <View style={{ flex: 1, paddingTop: insets.top }}>
        {tab === 'home' && <HomeScreen version={version} refresh={refresh} onTrips={() => setTab('trips')} onFinance={() => setTab('finance')} />}
        {tab === 'trips' && <TripsScreen version={version} refresh={refresh} />}
        {tab === 'finance' && <FinanceScreen version={version} />}
        {tab === 'settings' && <SettingsScreen version={version} refresh={refresh} />}
      </View>
      <View style={[styles.dockPosition, { bottom: Math.max(insets.bottom, 8) }]}><BottomDock tab={tab} setTab={setTab} /></View>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <SQLiteProvider databaseName="jizdy-a-smeny.db" onInit={migrateDb}>
        <MainApp />
      </SQLiteProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080a0d' },
  screenScroll: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 124, gap: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 2 },
  bigTitle: { color: '#fff', fontSize: 33, fontWeight: '800', letterSpacing: -1.1 },
  subtitle: { color: '#b8bcc2', fontSize: 15, marginTop: 1 },
  datePill: { backgroundColor: 'rgba(16,18,21,0.76)', borderWidth: 1, borderColor: 'rgba(255,186,137,0.46)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 9 },
  datePillText: { color: '#e8eaed', fontSize: 13 },
  copperLineWrap: { position: 'absolute', height: 24, opacity: 0.95 },
  copperLine: { flex: 1, borderRadius: 20, shadowColor: '#ff6a20', shadowOpacity: 0.9, shadowRadius: 18 },
  glassBorder: { borderRadius: 27, padding: 1.2, shadowColor: '#000', shadowOpacity: 0.72, shadowRadius: 18, shadowOffset: { width: 0, height: 12 }, overflow: 'hidden' },
  glassInner: { borderRadius: 26, overflow: 'hidden', padding: 15, backgroundColor: 'rgba(9,11,13,0.44)' },
  glassTopShine: { position: 'absolute', left: 18, right: 18, top: 1, height: 1.3, backgroundColor: 'rgba(255,255,255,0.72)' },
  sectionEyebrow: { color: '#b9bdc3', fontSize: 12, fontWeight: '700', letterSpacing: 1.3 },
  heroTitle: { color: '#ff8b45', fontSize: 25, fontWeight: '800', marginTop: 2 },
  heroRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  lineItem: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 11 },
  lineIcon: { fontSize: 16 }, lineLabel: { color: '#cfd2d6', fontSize: 14 }, lineValue: { color: '#fff', fontSize: 15, fontWeight: '800' },
  rotationText: { color: '#d7d9dd', fontSize: 13, marginTop: 13 },
  wheel: { width: 114, height: 114, borderRadius: 57, borderWidth: 8, borderColor: '#8b552f', alignItems: 'center', justifyContent: 'center', shadowColor: '#ff7a2f', shadowOpacity: 0.9, shadowRadius: 14 },
  wheelInner: { position: 'absolute', width: 72, height: 72, borderRadius: 36, borderWidth: 5, borderColor: '#d8c5b7' },
  spoke: { position: 'absolute', width: 7, height: 45, backgroundColor: '#8b6e5d', borderRadius: 5 },
  wheelHub: { width: 33, height: 33, borderRadius: 10, backgroundColor: '#1b1b1c', borderWidth: 2, borderColor: '#c99b7c' },
  shiftRow: { flexDirection: 'row', gap: 7, marginTop: 14, flexWrap: 'wrap' },
  shiftChip: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.13)' },
  shiftChipActive: { backgroundColor: 'rgba(255,119,45,0.24)', borderColor: '#ff8a42' }, shiftChipText: { color: '#c7c9cd', fontSize: 12, fontWeight: '700' },
  smallLabel: { color: '#a6aab0', fontSize: 12, fontWeight: '700', marginTop: 14, marginBottom: 7 },
  segmentRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  segment: { flex: 1, minHeight: 42, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  segmentActive: { borderColor: '#ff8640', backgroundColor: 'rgba(255,118,43,0.23)' }, segmentText: { color: '#c5c9ce', fontWeight: '700', fontSize: 12 },
  copperButton: { borderRadius: 15, minHeight: 46, paddingHorizontal: 10, paddingVertical: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,178,125,0.70)', shadowColor: '#ff7b2e', shadowOpacity: 0.48, shadowRadius: 8 },
  copperButtonLabel: { color: '#fff7f0', fontWeight: '800', fontSize: 14 }, copperButtonSub: { color: '#d0b8a8', fontSize: 10, marginTop: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }, cardTitle: { color: '#fff', fontSize: 20, fontWeight: '800' },
  badge: { color: '#ffd2b2', backgroundColor: 'rgba(255,112,36,0.15)', borderWidth: 1, borderColor: 'rgba(255,142,71,0.45)', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 15, fontSize: 11, fontWeight: '700' },
  driverGrid: { flexDirection: 'row', gap: 8, marginTop: 13 }, driverStat: { flex: 1, alignItems: 'center', paddingVertical: 10, paddingHorizontal: 4, borderRadius: 18, backgroundColor: 'rgba(3,8,12,0.52)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  avatarRing: { borderWidth: 2, alignItems: 'center', justifyContent: 'center', backgroundColor: '#101317', overflow: 'hidden', shadowColor: '#ff7f34', shadowOpacity: 0.45, shadowRadius: 5 },
  driverName: { color: '#f4f5f6', fontWeight: '700', marginTop: 5, fontSize: 12 }, driverCount: { color: '#fff', fontSize: 25, fontWeight: '900', lineHeight: 28 }, mutedMini: { color: '#a9adb2', fontSize: 11 },
  passengerGrid: { flexDirection: 'row', gap: 8, marginTop: 12 }, passengerCard: { flex: 1.2, padding: 10, borderRadius: 18, backgroundColor: 'rgba(3,8,12,0.52)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  passengerHead: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 8 }, passengerName: { color: '#fff', fontSize: 14, fontWeight: '800' }, actionRow: { flexDirection: 'row', gap: 7 }, lockText: { color: '#ffb681', fontSize: 9, marginTop: 6 },
  guestCard: { flex: 0.72, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(3,8,12,0.52)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', padding: 8 }, guestIcon: { color: '#ff8b43', fontSize: 25, fontWeight: '900' }, guestPlus: { color: '#ff9a59', fontSize: 23, marginTop: 5 },
  twoCards: { flexDirection: 'row', gap: 10 }, routeTile: { minHeight: 150, justifyContent: 'center' }, routeIcon: { color: '#ff8a42', fontSize: 32, fontWeight: '900' }, routeTitle: { color: '#fff', fontSize: 18, fontWeight: '800', marginTop: 6 }, routeSub: { color: '#c0c3c7', fontSize: 12, marginTop: 4, paddingRight: 18 }, routeArrow: { position: 'absolute', right: 4, bottom: 0, color: '#fff', fontSize: 40, fontWeight: '200' },
  modalShade: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'center', padding: 18 }, modalCard: { width: '100%' }, input: { minHeight: 48, borderRadius: 14, color: '#fff', backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)', paddingHorizontal: 13, fontSize: 16, marginVertical: 12 }, closeLink: { alignItems: 'center', paddingTop: 14 }, closeLinkText: { color: '#aeb2b7', fontSize: 13 },
  dateNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, navRound: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)', backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' }, navRoundText: { color: '#fff', fontSize: 30, lineHeight: 32 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.08)' }, infoValue: { color: '#fff', fontWeight: '800' }, textLink: { color: '#ff9a59', fontWeight: '700', fontSize: 12 }, emptyText: { color: '#9da1a6', paddingVertical: 16 }, entryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.10)' }, entryName: { color: '#fff', fontSize: 15, fontWeight: '700' }, entryMoney: { color: '#ffd1af', fontSize: 15, fontWeight: '900' }, financeBig: { color: '#fff', fontSize: 38, fontWeight: '900', marginTop: 8 }, archiveNote: { color: '#a4a8ae', fontSize: 12, lineHeight: 18, paddingHorizontal: 4, marginTop: 8 },
  dockPosition: { position: 'absolute', left: 18, right: 18 }, dockBorder: { borderRadius: 31, padding: 1.2, shadowColor: '#000', shadowOpacity: 0.75, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } }, dock: { borderRadius: 30, height: 74, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', overflow: 'hidden', backgroundColor: 'rgba(12,14,17,0.54)' }, dockItem: { width: 62, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }, dockItemActive: { backgroundColor: 'rgba(255,120,45,0.20)', borderWidth: 1, borderColor: 'rgba(255,179,128,0.42)' }, dockIcon: { color: '#cbd0d5', fontSize: 29, fontWeight: '800' },
});
