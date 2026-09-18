# Gestionale GSU documento tecnico

_Architettura, interventi e cronologia del lavoro svolto. Edizione 18 settembre 2026 · versione app 1.1.0._


## Quadro generale

Il gestionale del Gruppo Speleologico Urbino è una web app che raccoglie uscite, magazzino e prestiti materiali, biblioteca, scuola di speleologia, anagrafica soci e report. Nasce come progetto interno, sviluppato con il supporto di strumenti di generazione del codice, ed è in uso da parte dei soci.

Questo documento descrive com'è fatta l'applicazione, quali problemi sono stati individuati in una revisione condotta tra il 16 e il 18 settembre 2026, quali interventi sono stati realizzati e come è stato verificato il risultato. Serve a chi dovrà metterci mano in futuro, anche a distanza di tempo.

### Indirizzi e componenti

| Componente | Dove si trova | Note |
|---|---|---|
| Codice | github.com/Stratos915/Speleo | Ramo principale `main` |
| Sito | speleoapp.netlify.app | Pubblicazione automatica a ogni modifica di `main` |
| Database e autenticazione | Supabase, progetto `speleo-app` | Identificativo `yqyijsjpzutwdgbtimvv`, piano gratuito |
| Notifiche | GitHub Actions | Workflow `notification-cron.yml`, ogni 30 minuti |
| Invio email | Supabase Edge Function `notification-email` | SMTP tramite nodemailer |

> **⚠️ Piano gratuito, nessun backup automatico**<br>
> Supabase sul piano free non conserva copie di sicurezza. Prima delle migrazioni è stata creata una copia completa nello schema `backup_20260917` dello stesso database, più un file JSON esterno. È bene programmare esportazioni periodiche o valutare il passaggio a un piano con backup.


## Architettura

### Tecnologie

| Livello | Scelta | Perché |
|---|---|---|
| Interfaccia | React 19 con Vite 7, JavaScript | Poche dipendenze: quattro pacchetti a runtime |
| Navigazione | React Router 7 | Pagine caricate a blocchi separati |
| Dati | Supabase (PostgreSQL) | Database, autenticazione, archivio file e funzioni in un solo servizio |
| Sicurezza dei dati | Row Level Security di PostgreSQL | Le regole valgono anche se qualcuno chiama l'API direttamente |
| Operazioni critiche | Funzioni `security definer` | Prestiti e salvataggi della scuola avvengono in modo transazionale |
| Attività pianificate | GitHub Actions + Deno | Nessun server da mantenere |

### Struttura del codice

```
src/
  pages/        una pagina per sezione (Uscite, Magazzino, Corso = Scuola, Report, Members…)
  components/   componenti condivisi (form uscita, rotte protette, elenco avvisi…)
  services/     accesso a Supabase (loans, scuola, equipment, settings, members…)
  utils/        logica pura e testata (permessi, DPI, esportazioni, dati scuola)
  context/      sessione e ruolo dell'utente collegato
supabase/
  migrations/   schema e sicurezza del database, in ordine cronologico
  functions/    Edge Functions (notification-cron, notification-email, send-approval-email)
  sql/          script storici, mantenuti come documentazione
docs/           note operative e manuali
```

### Il modello dei permessi

I ruoli sono `admin`, `presidente`, `consiglio`, `segretario`, `tesoriere`, `magazziniere`, `direttore_scuola`, `socio`. Nel database il ruolo è un tipo dedicato (`app_role`), non testo libero.

L'interfaccia li legge da `src/utils/permissions.js` per mostrare o nascondere i pulsanti, ma la protezione vera è nel database: ogni regola importante è replicata come policy RLS o come controllo dentro una funzione. Nascondere un pulsante non protegge nulla.

> **Regola pratica**<br>
> Quando si aggiunge una funzione che tocca dati sensibili, si scrive prima la regola SQL e poi l'interfaccia. Il contrario produce protezioni apparenti.


## Il punto di partenza

L'analisi iniziale ha riconosciuto diversi punti di forza: perimetro funzionale aderente alla vita reale del gruppo, stack leggero, uso già presente di RLS e audit delle approvazioni, webhook firmati. Sono però emerse criticità che rendevano fragili sicurezza e dati.

