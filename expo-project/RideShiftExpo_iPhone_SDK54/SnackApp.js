import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, View, } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
async function migrateDb(db) {
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
async function getSetting(db, key, fallback) { const row = await db.getFirstAsync('SELECT value FROM settings WHERE key=?', key); return row?.value ?? fallback; }
async function setSetting(db, key, value) { await db.runAsync(`INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`, key, value); }
function formatDateKey(date) { const y = date.getFullYear(), m = String(date.getMonth() + 1).padStart(2, '0'), d = String(date.getDate()).padStart(2, '0'); return `${y}-${m}-${d}`; }
function parseDateKey(key) { const [y, m, d] = key.split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0); }
function monthKey(dateKey) { return dateKey.slice(0, 7); }
function shiftOptions(dateKey) { return parseDateKey(dateKey).getDay() === 6 ? ['Sobota 12 h'] : ['Ranní', 'Odpolední', 'Noční']; }
function plannedDriver(dateKey, anchorDateKey, anchorDriver) { const drivers = ['Já', 'Tade', 'Fany']; const days = Math.floor((parseDateKey(dateKey).getTime() - parseDateKey(anchorDateKey).getTime()) / 86400000); const week = Math.floor(days / 7), base = drivers.indexOf(anchorDriver); return drivers[((base + week) % drivers.length + drivers.length) % drivers.length]; }
const PRICE_FULL = 90;
const PRICE_HALF = 45;
const LOCK_MS = 12 * 60 * 60 * 1000;
const DRIVERS = ['Já', 'Tade', 'Fany'];
const AVATARS = {
    'Já': { uri: 'data:image/jpeg;base64,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' },
    'Tade': { uri: 'data:image/jpeg;base64,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' },
    'Fany': { uri: 'data:image/jpeg;base64,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' },
    'Hanes': { uri: 'data:image/jpeg;base64,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' },
    'Vorel': { uri: 'data:image/jpeg;base64,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' }
};
function czDate(dateKey, withYear = true) {
    const d = parseDateKey(dateKey);
    return new Intl.DateTimeFormat('cs-CZ', {
        weekday: 'short',
        day: 'numeric',
        month: 'numeric',
        ...(withYear ? { year: 'numeric' } : {}),
    }).format(d);
}
function monthLabel(key) {
    const [y, m] = key.split('-').map(Number);
    const names = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec'];
    return `${names[(m || 1) - 1]} ${y}`;
}
function addDays(key, amount) {
    const d = parseDateKey(key);
    d.setDate(d.getDate() + amount);
    return formatDateKey(d);
}
function formatMoney(n) {
    return `${Math.round(n).toLocaleString('cs-CZ')} Kč`;
}
function GlassCard({ children, style }) {
    return (React.createElement(LinearGradient, { colors: ['rgba(255,255,255,0.50)', 'rgba(255,133,55,0.38)', 'rgba(255,255,255,0.11)', 'rgba(0,0,0,0.28)'], start: { x: 0, y: 0 }, end: { x: 1, y: 1 }, style: [styles.glassBorder, style] },
        React.createElement(BlurView, { intensity: 42, tint: "dark", style: styles.glassInner },
            React.createElement(LinearGradient, { colors: ['rgba(28,31,35,0.78)', 'rgba(12,14,17,0.52)', 'rgba(23,18,15,0.68)'], start: { x: 0, y: 0 }, end: { x: 1, y: 1 }, style: StyleSheet.absoluteFill }),
            React.createElement(View, { style: styles.glassTopShine }),
            children)));
}
function CopperButton({ label, sub, onPress, disabled, compact }) {
    return (React.createElement(Pressable, { onPress: onPress, disabled: disabled, style: ({ pressed }) => [{ opacity: disabled ? 0.38 : pressed ? 0.74 : 1, flex: compact ? undefined : 1 }] },
        React.createElement(LinearGradient, { colors: ['#3a241b', '#17191d', '#4d2b1d'], style: [styles.copperButton, compact && { paddingHorizontal: 14 }] },
            React.createElement(Text, { style: styles.copperButtonLabel }, label),
            !!sub && React.createElement(Text, { style: styles.copperButtonSub }, sub))));
}
function Avatar({ name, size = 50, accent = '#ff873e' }) {
    return (React.createElement(View, { style: [styles.avatarRing, { width: size, height: size, borderRadius: size / 2, borderColor: accent }] },
        React.createElement(Image, { source: AVATARS[name], contentFit: "cover", style: { width: size - 5, height: size - 5, borderRadius: (size - 5) / 2 } })));
}
function AppBackground() {
    const lines = [
        { top: 30, left: -70, width: 420, rotate: '-28deg' },
        { top: 230, left: 140, width: 430, rotate: '41deg' },
        { top: 520, left: -120, width: 470, rotate: '-17deg' },
        { top: 830, left: 40, width: 490, rotate: '28deg' },
        { top: 1180, left: -40, width: 460, rotate: '-36deg' },
    ];
    return (React.createElement(View, { pointerEvents: "none", style: StyleSheet.absoluteFill },
        React.createElement(LinearGradient, { colors: ['#090b0e', '#14171a', '#07080a'], style: StyleSheet.absoluteFill }),
        lines.map((line, i) => (React.createElement(View, { key: i, style: [styles.copperLineWrap, { top: line.top, left: line.left, width: line.width, transform: [{ rotate: line.rotate }] }] },
            React.createElement(LinearGradient, { colors: ['transparent', '#8f3f18', '#ff7d31', '#ffcf9a', '#ff6a20', 'transparent'], start: { x: 0, y: 0.5 }, end: { x: 1, y: 0.5 }, style: styles.copperLine })))),
        React.createElement(LinearGradient, { colors: ['rgba(255,112,30,0.08)', 'transparent', 'rgba(255,112,30,0.05)'], style: StyleSheet.absoluteFill })));
}
function SteeringWheel() {
    return (React.createElement(View, { style: styles.wheel },
        React.createElement(View, { style: styles.wheelInner }),
        React.createElement(View, { style: [styles.spoke, { transform: [{ rotate: '0deg' }] }] }),
        React.createElement(View, { style: [styles.spoke, { transform: [{ rotate: '120deg' }] }] }),
        React.createElement(View, { style: [styles.spoke, { transform: [{ rotate: '240deg' }] }] }),
        React.createElement(View, { style: styles.wheelHub })));
}
function SegmentedDrivers({ value, onChange }) {
    return (React.createElement(View, { style: styles.segmentRow }, DRIVERS.map((d) => (React.createElement(Pressable, { key: d, onPress: () => onChange(d), style: [styles.segment, value === d && styles.segmentActive] },
        React.createElement(Text, { style: [styles.segmentText, value === d && { color: '#fff' }] }, d))))));
}
function useSettings(version) {
    const db = useSQLiteContext();
    const [anchorDate, setAnchorDateState] = useState('2026-10-03');
    const [anchorDriver, setAnchorDriverState] = useState('Já');
    useEffect(() => {
        (async () => {
            setAnchorDateState(await getSetting(db, 'rotation_anchor_date', '2026-10-03'));
            setAnchorDriverState((await getSetting(db, 'rotation_anchor_driver', 'Já')));
        })();
    }, [db, version]);
    const saveAnchorDate = async (v) => {
        setAnchorDateState(v);
        await setSetting(db, 'rotation_anchor_date', v);
    };
    const saveAnchorDriver = async (v) => {
        setAnchorDriverState(v);
        await setSetting(db, 'rotation_anchor_driver', v);
    };
    return { anchorDate, anchorDriver, saveAnchorDate, saveAnchorDriver };
}
function HomeScreen({ version, refresh, onTrips, onFinance }) {
    const db = useSQLiteContext();
    const today = formatDateKey(new Date());
    const { anchorDate, anchorDriver } = useSettings(version);
    const shifts = shiftOptions(today);
    const [shift, setShift] = useState(shifts[0]);
    const [actualDriver, setActualDriver] = useState('Já');
    const [driverStats, setDriverStats] = useState({ 'Já': 0, Tade: 0, Fany: 0 });
    const [passengerTotals, setPassengerTotals] = useState({ Hanes: 0, Vorel: 0 });
    const [locks, setLocks] = useState({ Hanes: 0, Vorel: 0 });
    const [guestOpen, setGuestOpen] = useState(false);
    const [guestName, setGuestName] = useState('');
    const [guestFraction, setGuestFraction] = useState(0.5);
    const plan = useMemo(() => plannedDriver(today, anchorDate, anchorDriver), [today, anchorDate, anchorDriver]);
    useEffect(() => {
        if (!shiftOptions(today).includes(shift))
            setShift(shiftOptions(today)[0]);
    }, [today]);
    useEffect(() => {
        setActualDriver(plan);
    }, [plan, shift]);
    const load = async () => {
        const currentMonth = monthKey(today);
        const ds = await db.getAllAsync(`SELECT actual_driver, COUNT(*) as count FROM drives WHERE substr(date,1,7)=? GROUP BY actual_driver`, currentMonth);
        const nextStats = { 'Já': 0, Tade: 0, Fany: 0 };
        ds.forEach((r) => { nextStats[r.actual_driver] = Number(r.count); });
        setDriverStats(nextStats);
        const ps = await db.getAllAsync(`SELECT passenger_name, SUM(amount) as total, SUM(fraction) as rides
       FROM passenger_entries
       WHERE substr(date,1,7)=? AND passenger_name IN ('Hanes','Vorel')
       GROUP BY passenger_name`, currentMonth);
        const nextP = { Hanes: 0, Vorel: 0 };
        ps.forEach((r) => { nextP[r.passenger_name] = Number(r.total); });
        setPassengerTotals(nextP);
        const now = Date.now();
        const nextLocks = { Hanes: 0, Vorel: 0 };
        for (const name of ['Hanes', 'Vorel']) {
            const last = await db.getFirstAsync(`SELECT created_at FROM passenger_entries
         WHERE passenger_name=? AND is_retro=0 AND is_guest=0
         ORDER BY datetime(created_at) DESC LIMIT 1`, name);
            if (last)
                nextLocks[name] = Math.max(0, LOCK_MS - (now - new Date(last.created_at).getTime()));
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
        await db.runAsync(`INSERT INTO drives(date,shift,planned_driver,actual_driver,created_at)
       VALUES(?,?,?,?,?)
       ON CONFLICT(date,shift) DO UPDATE SET planned_driver=excluded.planned_driver, actual_driver=excluded.actual_driver, created_at=excluded.created_at`, today, shift, plan, actualDriver, new Date().toISOString());
        refresh();
    };
    const addPassenger = async (name, fraction) => {
        if (locks[name] > 0) {
            Alert.alert('12hodinový zámek', `${name} už má čerstvý zápis. Zpětný zápis můžeš udělat v Přehledu jízd.`);
            return;
        }
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        await db.runAsync(`INSERT INTO passenger_entries(date,shift,passenger_name,fraction,amount,is_guest,is_retro,created_at)
       VALUES(?,?,?,?,?,?,?,?)`, today, shift, name, fraction, fraction * PRICE_FULL, 0, 0, new Date().toISOString());
        refresh();
    };
    const addGuest = async () => {
        const name = guestName.trim();
        if (!name)
            return;
        await db.runAsync(`INSERT INTO passenger_entries(date,shift,passenger_name,fraction,amount,is_guest,is_retro,created_at)
       VALUES(?,?,?,?,?,?,?,?)`, today, shift, name, guestFraction, guestFraction * PRICE_FULL, 1, 0, new Date().toISOString());
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setGuestName('');
        setGuestOpen(false);
        refresh();
    };
    const max = Math.max(...Object.values(driverStats));
    const min = Math.min(...Object.values(driverStats));
    const fairness = max - min;
    return (React.createElement(ScrollView, { contentContainerStyle: styles.screenScroll, showsVerticalScrollIndicator: false },
        React.createElement(View, { style: styles.headerRow },
            React.createElement(View, null,
                React.createElement(Text, { style: styles.bigTitle }, "J\u00EDzdy a sm\u011Bny"),
                React.createElement(Text, { style: styles.subtitle }, "V\u00E1\u0161 p\u0159ehled na jednom m\u00EDst\u011B")),
            React.createElement(View, { style: styles.datePill },
                React.createElement(Text, { style: styles.datePillText },
                    "\u25A3 ",
                    czDate(today)))),
        React.createElement(GlassCard, null,
            React.createElement(View, { style: styles.heroRow },
                React.createElement(View, { style: { flex: 1 } },
                    React.createElement(Text, { style: styles.sectionEyebrow }, "DNES"),
                    React.createElement(Text, { style: styles.heroTitle }, shift),
                    React.createElement(View, { style: styles.lineItem },
                        React.createElement(Text, { style: styles.lineIcon }, "\uD83D\uDC64"),
                        React.createElement(Text, { style: styles.lineLabel }, "M\u00E1 \u0159\u00EDdit:"),
                        React.createElement(Text, { style: styles.lineValue }, plan)),
                    React.createElement(View, { style: styles.lineItem },
                        React.createElement(Text, { style: styles.lineIcon }, "\uD83D\uDE98"),
                        React.createElement(Text, { style: styles.lineLabel }, "\u0158\u00EDd\u00ED:"),
                        React.createElement(Text, { style: [styles.lineValue, { color: '#9af1ad' }] }, actualDriver)),
                    React.createElement(Text, { style: styles.rotationText }, "Cyklus \u0159idi\u010D\u016F:  J\u00E1 \u00B7 Tade \u00B7 Fany")),
                React.createElement(SteeringWheel, null)),
            React.createElement(View, { style: styles.shiftRow }, shifts.map((s) => (React.createElement(Pressable, { key: s, onPress: () => setShift(s), style: [styles.shiftChip, shift === s && styles.shiftChipActive] },
                React.createElement(Text, { style: [styles.shiftChipText, shift === s && { color: '#fff' }] }, s))))),
            React.createElement(Text, { style: styles.smallLabel }, "Skute\u010Dn\u00FD \u0159idi\u010D"),
            React.createElement(SegmentedDrivers, { value: actualDriver, onChange: setActualDriver }),
            React.createElement(CopperButton, { label: "\u2713 Potvrdit od\u0159\u00EDzenou sm\u011Bnu", onPress: confirmDrive })),
        React.createElement(GlassCard, null,
            React.createElement(View, { style: styles.cardHeader },
                React.createElement(Text, { style: styles.cardTitle }, "\u2696 F\u00E9rovost \u0159idi\u010D\u016F"),
                React.createElement(Text, { style: styles.badge },
                    "Rozd\u00EDl: ",
                    fairness,
                    " sm\u011Bn")),
            React.createElement(View, { style: styles.driverGrid }, DRIVERS.map((d, i) => (React.createElement(View, { key: d, style: styles.driverStat },
                React.createElement(Avatar, { name: d, size: 48, accent: ['#4c9cff', '#ff843b', '#9a61ff'][i] }),
                React.createElement(Text, { style: styles.driverName }, d),
                React.createElement(Text, { style: styles.driverCount }, driverStats[d]),
                React.createElement(Text, { style: styles.mutedMini }, "sm\u011Bn")))))),
        React.createElement(GlassCard, null,
            React.createElement(Text, { style: styles.cardTitle }, "\u25C9 Plat\u00EDc\u00ED cestuj\u00EDc\u00ED"),
            React.createElement(View, { style: styles.passengerGrid },
                ['Hanes', 'Vorel'].map((name) => (React.createElement(View, { key: name, style: styles.passengerCard },
                    React.createElement(View, { style: styles.passengerHead },
                        React.createElement(Avatar, { name: name, size: 48 }),
                        React.createElement(View, null,
                            React.createElement(Text, { style: styles.passengerName }, name),
                            React.createElement(Text, { style: styles.mutedMini }, formatMoney(passengerTotals[name] || 0)))),
                    React.createElement(View, { style: styles.actionRow },
                        React.createElement(CopperButton, { label: "+90", sub: "cel\u00E1", onPress: () => addPassenger(name, 1), disabled: locks[name] > 0 }),
                        React.createElement(CopperButton, { label: "+45", sub: "p\u016Fl", onPress: () => addPassenger(name, 0.5), disabled: locks[name] > 0 })),
                    locks[name] > 0 && React.createElement(Text, { style: styles.lockText },
                        "\uD83D\uDD12 dal\u0161\u00ED z\u00E1pis za ",
                        Math.ceil(locks[name] / 3600000),
                        " h")))),
                React.createElement(Pressable, { style: styles.guestCard, onPress: () => setGuestOpen(true) },
                    React.createElement(Text, { style: styles.guestIcon }, "$"),
                    React.createElement(Text, { style: styles.passengerName }, "Host"),
                    React.createElement(Text, { style: styles.mutedMini }, "Jednor\u00E1zov\u00FD"),
                    React.createElement(Text, { style: styles.guestPlus }, "\uFF0B")))),
        React.createElement(View, { style: styles.twoCards },
            React.createElement(GlassCard, { style: { flex: 1 } },
                React.createElement(Pressable, { onPress: onTrips, style: styles.routeTile },
                    React.createElement(Text, { style: styles.routeIcon }, "\u2301"),
                    React.createElement(Text, { style: styles.routeTitle }, "P\u0159ehled j\u00EDzd"),
                    React.createElement(Text, { style: styles.routeSub }, "Datum, cestuj\u00EDc\u00ED, \u0159idi\u010D, kdo platil"),
                    React.createElement(Text, { style: styles.routeArrow }, "\u203A"))),
            React.createElement(GlassCard, { style: { flex: 0.78 } },
                React.createElement(Pressable, { onPress: onFinance, style: styles.routeTile },
                    React.createElement(Text, { style: styles.routeIcon }, "\u25EB"),
                    React.createElement(Text, { style: styles.routeTitle }, "Finance"),
                    React.createElement(Text, { style: styles.routeSub }, "Souhrny a platby"),
                    React.createElement(Text, { style: styles.routeArrow }, "\u203A")))),
        React.createElement(Modal, { visible: guestOpen, transparent: true, animationType: "fade", onRequestClose: () => setGuestOpen(false) },
            React.createElement(View, { style: styles.modalShade },
                React.createElement(GlassCard, { style: styles.modalCard },
                    React.createElement(Text, { style: styles.cardTitle }, "Jednor\u00E1zov\u00FD cestuj\u00EDc\u00ED"),
                    React.createElement(TextInput, { value: guestName, onChangeText: setGuestName, placeholder: "Jm\u00E9no", placeholderTextColor: "#75787c", style: styles.input }),
                    React.createElement(View, { style: styles.actionRow },
                        React.createElement(Pressable, { style: [styles.segment, guestFraction === 1 && styles.segmentActive], onPress: () => setGuestFraction(1) },
                            React.createElement(Text, { style: styles.segmentText }, "Cel\u00E1 \u00B7 90 K\u010D")),
                        React.createElement(Pressable, { style: [styles.segment, guestFraction === 0.5 && styles.segmentActive], onPress: () => setGuestFraction(0.5) },
                            React.createElement(Text, { style: styles.segmentText }, "P\u016Fl \u00B7 45 K\u010D"))),
                    React.createElement(CopperButton, { label: "P\u0159idat cestuj\u00EDc\u00EDho", onPress: addGuest }),
                    React.createElement(Pressable, { onPress: () => setGuestOpen(false), style: styles.closeLink },
                        React.createElement(Text, { style: styles.closeLinkText }, "Zru\u0161it")))))));
}
function TripsScreen({ version, refresh }) {
    const db = useSQLiteContext();
    const { anchorDate, anchorDriver } = useSettings(version);
    const [dateKey, setDateKey] = useState(formatDateKey(new Date()));
    const [shift, setShift] = useState(shiftOptions(dateKey)[0]);
    const [entries, setEntries] = useState([]);
    const [actual, setActual] = useState(null);
    const [driverChoice, setDriverChoice] = useState('Já');
    const [retroOpen, setRetroOpen] = useState(false);
    const [retroPassenger, setRetroPassenger] = useState('Hanes');
    const [retroFraction, setRetroFraction] = useState(1);
    const [guestName, setGuestName] = useState('');
    const plan = plannedDriver(dateKey, anchorDate, anchorDriver);
    useEffect(() => {
        const valid = shiftOptions(dateKey);
        if (!valid.includes(shift))
            setShift(valid[0]);
    }, [dateKey]);
    const load = async () => {
        const r = await db.getFirstAsync('SELECT actual_driver FROM drives WHERE date=? AND shift=?', dateKey, shift);
        setActual(r?.actual_driver ?? null);
        setDriverChoice(r?.actual_driver ?? plan);
        const es = await db.getAllAsync('SELECT * FROM passenger_entries WHERE date=? AND shift=? ORDER BY id DESC', dateKey, shift);
        setEntries(es);
    };
    useEffect(() => { load(); }, [version, dateKey, shift, plan]);
    const saveDriver = async () => {
        await db.runAsync(`INSERT INTO drives(date,shift,planned_driver,actual_driver,created_at)
       VALUES(?,?,?,?,?) ON CONFLICT(date,shift) DO UPDATE SET planned_driver=excluded.planned_driver,actual_driver=excluded.actual_driver,created_at=excluded.created_at`, dateKey, shift, plan, driverChoice, new Date().toISOString());
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        refresh();
    };
    const saveRetro = async () => {
        const name = retroPassenger === 'Host' ? guestName.trim() : retroPassenger;
        if (!name)
            return;
        await db.runAsync(`INSERT INTO passenger_entries(date,shift,passenger_name,fraction,amount,is_guest,is_retro,created_at)
       VALUES(?,?,?,?,?,?,?,?)`, dateKey, shift, name, retroFraction, retroFraction * PRICE_FULL, retroPassenger === 'Host' ? 1 : 0, 1, new Date().toISOString());
        setGuestName('');
        setRetroOpen(false);
        refresh();
    };
    return (React.createElement(ScrollView, { contentContainerStyle: styles.screenScroll, showsVerticalScrollIndicator: false },
        React.createElement(Text, { style: styles.bigTitle }, "P\u0159ehled j\u00EDzd"),
        React.createElement(Text, { style: styles.subtitle }, "Konkr\u00E9tn\u00ED datum, sm\u011Bna a skute\u010Dn\u00FD pr\u016Fb\u011Bh"),
        React.createElement(GlassCard, null,
            React.createElement(View, { style: styles.dateNav },
                React.createElement(Pressable, { onPress: () => setDateKey(addDays(dateKey, -1)), style: styles.navRound },
                    React.createElement(Text, { style: styles.navRoundText }, "\u2039")),
                React.createElement(View, { style: { alignItems: 'center' } },
                    React.createElement(Text, { style: styles.heroTitle }, czDate(dateKey)),
                    React.createElement(Text, { style: styles.mutedMini }, monthLabel(monthKey(dateKey)))),
                React.createElement(Pressable, { onPress: () => setDateKey(addDays(dateKey, 1)), style: styles.navRound },
                    React.createElement(Text, { style: styles.navRoundText }, "\u203A"))),
            React.createElement(View, { style: styles.shiftRow }, shiftOptions(dateKey).map((s) => React.createElement(Pressable, { key: s, onPress: () => setShift(s), style: [styles.shiftChip, shift === s && styles.shiftChipActive] },
                React.createElement(Text, { style: styles.shiftChipText }, s))))),
        React.createElement(GlassCard, null,
            React.createElement(Text, { style: styles.cardTitle }, "\u0158\u00EDzen\u00ED"),
            React.createElement(View, { style: styles.infoRow },
                React.createElement(Text, { style: styles.lineLabel }, "M\u011Bl \u0159\u00EDdit"),
                React.createElement(Text, { style: styles.infoValue }, plan)),
            React.createElement(View, { style: styles.infoRow },
                React.createElement(Text, { style: styles.lineLabel }, "Skute\u010Dn\u011B \u0159\u00EDdil"),
                React.createElement(Text, { style: [styles.infoValue, { color: actual ? '#9af1ad' : '#969aa0' }] }, actual ?? 'Nepotvrzeno')),
            React.createElement(SegmentedDrivers, { value: driverChoice, onChange: setDriverChoice }),
            React.createElement(CopperButton, { label: "Ulo\u017Eit skute\u010Dn\u00E9ho \u0159idi\u010De", onPress: saveDriver })),
        React.createElement(GlassCard, null,
            React.createElement(View, { style: styles.cardHeader },
                React.createElement(Text, { style: styles.cardTitle }, "Cestuj\u00EDc\u00ED"),
                React.createElement(Pressable, { onPress: () => setRetroOpen(true) },
                    React.createElement(Text, { style: styles.textLink }, "\uFF0B Zp\u011Btn\u00FD z\u00E1pis"))),
            entries.length === 0 ? React.createElement(Text, { style: styles.emptyText }, "Pro tuto sm\u011Bnu zat\u00EDm nen\u00ED \u017E\u00E1dn\u00FD z\u00E1znam.") : entries.map((e) => (React.createElement(View, { key: e.id, style: styles.entryRow },
                React.createElement(View, null,
                    React.createElement(Text, { style: styles.entryName }, e.passenger_name),
                    React.createElement(Text, { style: styles.mutedMini },
                        e.is_retro ? 'zpětně · ' : '',
                        e.fraction === 1 ? 'celá jízda' : 'půl jízdy')),
                React.createElement(Text, { style: styles.entryMoney }, formatMoney(e.amount)))))),
        React.createElement(Modal, { visible: retroOpen, transparent: true, animationType: "fade", onRequestClose: () => setRetroOpen(false) },
            React.createElement(View, { style: styles.modalShade },
                React.createElement(GlassCard, { style: styles.modalCard },
                    React.createElement(Text, { style: styles.cardTitle },
                        "Zp\u011Btn\u00FD z\u00E1pis \u00B7 ",
                        czDate(dateKey)),
                    React.createElement(View, { style: styles.segmentRow }, ['Hanes', 'Vorel', 'Host'].map((p) => React.createElement(Pressable, { key: p, onPress: () => setRetroPassenger(p), style: [styles.segment, retroPassenger === p && styles.segmentActive] },
                        React.createElement(Text, { style: styles.segmentText }, p)))),
                    retroPassenger === 'Host' && React.createElement(TextInput, { value: guestName, onChangeText: setGuestName, placeholder: "Jm\u00E9no hosta", placeholderTextColor: "#777", style: styles.input }),
                    React.createElement(View, { style: styles.segmentRow },
                        React.createElement(Pressable, { onPress: () => setRetroFraction(1), style: [styles.segment, retroFraction === 1 && styles.segmentActive] },
                            React.createElement(Text, { style: styles.segmentText }, "90 K\u010D")),
                        React.createElement(Pressable, { onPress: () => setRetroFraction(0.5), style: [styles.segment, retroFraction === 0.5 && styles.segmentActive] },
                            React.createElement(Text, { style: styles.segmentText }, "45 K\u010D"))),
                    React.createElement(CopperButton, { label: "Ulo\u017Eit zp\u011Btn\u011B", onPress: saveRetro }),
                    React.createElement(Pressable, { onPress: () => setRetroOpen(false), style: styles.closeLink },
                        React.createElement(Text, { style: styles.closeLinkText }, "Zru\u0161it")))))));
}
function FinanceScreen({ version }) {
    const db = useSQLiteContext();
    const current = monthKey(formatDateKey(new Date()));
    const [months, setMonths] = useState([]);
    const [selected, setSelected] = useState(current);
    const [passengers, setPassengers] = useState([]);
    const [drivers, setDrivers] = useState([]);
    useEffect(() => {
        (async () => {
            const ms = await db.getAllAsync(`
        SELECT month FROM (
          SELECT DISTINCT substr(date,1,7) AS month FROM passenger_entries
          UNION SELECT DISTINCT substr(date,1,7) AS month FROM drives
        ) ORDER BY month DESC`);
            setMonths(ms.length ? ms : [{ month: current }]);
            if (ms.length && !ms.some((m) => m.month === selected))
                setSelected(ms[0].month);
        })();
    }, [version]);
    useEffect(() => {
        (async () => {
            setPassengers(await db.getAllAsync(`SELECT passenger_name,SUM(amount) as total,SUM(fraction) as rides FROM passenger_entries WHERE substr(date,1,7)=? GROUP BY passenger_name ORDER BY total DESC`, selected));
            setDrivers(await db.getAllAsync(`SELECT actual_driver,COUNT(*) as count FROM drives WHERE substr(date,1,7)=? GROUP BY actual_driver`, selected));
        })();
    }, [selected, version]);
    const total = passengers.reduce((s, p) => s + Number(p.total), 0);
    return (React.createElement(ScrollView, { contentContainerStyle: styles.screenScroll, showsVerticalScrollIndicator: false },
        React.createElement(Text, { style: styles.bigTitle }, "Finance"),
        React.createElement(Text, { style: styles.subtitle }, "M\u011Bs\u00ED\u010Dn\u00ED souhrny a archiv"),
        React.createElement(GlassCard, null,
            React.createElement(Text, { style: styles.sectionEyebrow }, "VYBRAN\u00DD M\u011AS\u00CDC"),
            React.createElement(Text, { style: styles.heroTitle }, monthLabel(selected)),
            React.createElement(Text, { style: styles.financeBig }, formatMoney(total)),
            React.createElement(ScrollView, { horizontal: true, showsHorizontalScrollIndicator: false, contentContainerStyle: { gap: 8, marginTop: 12 } }, months.map((m) => React.createElement(Pressable, { key: m.month, onPress: () => setSelected(m.month), style: [styles.shiftChip, selected === m.month && styles.shiftChipActive] },
                React.createElement(Text, { style: styles.shiftChipText }, monthLabel(m.month)))))),
        React.createElement(GlassCard, null,
            React.createElement(Text, { style: styles.cardTitle }, "Plat\u00EDc\u00ED cestuj\u00EDc\u00ED"),
            passengers.length === 0 ? React.createElement(Text, { style: styles.emptyText }, "\u017D\u00E1dn\u00E9 platby.") : passengers.map((p) => React.createElement(View, { key: p.passenger_name, style: styles.entryRow },
                React.createElement(View, null,
                    React.createElement(Text, { style: styles.entryName }, p.passenger_name),
                    React.createElement(Text, { style: styles.mutedMini },
                        Number(p.rides).toLocaleString('cs-CZ'),
                        " j\u00EDzd")),
                React.createElement(Text, { style: styles.entryMoney }, formatMoney(Number(p.total)))))),
        React.createElement(GlassCard, null,
            React.createElement(Text, { style: styles.cardTitle }, "Od\u0159\u00EDzen\u00E9 sm\u011Bny"),
            React.createElement(View, { style: styles.driverGrid }, DRIVERS.map((d) => { const count = Number(drivers.find((x) => x.actual_driver === d)?.count ?? 0); return React.createElement(View, { key: d, style: styles.driverStat },
                React.createElement(Avatar, { name: d, size: 46 }),
                React.createElement(Text, { style: styles.driverName }, d),
                React.createElement(Text, { style: styles.driverCount }, count),
                React.createElement(Text, { style: styles.mutedMini }, "sm\u011Bn")); }))),
        React.createElement(Text, { style: styles.archiveNote }, "Ka\u017Ed\u00FD nov\u00FD m\u011Bs\u00EDc vznik\u00E1 automaticky. Star\u0161\u00ED m\u011Bs\u00EDce z\u016Fst\u00E1vaj\u00ED v tomto archivu a nic se nema\u017Ee.")));
}
function SettingsScreen({ version, refresh }) {
    const { anchorDate, anchorDriver, saveAnchorDate, saveAnchorDriver } = useSettings(version);
    const [dateDraft, setDateDraft] = useState(anchorDate);
    useEffect(() => setDateDraft(anchorDate), [anchorDate]);
    const saveDate = async () => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateDraft)) {
            Alert.alert('Datum', 'Použij formát RRRR-MM-DD, například 2026-10-03.');
            return;
        }
        await saveAnchorDate(dateDraft);
        refresh();
    };
    return (React.createElement(ScrollView, { contentContainerStyle: styles.screenScroll, showsVerticalScrollIndicator: false },
        React.createElement(Text, { style: styles.bigTitle }, "Nastaven\u00ED"),
        React.createElement(Text, { style: styles.subtitle }, "Koloto\u010D a lok\u00E1ln\u00ED data"),
        React.createElement(GlassCard, null,
            React.createElement(Text, { style: styles.cardTitle }, "Koloto\u010D \u0159idi\u010D\u016F"),
            React.createElement(Text, { style: styles.smallLabel }, "Za\u010D\u00E1tek 7denn\u00EDho cyklu"),
            React.createElement(TextInput, { value: dateDraft, onChangeText: setDateDraft, onEndEditing: saveDate, style: styles.input, keyboardType: "numbers-and-punctuation" }),
            React.createElement(Text, { style: styles.smallLabel }, "Prvn\u00ED \u0159idi\u010D"),
            React.createElement(SegmentedDrivers, { value: anchorDriver, onChange: async (d) => { await saveAnchorDriver(d); refresh(); } }),
            React.createElement(Text, { style: styles.archiveNote }, "Rotace b\u011B\u017E\u00ED po 7 dnech: J\u00E1 \u2192 Tade \u2192 Fany \u2192 J\u00E1. Skute\u010Dn\u00E9 \u0159\u00EDzen\u00ED se po\u010D\u00EDt\u00E1 zvl\u00E1\u0161\u0165 a\u017E po potvrzen\u00ED sm\u011Bny.")),
        React.createElement(GlassCard, null,
            React.createElement(Text, { style: styles.cardTitle }, "\u00DAlo\u017Ei\u0161t\u011B"),
            React.createElement(Text, { style: styles.archiveNote }, "Z\u00E1znamy jsou ukl\u00E1d\u00E1ny lok\u00E1ln\u011B v SQLite datab\u00E1zi aplikace a z\u016Fst\u00E1vaj\u00ED po zav\u0159en\u00ED i restartu. Pozd\u011Bji dopln\u00EDme export/import z\u00E1lohy."))));
}
function BottomDock({ tab, setTab }) {
    const items = [
        { tab: 'home', icon: '⌂', label: 'Domů' },
        { tab: 'trips', icon: '▣', label: 'Jízdy' },
        { tab: 'finance', icon: '▥', label: 'Finance' },
        { tab: 'settings', icon: '⚙', label: 'Nastavení' },
    ];
    return (React.createElement(LinearGradient, { colors: ['rgba(255,255,255,0.46)', 'rgba(255,133,55,0.22)', 'rgba(255,255,255,0.08)'], style: styles.dockBorder },
        React.createElement(BlurView, { intensity: 50, tint: "dark", style: styles.dock }, items.map((it) => (React.createElement(Pressable, { key: it.tab, onPress: () => setTab(it.tab), style: [styles.dockItem, tab === it.tab && styles.dockItemActive], accessibilityLabel: it.label },
            React.createElement(Text, { style: [styles.dockIcon, tab === it.tab && { color: '#ffd8ba' }] }, it.icon)))))));
}
function MainApp() {
    const insets = useSafeAreaInsets();
    const [tab, setTab] = useState('home');
    const [version, setVersion] = useState(0);
    const refresh = () => setVersion((v) => v + 1);
    return (React.createElement(View, { style: styles.root },
        React.createElement(StatusBar, { barStyle: "light-content" }),
        React.createElement(AppBackground, null),
        React.createElement(View, { style: { flex: 1, paddingTop: insets.top } },
            tab === 'home' && React.createElement(HomeScreen, { version: version, refresh: refresh, onTrips: () => setTab('trips'), onFinance: () => setTab('finance') }),
            tab === 'trips' && React.createElement(TripsScreen, { version: version, refresh: refresh }),
            tab === 'finance' && React.createElement(FinanceScreen, { version: version }),
            tab === 'settings' && React.createElement(SettingsScreen, { version: version, refresh: refresh })),
        React.createElement(View, { style: [styles.dockPosition, { bottom: Math.max(insets.bottom, 8) }] },
            React.createElement(BottomDock, { tab: tab, setTab: setTab }))));
}
export default function App() {
    return (React.createElement(SafeAreaProvider, null,
        React.createElement(SQLiteProvider, { databaseName: "jizdy-a-smeny.db", onInit: migrateDb },
            React.createElement(MainApp, null))));
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
