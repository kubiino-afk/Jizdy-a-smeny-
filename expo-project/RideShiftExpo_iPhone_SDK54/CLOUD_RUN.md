# Další krok pro iPhone-only workflow

Projekt je připravený pro Expo Go. K jeho spuštění potřebujeme cloudový bundler, protože iPhone sám nemůže spustit Node/Metro server pro React Native projekt.

## Expo Go test

V cloudovém terminálu:

```bash
npm install
npx expo install --fix
npx expo start --tunnel
```

Potom se otevře Expo Go odkaz/QR.

## EAS build

Až bude UI a funkce hotová:

```bash
npm install -g eas-cli
eas login
eas init
eas build --platform ios --profile production
eas submit --platform ios
```

Production/TestFlight vyžaduje Apple Developer účet.