| Criticità | Conseguenza pratica | Gravità |
|---|---|---|
| Il ruolo veniva letto anche da dati modificabili dall'utente, e un'email era scritta nel codice come super amministratore | Un utente poteva assegnarsi un ruolo o approvarsi da solo | Alta |
| I prestiti si registravano con scritture dirette dal browser | Un socio poteva modificare quantità e stato dei propri prestiti e falsare il magazzino | Alta |
| Statistiche di accesso leggibili da chiunque fosse collegato | Cronologia di navigazione ed email di tutti i soci esposte | Alta |
| Dati della scuola e mappa delle ispezioni salvati solo nel browser | Perdita dei dati cambiando dispositivo o svuotando la cache; nessuna condivisione | Alta |
| Job delle notifiche con query errata e indice anti-doppioni inefficace | Avvisi mai inviati oppure inviati più volte | Media |
| File molto estesi (Corso 1.883 righe, Report oltre 2.300) e nessun test | Manutenzione difficile, rischio di regressioni | Media |

Durante l'intervento, l'accesso diretto al database ha rivelato altre due criticità che nessuna analisi del solo codice avrebbe potuto trovare, descritte più avanti: una policy che permetteva a chiunque fosse collegato di eliminare qualsiasi uscita, e le regole dell'archivio foto aperte anche a chi non aveva effettuato l'accesso.


## Interventi sul database

Lo schema si aggiorna con le migrazioni in `supabase/migrations/`, da eseguire in ordine di nome. Sono idempotenti: rieseguirle non produce effetti collaterali. Otto migrazioni sono state applicate al database di produzione il 17 settembre 2026.

| File | Cosa introduce |
|---|---|
| 01 · ruoli_e_profili | Unica definizione di `current_user_role()` e `has_any_role()`; trigger che impedisce a un utente di modificarsi ruolo, stato di approvazione e data di approvazione |
| 02 · prestiti_transazionali | Funzioni `loan_create` e `loan_return`, trigger sulla disponibilità, policy che riservano le scritture dirette allo staff |
| 03 · privacy_statistiche | Statistiche e sessioni leggibili solo da admin e presidente; nessuno può registrare eventi a nome altrui |
| 04 · scuola_su_database | Tabella `scuola_dati` con numero di versione, funzione `scuola_salva`, archivio privato `scuola-documenti` |
| 05 · magazzino_dpi | Colonne `prossima_ispezione` e `fine_vita`, impostazioni condivise, rifornimento atomico `equipment_restock` |
| 06 · uscite_rientro_previsto | Colonne `rientro_previsto`, `status`, `closed_at` e indice sulle uscite aperte |
| 07 · notifiche_idempotenti | Campo `ref_id` con indice univoco su (kind, ref_id); `loan_id` reso facoltativo |
| 08 · permessi_uscite_e_foto | Rimozione della policy che consentiva a tutti di eliminare le uscite; regole dell'archivio foto riservate ai profili approvati |

### Come funziona ora un prestito

Il socio sceglie il materiale → loan_create blocca la riga e verifica la disponibilità → Il trigger aggiorna il magazzino → loan_return chiude e registra i pezzi mancanti

Il blocco della riga (`for update`) impedisce che due soci prendano contemporaneamente gli ultimi pezzi. La quantità indisponibile è la quantità prestata se il prestito è attivo, i soli pezzi mancanti se è chiuso. Eliminare un prestito chiuso non modifica il magazzino, così un pezzo dato per perso non ricompare per errore.

> **Una scelta meditata**<br>
> La versione iniziale bloccava con un errore ogni operazione che avrebbe portato i disponibili sopra il totale. Sui dati storici, calcolati in passato dal browser, questo avrebbe impedito ai soci di restituire il materiale. Ora il valore viene limitato al totale; resta invece il blocco quando scenderebbe sotto zero, che segnala un errore reale.

### Verifica della coerenza del magazzino

