# Automazione notification-cron

Questa funzione sostituisce temporaneamente il deploy su Supabase delle notifiche automatiche. Qui trovi tutti i passaggi per eseguirla in locale o da un job pianificato.

## 1. Variabili d'ambiente

Crea un file `.env.notification-cron` (non va committato) con le chiavi richieste dalla funzione:

```
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
NOTIFICATION_CRON_SECRET=una-stringa-lunga
# facoltativo ma consigliato
NOTIFICATION_EMAIL_WEBHOOK=https://...
NOTIFICATION_ADMIN_EMAIL=presidente@gsu.it
NOTIFICATION_MAGAZZINIERE_EMAIL=magazzino@gsu.it
```

- le email `NOTIFICATION_<RUOLO>_EMAIL` sono usate per spedire i promemoria ai ruoli admin/magazziniere;
- il webhook è opzionale: se mancante, la funzione crea comunque le notifiche nel DB ma non manda email.

## 2. Comando npm

Aggiungi allo `package.json` (se non già presente):

```json
{
  "scripts": {
    "notification:cron": "env $(cat .env.notification-cron | xargs) deno run -A supabase/functions/notification-cron/index.ts"
  }
}
```

Su Windows PowerShell è più semplice fare:

```json
"notification:cron": "powershell -Command \"$env:SUPABASE_URL=(Get-Content .env.notification-cron | ConvertFrom-StringData)['SUPABASE_URL']; deno run -A supabase/functions/notification-cron/index.ts\""
```

In alternativa, esporta le variabili prima di eseguire `npm run notification:cron`.

## 3. Esecuzione manuale

```bash
cd Speleo
source .env.notification-cron
npm run notification:cron
```

L'output `{"success": true}` significa che prestiti/libri in ritardo sono stati trasformati in notifiche e, se configurato, sono partite anche le email.

## 4. Pianificazione temporanea

Finché non sarà possibile deployare l'Edge Function, puoi programmare l'esecuzione automatica in tre modi (scegline uno):

### Cron locale (Linux/macOS)

1. Apri il crontab con `crontab -e`.
2. Aggiungi:

```
0 7 * * * cd /Users/<user>/Documents/GitHub/Speleo && source .env.notification-cron && npm run notification:cron >> cron-notification.log 2>&1
```

Esegue ogni giorno alle 7:00 e salva il log accanto al repo.

### Launchd (macOS)

1. Crea `~/Library/LaunchAgents/it.gsu.notification-cron.plist` con un payload simile:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple Computer//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>it.gsu.notification-cron</string>
    <key>ProgramArguments</key>
    <array>
      <string>/bin/zsh</string>
      <string>-lc</string>
      <string>cd /Users/<user>/Documents/GitHub/Speleo && source .env.notification-cron && npm run notification:cron</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
      <key>Hour</key>
      <integer>7</integer>
      <key>Minute</key>
      <integer>0</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>/Users/<user>/Documents/GitHub/Speleo/notification-cron.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/<user>/Documents/GitHub/Speleo/notification-cron-error.log</string>
  </dict>
</plist>
```

2. Carica il job: `launchctl load ~/Library/LaunchAgents/it.gsu.notification-cron.plist`.

### GitHub Actions

1. Aggiungi `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NOTIFICATION_CRON_SECRET`, ecc. come *Repository secrets*.
2. Crea `.github/workflows/notification-cron.yml`:

```yaml
name: notification-cron
on:
  schedule:
    - cron: '0 6 * * *'
jobs:
  run:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: denoland/setup-deno@v2
        with:
          deno-version: v1.x
      - name: Run cron
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          NOTIFICATION_CRON_SECRET: ${{ secrets.NOTIFICATION_CRON_SECRET }}
          NOTIFICATION_EMAIL_WEBHOOK: ${{ secrets.NOTIFICATION_EMAIL_WEBHOOK }}
          NOTIFICATION_ADMIN_EMAIL: ${{ secrets.NOTIFICATION_ADMIN_EMAIL }}
          NOTIFICATION_MAGAZZINIERE_EMAIL: ${{ secrets.NOTIFICATION_MAGAZZINIERE_EMAIL }}
        run: deno run -A supabase/functions/notification-cron/index.ts
```

Questo approccio centralizza l'esecuzione e conserva i log dentro GitHub Actions.

---

Quando saranno disponibili i crediti Supabase, sarà sufficiente deployare l'Edge Function (`supabase functions deploy notification-cron`) e configurare lo Scheduler di Supabase con lo stesso `NOTIFICATION_CRON_SECRET` per tornare a un flusso completamente gestito.

