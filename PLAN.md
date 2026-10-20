# Homepage „Balance-Zeit“ – Plan

Tibetan Energy Balance Massage · Humera Shah · 1220 Wien

## Ziel
Eine einfache, ruhige Homepage, die zuerst fürs Handy gebaut ist und sich wie eine App installieren lässt (PWA). Sie soll vor allem eines tun: Besucherinnen **schnell und ohne Hürde zu einer Terminanfrage** bringen.

## Design-Grundlagen
| Element | Entscheidung |
|---|---|
| Schrift | Poppins (300 / 400 / 500 / 600) |
| Farben (aus dem Logo) | Sand `#DAB598` (Lotus), Espresso `#2B211E` (Logo-Schrift), Creme `#FFF9F1`, Elfenbein `#FFFDFB` |
| Akzent (aus dem Flyer) | Pflaume `#6B2A26`, sparsam für Labels und Icons |
| Bewegung | langsam und sanft: Lotus blüht beim Start auf, Kreise im Hintergrund „atmen“ (8-s-Zyklus), Inhalte blenden beim Scrollen ein, „Reduzierte Bewegung“ im System wird respektiert |
| Bedienung | Navigationsleiste unten (Daumenzone), Buttons mindestens 48 px hoch, Termin-Button immer erreichbar |

## Phase 1 – Onepager-MVP (dieser Entwurf)
1. **Start**: Balance-Zeit, Untertitel, Button „Termin anfragen“, Bild der Kräuterstempel mit Preis
2. **Intro**: Text zum Problem („Der Tag ist voll …“), „Hier dürfen Sie ankommen.“
3. **Angebot**: 3 Schritte (Gespräch → Massage → Nachklingen), Preiskarte 90 Min · 85 €, Hinweis auf Gutscheine
4. **Atem-Pause**: kleine interaktive Atemübung (4 s ein / 4 s aus) – macht das Gefühl der Marke direkt erlebbar
5. **Über mich**: Foto und kurzer Text über Humera
6. **Kontakt**: 1220 Wien, Direktnachricht, Instagram, Button „Als App installieren“
7. **Footer**: Impressum und Datenschutz (in Österreich Pflicht)

Technik: reines HTML/CSS/JS ohne Build-Schritt, mit `manifest.webmanifest` und Service Worker (offline nutzbar, installierbar).

## Phase 2 – Firebase-Hosting
```bash
npm i -g firebase-tools
firebase login
firebase use --add            # Projekt wählen, z. B. "balance-zeit"
firebase deploy --only hosting
```
- Eigene Domain verbinden (z. B. `balance-zeit.at`) unter Firebase Console → Hosting → „Benutzerdefinierte Domain“; SSL ist automatisch dabei
- Optional: GitHub Action für automatisches Deployment bei jedem Push auf `main` (`firebase init hosting:github`)

## Phase 2b – Gutscheinverkauf ✅ umgesetzt
Online kaufen mit Stripe (Karte, Apple Pay, Google Pay, EPS), Code per E-Mail und auf der Danke-Seite, Einlösen vor Ort unter `/admin`. Einrichtung siehe [DEPLOY.md](DEPLOY.md).

## Phase 3 – Ausbau (optional)
- **Terminanfrage-Formular** → Firestore + E-Mail-Benachrichtigung (Cloud Function oder Erweiterung „Trigger Email“)
- **Erweiterung zum Energietyp**: kurzes Quiz mit drei Fragen als Einstieg
- Instagram-Beiträge oder Kundenstimmen einbinden
- Analytics ohne Cookie-Banner (z. B. Plausible) oder Firebase Analytics mit Einwilligung
- Mehrsprachigkeit (DE / EN)

## Offene Punkte / vor dem Livegang klären
- [ ] Impressum und Datenschutzerklärung erstellen (DSGVO, ECG/MedienG)
- [ ] Hinweis „keine medizinische Behandlung“ (Wellness / Energiearbeit) – wichtig für das Gewerbe
- [ ] Instagram-Handle prüfen: Der Flyer zeigt `@tibetan_…`, der Link lautet `tibetian_…` (verwendet wird `tibetian_`)
- [ ] Foto in höherer Auflösung und eigene Bilder vom Raum
- [ ] Domain wählen
- [ ] Der Text „Über mich“ ist ein Platzhalter und sollte von Humera geschrieben werden

## Struktur
```
public/
  index.html             Seite
  styles.css             Design-Tokens und Komponenten
  app.js                 Scroll-Animationen, Tabbar, Atemübung, PWA-Installation
  sw.js                  Offline-Cache
  manifest.webmanifest   App-Manifest
  img/  icons/
firebase.json            Hosting-Konfiguration
```

Lokale Vorschau: `cd public && python3 -m http.server 8080` → http://localhost:8080