```
select e.equipment_id, e.name, e.quantity_total, e.quantity_available,
       e.quantity_total - coalesce(l.in_prestito, 0) as disponibili_attesi
  from public.equipment e
  left join (select equipment_id, sum(quantity) as in_prestito
               from public.loans where status in ('in_corso','active')
              group by equipment_id) l using (equipment_id)
 where e.quantity_available is distinct from e.quantity_total - coalesce(l.in_prestito, 0);
```

Al momento dell'intervento una sola riga risultava diversa, e corrispondeva a un pezzo segnato come perso in un prestito chiuso: dato coerente, non un errore.


## Interventi sull'applicazione

| Area | Modifiche principali |
|---|---|
| Autenticazione | Il ruolo arriva solo dalla tabella `profiles`; rimossa l'email di amministratore scritta nel codice; le rotte protette attendono il profilo prima di decidere |
| Prestiti | `PrestitoAvanzato` e `StoricoPrestiti` usano le funzioni del database; gestione dei pezzi mancanti con nota; il magazziniere può chiudere ed eliminare i prestiti di tutti |
| Uscite | Campo «rientro previsto», chiusura dell'uscita vincolata alla restituzione del materiale, restituzione direttamente dalla scheda |
| Magazzino | Date di ispezione e fine vita con avvisi a semaforo, filtro dei materiali in scadenza, rifornimento atomico, cartella ispezioni condivisa |
| Scuola | Dati sul server con salvataggio automatico e gestione dei conflitti; file in archivio privato; migrazione automatica di quanto era salvato nel browser |
| Report | Esportazioni CSV, XLSX e PDF estratte in `utils/exporters.js` (circa 550 righe), dati della scuola letti dal database |
| Prestazioni | Pagine caricate a blocchi: il file principale passa da 701 a 486 KB |
| Installabilità | Manifest, service worker e icone generate da file di testo in `scripts/icone` |

Sono stati aggiunti 21 test automatici sulle parti pure: permessi per ruolo, calcolo delle scadenze DPI, trasformazione dei dati della scuola e generazione dei file esportati. Si eseguono con `npm test`.


## Notifiche automatiche

Il job `supabase/functions/notification-cron/index.ts` viene eseguito da GitHub Actions ogni 30 minuti e svolge quattro controlli, ognuno indipendente: un errore su uno non blocca gli altri.

| Tipo | Quando scatta | Destinatari |
|---|---|---|
| OVERDUE | Prestito aperto oltre la data di riconsegna | Magazziniere, amministratore, socio interessato |
| USCITA_RIENTRO | Uscita aperta oltre il rientro previsto più la tolleranza (60 minuti) | Presidente, amministratore, responsabile |
| DPI_ISPEZIONE | Ispezione scaduta o entro 30 giorni | Magazziniere, amministratore, presidente |
| DPI_FINE_VITA | Fine vita superata o entro 90 giorni | Magazziniere, amministratore, presidente |

### Idempotenza

Ogni avviso ha un identificativo formato da tipo e riferimento: per i prestiti l'identificativo del prestito, per le uscite l'unione di uscita e orario di rientro, per i DPI l'unione di materiale e data di scadenza. L'indice univoco su `(kind, ref_id)` impedisce il doppio invio anche se il job gira spesso. Se la data cambia, l'avviso riparte: è il comportamento voluto.

### Catena di invio

GitHub Actions ogni 30 minuti → Il job interroga il database → Chiamata firmata alla funzione email → Invio SMTP e registro aggiornato

La chiamata è firmata con HMAC-SHA256 del corpo, in base64url, nell'intestazione `x-speleo-signature`. La funzione `notification-email` verifica la firma prima di fare qualsiasi cosa, quindi può restare pubblica senza rischio di invii a nome del gruppo.

> **⚠️ Il promemoria di rientro non è un sistema di allerta**<br>
> GitHub può ritardare le esecuzioni pianificate di 10-20 minuti e la catena dipende da rete, email e configurazione. Le procedure di sicurezza del gruppo restano quelle di sempre: in emergenza si chiama il 112, che attiva il Soccorso Speleologico.


## Verifiche e collaudo

Il lavoro è stato verificato su quattro livelli, prima di toccare i dati reali.

