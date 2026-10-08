# Jízdy a směny — iPhone start (Expo SDK 54)

Tato varianta je schválně připravena pro Expo Go z iOS App Storu, který aktuálně používá SDK 54.

## Na iPhonu
1. Nainstaluj **Expo Go** z App Storu.
2. V Expo Go si vytvoř / přihlas bezplatný Expo účet.
3. V Safari otevři **https://snack.expo.dev** a přihlas se stejným Expo účtem.
4. Vytvoř nový Snack a nastav Expo SDK 54.
5. Pro rychlý test můžeš použít soubor `SnackApp.js` z této složky jako obsah hlavního `App.js`.
6. Přidej závislosti: `expo-sqlite`, `expo-blur`, `expo-haptics`, `expo-image`, `expo-linear-gradient`, `react-native-safe-area-context`.
7. V Snacku zvol **My Device / Run on device** a otevři projekt v Expo Go.

## Důležité
- SQLite je v SDK 54 součást Expo Go a databáze se na iOS ukládá lokálně mezi restarty aplikace.
- Snack/Expo Go je vhodný pro testování. Finální samostatná aplikace bude později sestavena přes EAS Build.
