# Jízdy a směny — Expo / React Native v0.1

První nativní React Native verze osobní aplikace pro iPhone.

## Co už funguje

- HP1 v graphite + burnt-copper Liquid Glass stylu
- řidiči: **Já / Tade / Fany**
- automatický 7denní kolotoč řidičů
- skutečné řízení evidované odděleně od platících cestujících
- férovost podle počtu potvrzených odřízených směn
- platící: **Hanes / Vorel**
- celá jízda **90 Kč**, půl jízdy **45 Kč**
- 12hodinová ochrana proti dvojímu běžnému zápisu stejného cestujícího
- jednorázový cestující
- zpětný zápis podle data + směny
- směny: ranní / odpolední / noční, v sobotu 12 h
- denní přehled se šipkami vpřed/vzad
- měsíční finance a automatický archiv měsíců
- lokální **SQLite** databáze, která zůstává po zavření aplikace a restartu telefonu
- avatary jsou přibalené přímo v aplikaci

## Technologie

- Expo SDK 58
- React Native 0.88
- expo-sqlite
- expo-blur
- expo-linear-gradient
- expo-haptics

Expo SQLite databázi ukládá mezi restarty aplikace. Před prvním spuštěním je vhodné spustit `npx expo install --fix`, aby Expo srovnalo přesné verze balíčků s použitým SDK.

## Pouze iPhone — jak budeme testovat

Protože uživatel nemá Mac ani PC, zdrojový ZIP sám o sobě na iPhonu nespustí vývojový server. Nejjednodušší cesta je:

1. Na iPhone nainstalovat **Expo Go** z App Storu.
2. Projekt umístit do cloudového vývojového prostředí / repozitáře.
3. V cloudu spustit:
   - `npm install`
   - `npx expo install --fix`
   - `npx expo start --tunnel`
4. Otevřít QR/Expo odkaz v Expo Go.

Finální verze se stejným projektem vytvoří přes **EAS Build**. Pro distribuci přes TestFlight/App Store bude později potřeba Apple Developer účet.

## Důležitá datová logika

Férovost se počítá **jen mezi Já / Tade / Fany**. Hanes, Vorel ani hosté ji nijak neovlivňují. Platby jsou samostatná účetní vrstva.

Databáze má dvě oddělené evidence:
- `drives` = kdo skutečně odřídil datum + směnu
- `passenger_entries` = kdo jel a kolik platí

To zabraňuje tomu, aby více cestujících uměle navyšovalo počet odřízených směn.