- Test automatici e controllo del codice: 21 test superati, nessun errore di lint, compilazione riuscita.
- Migrazioni su un PostgreSQL locale, riproducendo le particolarità del database reale: ruolo come tipo dedicato, colonna `loan_id` obbligatoria, policy storiche, archivio foto aperto.
- Prove di comportamento sulle regole: tentativo di auto-assegnazione del ruolo, sovra-prestito, conflitto di versione della scuola, restituzione con dati incoerenti, eliminazione di prestiti chiusi, cancellazione di un'uscita da parte di un socio.
- Prova generale sul database reale, eseguendo i passaggi critici dentro una transazione poi annullata: nessuna modifica lasciata, ma conferma che tipi e permessi reggevano.

Dopo l'applicazione, ogni migrazione è stata verificata con query di controllo: profili approvati, funzioni e tabelle create, stato delle uscite, coerenza del magazzino, righe del registro notifiche.

> **Perché la prova generale è stata utile**<br>
> Ha confermato in anticipo tre cose che si sarebbero potute scoprire solo a danno fatto: la compatibilità del tipo `app_role` con le nuove funzioni, la possibilità di creare regole sull'archivio file, e il vincolo obbligatorio su `loan_id` che avrebbe fatto fallire metà delle notifiche.


## Cronologia del lavoro

| Quando | Cosa |
|---|---|
| 16 settembre | Analisi del repository, individuazione delle criticità, scrittura delle sette migrazioni, riscrittura del job notifiche, estrazione delle esportazioni, test e manuale soci |
| 16-17 settembre | Configurazione dei permessi dell'app GitHub e caricamento del lavoro su un ramo dedicato, con verifica file per file rispetto alla copia testata |
| 17 settembre | Revisione delle migrazioni riscritte, correzione del blocco che avrebbe impedito le restituzioni, apertura della pull request |
| 17 settembre | Collegamento diretto a Supabase: controlli preliminari, scoperta delle due falle preesistenti e del vincolo su `loan_id`, migrazione 08 |
| 17 settembre | Copia di sicurezza, applicazione delle otto migrazioni, verifiche, unione della pull request e pubblicazione |
| 18 settembre | Notifiche: scoperta del job interno mai funzionante, nuova funzione email, configurazione e collaudo fino alla ricezione |
| 18 settembre | Manuale in sintesi e manuale completo con icone e schemi; questo documento tecnico |


## Problemi incontrati e soluzioni

### Il caso delle email

La parte più lunga dell'intervento. Il sintomo era semplice, la causa era una catena di tre problemi diversi, ognuno nascosto dal precedente.

| Sintomo | Causa reale | Soluzione |
|---|---|---|
| Il job risultava riuscito ma non arrivava nulla | Modalità di prova attiva nei secrets | Disattivata dopo la prima verifica |
| Errore 500 dalla funzione email | Credenziali SMTP non configurate | Aggiunti i sei valori tra i segreti delle funzioni |
| Yahoo rifiutava con errore 554 | I provider di posta personale respingono gli invii dai server cloud | Passaggio a Gmail con password per le app |
| Porta 587 in errore immediato | L'ambiente delle funzioni non gestisce l'aggiornamento cifrato su quella porta | Uso della porta 465 con connessione cifrata |
| Gmail rispondeva «Authentication Required» | La libreria denomailer non completava l'autenticazione | Sostituita con nodemailer |

Per evitare tentativi alla cieca, alla funzione è stato aggiunto un controllo diagnostico: chiamandola con `{"diag": true}` restituisce server, porta, utente mascherato e lunghezza della password, senza rivelare il segreto. È stato questo a dimostrare che la configurazione era corretta e che il problema stava altrove.

### Il programmatore interno mai funzionante

Nel database esisteva un'attività pianificata che ogni mattina alle 8 avrebbe dovuto inviare i promemoria sui prestiti. Era fallita 224 volte di fila dal 6 febbraio 2026: l'indirizzo conteneva ancora un segnaposto non sostituito e la chiamata usava una funzione inesistente. Conteneva inoltre una chiave scritta in chiaro. È stata disattivata.

### Altri ostacoli

