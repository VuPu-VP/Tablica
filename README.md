# Tablica

Cyfrowe zeszyty A4 na studia: pisanie rysikiem i z klawiatury, wzory LaTeX, wykresy, schematy obwodów, import PDF, eksport do PDF. Działa offline jako aplikacja webowa (PWA) na komputerze i telefonie, z synchronizacją przez Google Drive.

## Uruchomienie lokalne

```bash
npm install
npm run dev
```

Aplikacja: http://localhost:5173

## Testy i build

```bash
npm test
npm run build
```

## Publikacja

Każdy push do gałęzi `main` buduje aplikację i publikuje ją na GitHub Pages (`.github/workflows/deploy.yml`).
W repozytorium: **Settings → Pages → Source: GitHub Actions**.

## Synchronizacja z Google Drive

Wymaga własnego OAuth Client ID (typ „Web application”) z Google Cloud z włączonym Google Drive API.
Instrukcja krok po kroku jest w aplikacji: **Ustawienia i synchronizacja**.
Client ID można też podać jako zmienną repozytorium `GOOGLE_CLIENT_ID` (Settings → Secrets and variables → Actions → Variables).
Aplikacja używa tylko uprawnienia `drive.file` – widzi wyłącznie pliki, które sama utworzyła.
