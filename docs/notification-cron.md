# Notifiche automatiche (`notification-cron`)

Il job `supabase/functions/notification-cron/index.ts` controlla:

| Tipo | Quando scatta | Chi viene avvisato |
|---|---|---|
| `OVERDUE` | prestito materiale ancora aperto oltre la data di riconsegna | magazziniere (in app) + webhook email |
| `USCITA_RIENTRO` | uscita ancora aperta oltre il **rientro previsto** + tolleranza (60 minuti di default) | presidente e responsabile (in app) + webhook email |
| `DPI_ISPEZIONE` | ispezione scaduta o entro 30 giorni | magazziniere (in app) + webhook email |
| `DPI_FINE_VITA` | fine vita superata o entro 90 giorni | magazziniere (in app) + webhook email |

Ogni avviso viene registrato una sola volta in `notification_log` (chiave `kind` + `ref_id`): il job può girare
spesso senza mandare doppioni. Se cambia la data di riconsegna o il rientro previsto, l'avviso riparte.

> Il promemoria di rientro **non è un sistema di allerta soccorso**. GitHub può ritardare le esecuzioni
> pianificate di 10-20 minuti e il job dipende da connessione, email e configurazione. Le procedure di
> sicurezza del gruppo restano quelle di sempre; in emergenza si chiama il 112.

## Esecuzione pianificata (GitHub Actions)

Il workflow `.github/workflows/notification-cron.yml` gira ogni 30 minuti. Configura in
*Settings → Secrets and variables → Actions*:

- **Secrets**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NOTIFICATION_CRON_SECRET` (facoltativo),
  `NOTIFICATION_EMAIL_WEBHOOK`, `NOTIFICATION_EMAIL_WEBHOOK_SHARED_SECRET`, `NOTIFICATION_ADMIN_EMAIL`,
  `NOTIFICATION_MAGAZZINIERE_EMAIL`, `NOTIFICATION_PRESIDENTE_EMAIL`, `NOTIFICATION_EMAIL_WEBHOOK_TEST_MODE`.
- **Variables** (facoltativa): `USCITA_RIENTRO_TOLLERANZA_MINUTI`.

GitHub disattiva i workflow pianificati dei repository pubblici dopo 60 giorni senza commit: se succede,
riattivalo dalla scheda *Actions*.

## Formato del webhook

Il webhook riceve un `POST` JSON firmato (header `x-speleo-signature`, HMAC-SHA256 in base64url del corpo) con
uno di questi `type`:

- `loans_due`: stesso formato di prima (`loans`, `count`, `total_due_count`, `recipients`);
- `uscite_rientro_superato`: `uscite` (con `responsabile_email`), `tolerance_minutes`, `recipients.responsabili`;
- `dpi_in_scadenza`: `items` con `tipo` (`ispezione` | `fine_vita`), `data`, `nome`.

Se il servizio che invia le email gestisce solo `loans_due`, va esteso per i due nuovi tipi.

## Esecuzione manuale

```bash
export SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...
deno run -A supabase/functions/notification-cron/index.ts --run-once
```

La risposta riporta per ogni controllo quanti elementi sono stati trovati (`total`) e quanti erano nuovi (`new`).

## Correzioni rispetto alla versione precedente

- la query dei prestiti chiedeva la colonna `borrower_contact`, che non esiste in `loans`: il controllo falliva;
- non venivano esclusi i prestiti già chiusi;
- l'indice anti-doppioni conteneva colonne `NULL` e quindi non bloccava nulla; il workflow inoltre eseguiva lo
  script due volte di seguito.
