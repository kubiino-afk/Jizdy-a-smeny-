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


type DriverName = 'Já' | 'Tade' | 'Fany';
type PassengerEntry = { id:number; date:string; shift:ShiftName; passenger_name:string; fraction:number; amount:number; is_guest:number; is_retro:number; created_at:string };
type ShiftName = 'Ranní' | 'Odpolední' | 'Noční' | 'Sobota 12 h';

async function migrateDb(db: any) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
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
  const anchor = await db.getFirstAsync("SELECT value FROM settings WHERE key='rotation_anchor_date'");
  if (!anchor) {
    await db.runAsync("INSERT INTO settings(key,value) VALUES('rotation_anchor_date','2026-10-03')");
    await db.runAsync("INSERT INTO settings(key,value) VALUES('rotation_anchor_driver','Já')");
  }
}
async function getSetting(db:any,key:string,fallback:string){ const row:any=await db.getFirstAsync('SELECT value FROM settings WHERE key=?',key); return row?.value??fallback; }
async function setSetting(db:any,key:string,value:string){ await db.runAsync(`INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,key,value); }
function formatDateKey(date:Date){ const y=date.getFullYear(),m=String(date.getMonth()+1).padStart(2,'0'),d=String(date.getDate()).padStart(2,'0'); return `${y}-${m}-${d}`; }
function parseDateKey(key:string){ const [y,m,d]=key.split('-').map(Number); return new Date(y,(m||1)-1,d||1,12,0,0,0); }
function monthKey(dateKey:string){ return dateKey.slice(0,7); }
function shiftOptions(dateKey:string):ShiftName[]{ return parseDateKey(dateKey).getDay()===6?['Sobota 12 h']:['Ranní','Odpolední','Noční']; }
function plannedDriver(dateKey:string,anchorDateKey:string,anchorDriver:DriverName):DriverName{ const drivers:DriverName[]=['Já','Tade','Fany']; const days=Math.floor((parseDateKey(dateKey).getTime()-parseDateKey(anchorDateKey).getTime())/86400000); const week=Math.floor(days/7),base=drivers.indexOf(anchorDriver); return drivers[((base+week)%drivers.length+drivers.length)%drivers.length]; }


const PRICE_FULL = 90;
const PRICE_HALF = 45;
const LOCK_MS = 12 * 60 * 60 * 1000;
const DRIVERS: DriverName[] = ['Já', 'Tade', 'Fany'];

const AVATARS = {
  'Já': { uri: 'data:image/jpeg;base64,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' },
  'Tade': { uri: 'data:image/jpeg;base64,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' },
  'Fany': { uri: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCABIAEgDASIAAhEBAxEB/8QAGwAAAgMBAQEAAAAAAAAAAAAAAAYDBAUHAgH/xAA4EAABAwMCAwQHBgcBAAAAAAABAgMEAAUREiETMUEGUWFxFCIyQoGRoVJicrHB0QcVIzND4fAk/8QAGAEAAwEBAAAAAAAAAAAAAAAAAQIDBAD/xAAhEQACAwEAAgMAAwAAAAAAAAABAgADESESMQQTQTJRYf/aAAwDAQACEQMRAD8Acu0Paq19n28S3dcgjKY7e6z59w8TSNL/AIo3B1K0w7fHZz7KlrKyn4bDNIshb0mQt59xbrrh1LWs5Kj4mrkCzypbangkojo9t1WyU/8Ad3M0hYCUVCZHcZku5ylSpjy33181K5+QHQeAqNq0SpP9hrJ8VACr7kVplB1u8JHRA3cX5joPOtOy9n5V1SHUMcGIP873X8I978q7QBpMBBJwCZTfZi6EDaP5ekIz+dalusVziOhUmI6GTzWhOsDxyM00K7PQI8YtBgL71q9pXx6fCs8W6Ra3Q/EceDIP9xpWFI/EP15VFrK3BB5NCV2oQV7F65wBHlHhqC21bpUOVV0owMGur28R7nb1KuaGHUj/ADYAJ8+40hdprV/K7gW0HLaxrbOc6k1Nf86JViCe8MXwjRIA91VFbNrtomha3VhCUDOTRUbLRs0V1HxmCpCWXApacjOSB3UxLukmVAYtUFg61H+m2hOSD9r8R+gqtIsclTkEPJx6SninuCBy/U/KpB2i/lCVt2NlAcXsuY6nUtf4RySmr6rZ+mZwrqD/AFGfs92Eaj4l3oCQ/wAwwDlKT949T4cvOmeQ403stxtsJGACoJA/1XFp17vdwCzIuEpxI3I4hA+QrwiEXUZUHlqAyQn9zTMm/wAjJKCPQnXXH4p9USY53911P715ZyhxKmzqTy2I/wCweXyrlDUZIYWpxrOjkSn9qiQl9s62pC2ldAkFOfLeh9YIzY/kRhydPu0GSEKm2laspGXI6eneUj8xShdZrky3YaOFsr4nCPLxKe7PUVm2vtfe4KxiUX0A50vDVn486Yodztl4mpkqjJjzFAh1nPqPZ6pPRXXHWphTR3ORt+8eMXlzVrYQUKISoZ22zRWi3YVKYubeoIMMcdsHbUg8xRR1CeRwtmdmuLsmZ2XffJBdjuIZbP3COX0pRdbQ4MtYH3Cdx5d4+teIklbMKXFByNSFfLP714ZYkSdRbQVBPtK5BPmTsKeukLslZeSQBJLey0XnGX3Q0TgjWPaP2a6CiIzHjONvoQhDY9bVsAe8mkCPhMlkOSWlAOJ2GVgbjqBinO7Xdpqe+xNSUMrWfXxqSoZ61O4HyGS9FgKkHkzJ8tCGnmmmGH2jj19WlR8h/qhiHFl8FIALaxqWpJzgDnjx2rPuNxguy0IYkEMYOU8BITnw2zV4ymbbZ18JTQXI1IbVqKQCQNRyeoB+tFgQAB7M4OCSSeCKz7OJSk6caAAR3GtC2wlvuIWlXCbQoFTxOAnfv6nwFQLKmFhSmEZV6wUv18+IzkGonpj7uNbilY2AJ2HlTsrMMEktiKdMa+0V0bfuLj8EEMrhqbUftad8n5UVjNgMWFT7wy4+h1DefIAmijXUuYYllrDPGVYkRSnWHlJPCe/pOY6EY/TBrRvzEUvqjNuuBpjZqJjhgd5Ud8qPfU9mu8S3syI8lkOJfIU2s8kKHWql8lKvTodcSBJQnTlIxqA/WpozNZh9Sroq1kj3MlTzRuUZb6QmOggBCRgJx4ee/jTk+GpsUKcAWSNWeeod4pEJcWA28PXSPVV346Gp402VEH/mfWhJ3xzHyO1aHq8sImau/wANB/ZoG2Mom5DQUM5GTkVWvz5LUZhJGlrUfMnGT9BVjiXv0FS/R8Nq2KuCNWOefLxrEe1uL1uKKicDJrkXTpPqCxxmAZsYOzzEefBkQXnOG4Vh1o4yEYGFZ32BB+lRzbNLhSwy61kKOELTulfiD1FZzPG4qYsVKy44Rr0e15CmOROuj1vZs7zgQgbkKAAaSB1PTakcFW3eSiEMmZ2Ub+808tLcHPorATGaz7xHrKPxO/xoqnc5LS5LbMMERoo0oJGCs9VHxJ/QdKK7Wzk7FB6ZASVxwT7uxrd7MNwpjno0uSmM8N2HlbDPcaKK51GQ1sdla+oXGmKbnsALB2cb21eI6GqEWK1IdAjy2UnVlIeOjG/yooo1uTXsSysfbkeJUNxyPxZyoiFKWgl5iXwwdiCrnkEDp1zSZKt0ZElYTcWVtheUhOVKUPHbAoopfjejD8n8jJ2SVDgXJLjSS66pWScbnNfe3dygOy1ItakqKgC6tHIHuz1/IePQoqTHbSDLouVAiJjKdYKBzooorWJjPuf/2Q==' },
  'Hanes': { uri: 'data:image/jpeg;base64,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' },
  'Vorel': { uri: 'data:image/jpeg;base64,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' }
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
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await db.runAsync(
      `INSERT INTO passenger_entries(date,shift,passenger_name,fraction,amount,is_guest,is_retro,created_at)
       VALUES(?,?,?,?,?,?,?,?)`,
      today, shift, name, fraction, fraction * PRICE_FULL, 0, 0, new Date().toISOString()
    );
    refresh();
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
