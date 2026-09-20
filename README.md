# GSU · Gestionale del Gruppo Speleologico Urbino

Web app per soci e staff del gruppo: uscite, magazzino e prestiti materiali, scadenze DPI, biblioteca,
scuola di speleologia, anagrafica soci e report. Si usa dal browser e si può installare sul telefono.

> **Copyright (c) 2026 Efstratios Diakatos Arvanitis · tutti i diritti riservati.**
> Software non open source: il Gruppo Speleologico Urbino ne ha l'uso perpetuo e gratuito per le proprie
> attività. Ogni altro uso, copia o modifica richiede l'autorizzazione scritta dell'autore.
> Vedi [LICENSE](LICENSE) e [AUTHORS.md](AUTHORS.md).

- Frontend: React 19 + Vite 7 (JavaScript), React Router
- Backend: Supabase (Postgres con Row Level Security, Auth, Storage, Edge Functions)
- Notifiche: job Deno eseguito da GitHub Actions, email via Edge Function `notification-email`
- Il **manuale d'uso per i soci** è in `docs/MANUALE_SOCI.md` (versioni PDF: sintesi e completo)
- La **documentazione tecnica** è in `docs/TECNICO.md` e `docs/TECNICO_SINTESI.md`

## Avvio in locale

```bash
npm ci
cp .env.example .env.local   # inserisci URL e chiave anon di Supabase
npm run dev
```

Comandi utili: `npm run build`, `npm run lint`, `npm test` (Vitest, scaricato al primo uso con npx).

## Database

Lo schema si aggiorna con le migrazioni in `supabase/migrations/`, **in ordine di nome**. Sono idempotenti: si
possono rieseguire senza danni. Da Supabase → SQL Editor incolla ed esegui un file alla volta, oppure con la CLI:
`supabase db push`.

| File | Cosa fa |
|---|---|
| `…090000_ruoli_e_profili.sql` | unica `current_user_role()`; blocca l'auto-assegnazione di ruolo e approvazione |
| `…090100_prestiti_transazionali.sql` | prestiti solo tramite `loan_create` / `loan_return`, disponibilità sempre coerente |
| `…090200_privacy_statistiche.sql` | statistiche di accesso visibili solo ad admin e presidente |
| `…090300_scuola_su_database.sql` | dati della scuola condivisi (`scuola_dati`) e bucket privato `scuola-documenti` |
| `…090400_magazzino_dpi.sql` | scadenze DPI, impostazioni condivise, rifornimento atomico |
| `…090500_uscite_rientro_previsto.sql` | orario di rientro previsto delle uscite |
| `…090600_notifiche_idempotenti.sql` | niente notifiche doppie |
| `…120000_permessi_uscite_e_foto.sql` | eliminazione uscite riservata ad admin e presidente; archivio foto chiuso agli estranei |

Dopo la prima migrazione verifica che esista almeno un profilo `admin` o `presidente` approvato (le istruzioni
sono in fondo al file): il ruolo ora arriva **solo** dalla tabella `profiles`.

Gli script in `supabase/sql/` e `docs/*.sql` documentano lo schema storico (tabelle `members`, `uscite`,
`library_*`, `member_purchases`…). Quelli sostituiti dalle migrazioni sono marcati come tali: non rieseguirli.

### Modello dei permessi

I ruoli sono `admin`, `presidente`, `consiglio`, `segretario`, `tesoriere`, `magazziniere`, `direttore_scuola`,
`socio`. L'interfaccia li legge da `src/utils/permissions.js`, ma **la protezione vera è nel database** (RLS e
funzioni `security definer`): nascondere un pulsante non basta, ogni regola importante va replicata lato SQL.

## Deploy

1. Esegui le migrazioni nuove su Supabase.
2. Pubblica il frontend (Netlify esegue `npm run build`; `public/_redirects` gestisce le rotte).
3. Configura secrets e variabili del workflow notifiche: vedi `docs/notification-cron.md`.

Le icone dell'app installabile sono in `scripts/icone/*.b64` e vengono ricreate in `public/icons` prima di
`dev` e `build`.

## Contribuire

Il ramo `main` è protetto: le modifiche passano da una pull request approvata dall'autore
(vedi `.github/CODEOWNERS`).

## Struttura

```
src/
  pages/        una pagina per sezione (Uscite, Magazzino, Corso = Scuola, Report, Members = Soci…)
  components/   componenti condivisi (form uscita, menu, rotte protette…)
  services/     accesso a Supabase (loans, scuola, equipment, settings…)
  utils/        logica pura e testata (permessi, DPI, esportazioni CSV/PDF/XLSX, dati scuola)
supabase/
  migrations/   schema e sicurezza del database
  functions/    Edge Functions (notification-cron, notification-email, send-approval-email)
docs/           note operative, manuale soci e documentazione tecnica
```

## Prossimi passi possibili

- passaggio graduale a TypeScript con i tipi generati da `supabase gen types`;
- QR code sui materiali per prestito e ispezione dal telefono;
- registrazione offline di consegne e rientri con sincronizzazione;
- rilievi 3D (Potree) collegati a uscite e grotte.
