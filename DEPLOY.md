# Veröffentlichen auf Firebase

Die Website besteht aus statischen Seiten (`public/`) und Cloud Functions (`functions/`) für den Gutscheinverkauf.

| Seite | Zweck |
|---|---|
| `/` | Startseite |
| `/gutschein` | Gutschein kaufen (Balance-Zeit 85 € oder Wertgutschein 20–500 €) |
| `/gutschein-danke` | Bestätigung nach der Zahlung mit Code, Drucken oder als PDF speichern |
| `/admin` | Intern: Code prüfen und vor Ort einlösen (auch Teilbeträge) |
| `/impressum`, `/datenschutz`, `/agb` | Entwürfe, **vor dem Livegang ausfüllen und prüfen lassen** |

## So funktioniert der Gutscheinverkauf
1. Die Kundin füllt `/gutschein` aus → `POST /api/checkout` erstellt eine Stripe-Checkout-Seite. Der Preis wird nur auf dem Server festgelegt.
2. Die Zahlung läuft bei Stripe (Karte, Apple Pay, Google Pay, EPS – je nach Einstellung im Stripe-Dashboard).
3. Stripe meldet die Zahlung an `/api/stripe-webhook` → ein Gutschein mit Code `BZ-XXXX-XXXX` wird in Firestore angelegt. Jede Zahlung erzeugt genau einen Gutschein.
4. Die Kundin sieht den Gutschein sofort auf `/gutschein-danke` und bekommt ihn per E-Mail.
5. Vor Ort öffnet Humera `/admin`, gibt den Code ein und tippt auf **Einlösen**.

## Einmalige Einrichtung

### 1. Firebase-Projekt
1. In der [Firebase Console](https://console.firebase.google.com) ein Projekt anlegen, z. B. `balance-zeit`.
2. Auf den **Blaze-Tarif** umstellen. Cloud Functions brauchen ihn; bei diesem Umfang fallen praktisch keine Kosten an. Ein Budget-Alarm von z. B. 5 € ist sinnvoll.
3. **Firestore** anlegen (Produktionsmodus, Region `eur3` oder `europe-west1`).
4. **Authentication** → Anbieter „E-Mail/Passwort“ aktivieren → unter *Users* das Konto für Humera anlegen.
   Unter *Settings → User actions* „Enable create (sign-up)“ **deaktivieren**.

### 2. Stripe
1. Konto auf [stripe.com](https://stripe.com) anlegen (zuerst im Testmodus).
2. Unter *Settings → Payment methods* Karte, Apple Pay, Google Pay und EPS aktivieren.
3. Unter *Developers → API keys* den **Secret key** (`sk_test_…`) kopieren.
4. Webhook anlegen (nach dem ersten Deploy, siehe unten).

### 3. E-Mail-Versand
In der Firebase Console unter *Extensions* die Erweiterung **„Trigger Email from Firestore“** installieren.
- Sammlung: `mail`
- SMTP-Zugang eintragen, z. B. vom E-Mail-Anbieter oder von Brevo oder Mailgun.

Ohne die Erweiterung funktioniert alles andere trotzdem: Die Kundin sieht den Gutschein dann nur auf der Danke-Seite und bekommt die Zahlungsbestätigung von Stripe.

### 4. Lokal vorbereiten
```bash
npm i -g firebase-tools
firebase login
firebase use --add                     # Projekt auswählen
cd functions && npm install && cd ..
cp functions/.env.example functions/.env
# in functions/.env eintragen:
#   SITE_URL=https://balance-zeit.web.app   (später: eigene Domain)
#   ADMIN_EMAILS=humeras-adresse@…
firebase functions:secrets:set STRIPE_SECRET_KEY        # sk_test_… einfügen
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET    # vorerst beliebiger Wert, z. B. "tbd"
```

### 5. Veröffentlichen
```bash
firebase deploy
```
Danach ist die Seite unter `https://<projekt>.web.app` erreichbar.

### 6. Stripe-Webhook verbinden
1. Stripe → *Developers → Webhooks → Add endpoint*
   - URL: `https://<projekt>.web.app/api/stripe-webhook`
   - Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`
2. Das **Signing secret** (`whsec_…`) kopieren und hinterlegen:
   ```bash
   firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
   firebase deploy --only functions
   ```

### 7. Testkauf
Auf `/gutschein` mit der Stripe-Testkarte `4242 4242 4242 4242` (beliebiges Datum in der Zukunft, beliebige CVC) bezahlen. Danach unter `/admin` den Code einlösen.

Wenn alles passt: In Stripe auf den Live-Modus wechseln, den `sk_live_…`-Key und ein neues Webhook-Secret hinterlegen und erneut `firebase deploy --only functions` ausführen.

### 8. Eigene Domain (optional)
Firebase Console → *Hosting → Benutzerdefinierte Domain hinzufügen* und die DNS-Einträge beim Domain-Anbieter setzen. Danach `SITE_URL` in `functions/.env` anpassen und neu deployen.

## Lokal testen (Emulatoren)
```bash
printf 'SITE_URL=http://127.0.0.1:5000\nADMIN_EMAILS=test@example.com\n' > functions/.env.local
printf 'STRIPE_SECRET_KEY=sk_test_…\nSTRIPE_WEBHOOK_SECRET=whsec_…\n' > functions/.secret.local
firebase emulators:start --project demo-balance-zeit
```
- Seite: http://127.0.0.1:5000, Emulator-Oberfläche: http://127.0.0.1:4000. Dort unter *Authentication* einen Testnutzer für `/admin` anlegen.
- Die Admin-Seite nutzt auf `localhost` automatisch die Emulatoren.
- Unit-Tests: `cd functions && npm test`
