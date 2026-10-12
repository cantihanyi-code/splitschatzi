# SplitSchatzi 💜

Gemeinsame **Einkaufsliste** und **Ausgaben teilen (wie Splitwise)** für zwei Personen – als App auf beiden Handys installierbar, alles wird **live synchronisiert**.

## Funktionen

**Einkaufen**
- Schnell-Eingabe: `2 Milch`, `500g Hack`, `Apfelsaft 2 Fl` → Menge & Einheit werden erkannt
- Automatische Kategorien (Obst & Gemüse, Milchprodukte, …), sortiert in Supermarkt-Reihenfolge
- „Oft gekauft“-Vorschläge zum Antippen, die App merkt sich eure Kategorien
- Abhaken → „Im Wagen“, danach **„Einkauf eintragen“** = direkt als Ausgabe erfassen
- Artikel antippen zum Bearbeiten (Menge, Notiz, Kategorie) oder Löschen – mit „Rückgängig“

**Ausgaben**
- Aufteilen: 50/50, Prozent (Schieberegler), genaue Beträge oder „Alles für X“
- Kontostand „Anna schuldet dir …“ + **Ausgleichen**-Button (Schulden begleichen)
- Gruppierung nach Monat, Statistik nach Kategorie, CSV-Export
- Standard-Aufteilung (z. B. 60/40) für euch beide einstellbar

**Sync & App**
- Änderungen erscheinen sofort auf dem anderen Handy (+ kleine Benachrichtigung „Anna: + Milch“)
- Funktioniert auch offline – Änderungen werden nachgeholt, sobald wieder Netz da ist
- Installierbar als App (PWA) auf Android und iPhone, Hell/Dunkel-Modus

## Auf die Handys bringen

Die App läuft über **Firebase Hosting** (kostenlos) – ein App Store ist nicht nötig.

### 1. Einmalig veröffentlichen (am PC)
Voraussetzung: ein Firebase-Projekt mit aktivierter **Realtime Database** (https://console.firebase.google.com).

```bash
npx firebase-tools login
npx firebase-tools use --add      # dein Firebase-Projekt auswählen
npm run deploy                    # lädt App + Datenbank-Regeln hoch
```

Danach ist die App unter `https://<projekt-id>.web.app` erreichbar.

### 2. Auf beiden Handys installieren
- **Android (Chrome):** Link öffnen → Menü ⋮ → **„App installieren“**
- **iPhone (Safari):** Link öffnen → Teilen-Symbol → **„Zum Home-Bildschirm“**

### 3. Verbinden
1. Handy A: Namen eingeben → **Neu** → „Los geht's“
2. Unter **Mehr → Einladen** den Link an Handy B schicken (oder den 6-stelligen Code abtippen)
3. Handy B: Link öffnen, Namen eingeben – fertig. Ab jetzt ist alles synchron.

Neues Handy? Einfach denselben Code und denselben Namen eingeben – du bekommst deinen Platz zurück.

## Lokal entwickeln

```bash
npm run dev
```

Startet einen Dev-Server auf http://localhost:5050 mit einer eingebauten Test-Datenbank (kein Firebase nötig).
Zum Testen von zwei Geräten zusätzlich http://127.0.0.1:5050 öffnen. Offline simulieren in der Browser-Konsole:
`firebase.__dev.setOffline(true)`.

Icons neu erzeugen: `npm run icons`

## Aufbau

| Datei | Zweck |
|---|---|
| `public/index.html` | App-Hülle, lädt Firebase über die reservierten Hosting-URLs |
| `public/app.js` | Gesamte App-Logik (ohne Build-Schritt) |
| `public/styles.css` | Design (Hell/Dunkel) |
| `public/manifest.webmanifest`, `public/sw.js`, `public/icons/` | Installierbare PWA + Offline-Start |
| `database.rules.json` | Firebase-Regeln inkl. Datenvalidierung |
| `dev/` | Lokaler Dev-Server, Firebase-Ersatz für Tests, Icon-Generator |

Daten liegen unter `rooms/<CODE>` in der Realtime Database und sind kompatibel mit der ersten Version der App.