- Permessi GitHub: l'app risultava autorizzata ma non installata su alcun repository; una volta installata, il caricamento è stato possibile. Resta esclusa la modifica dei workflow, che richiede un permesso a parte e va fatta a mano.
- Icona dell'app: il file di testo che la contiene aveva perso quattro caratteri nel trasferimento, rendendo l'immagine illeggibile. Riscritto su righe brevi e verificato decodificandolo.
- Un campo data dell'uscita non si ripresentava in modifica, per una conversione mancante: corretto prima del caricamento.


## Configurazione attuale

### Segreti su GitHub (Actions)

| Nome | Contenuto |
|---|---|
| SUPABASE_URL | Indirizzo del progetto Supabase |
| SUPABASE_SERVICE_ROLE_KEY | Chiave di servizio: accesso completo, da non diffondere |
| NOTIFICATION_EMAIL_WEBHOOK | Indirizzo della funzione `notification-email` |
| NOTIFICATION_EMAIL_WEBHOOK_SHARED_SECRET | Segreto della firma, identico su Supabase |
| NOTIFICATION_EMAIL_WEBHOOK_TEST_MODE | `true` per provare senza inviare, `false` in esercizio |
| NOTIFICATION_ADMIN_EMAIL, _MAGAZZINIERE_, _PRESIDENTE_ | Destinatari degli avvisi |
| USCITA_RIENTRO_TOLLERANZA_MINUTI (variabile) | Tolleranza sul rientro, 60 minuti se assente |

### Segreti su Supabase (Edge Functions)

| Nome | Contenuto |
|---|---|
| SMTP_HOST, SMTP_PORT, SMTP_SECURE | `smtp.gmail.com`, `465`, `true` |
| SMTP_USER, SMTP_PASS, SMTP_FROM | Indirizzo Gmail, password per le app, stesso indirizzo come mittente |
| NOTIFICATION_EMAIL_WEBHOOK_SHARED_SECRET | Segreto della firma, identico a quello su GitHub |

> **⚠️ Mittente provvisorio**<br>
> Le email partono da un indirizzo Gmail personale. Per le comunicazioni ufficiali conviene passare a una casella del gruppo: basta aggiornare `SMTP_USER`, `SMTP_PASS` e `SMTP_FROM`, senza toccare il codice.


## Cosa resta da fare

- Compilare le date di ispezione e fine vita dei DPI: finché restano vuote quegli avvisi non scattano.
- Primo accesso del magazziniere dal dispositivo abituale, per trasferire sul server i link delle ispezioni salvati nel browser.
- Passare a un indirizzo del gruppo come mittente delle email.
- Eliminare la vecchia funzione `loan-reminder-cron`, ormai sostituita.
- Rimuovere lo schema `backup_20260917` dopo qualche settimana di esercizio tranquillo.
- Limitare la lettura dell'anagrafica soci: oggi tutti i soci vedono i dati di tutti, cosa utile per scegliere i partecipanti ma eccessiva rispetto al necessario.
- Valutare il passaggio graduale a TypeScript, i codici QR sui materiali, la registrazione offline con sincronizzazione e i rilievi tridimensionali collegati alle grotte.


## Appendice: comandi e query utili

### Sviluppo

```
npm ci                  installazione delle dipendenze
cp .env.example .env.local   e inserimento di URL e chiave anon
npm run dev             avvio locale
npm test                21 test automatici
npm run lint            controllo del codice
npm run build           compilazione per la pubblicazione
```

### Esecuzione manuale del job notifiche

```
export SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...
deno run -A supabase/functions/notification-cron/index.ts --run-once
```

### Controlli rapidi sul database

```
-- amministratori attivi
select email, role, approval_status from public.profiles
 where role in ('admin','presidente');

-- ultimi avvisi registrati
select kind, ref_id, status, message, created_at
  from public.notification_log order by created_at desc limit 20;

-- materiali con scadenze imminenti
select name, prossima_ispezione, fine_vita from public.equipment
 where prossima_ispezione <= current_date + 30
    or fine_vita <= current_date + 90;
```

### Prova dell'invio email senza spedire nulla

Chiamando la funzione con `test_run` attivo si ottiene il riepilogo di destinatari e oggetto senza alcun invio; con `diag` si ottiene la configurazione SMTP in uso, password esclusa.
