# Gestionale GSU in sintesi tecnica

_Com'è fatto, cosa è cambiato, cosa resta da fare. Edizione 18 settembre 2026 · versione app 1.1.0._


## Che cos'è

Web app per la vita pratica del gruppo: uscite, magazzino e prestiti, biblioteca, scuola, soci e report. Interfaccia React con Vite, dati su Supabase (PostgreSQL), pubblicazione automatica su Netlify a ogni modifica del ramo `main`, attività pianificate su GitHub Actions.

| Componente | Dove |
|---|---|
| Codice | github.com/Stratos915/Speleo |
| Sito | speleoapp.netlify.app |
| Database | Supabase, progetto `speleo-app` (piano gratuito, nessun backup automatico) |
| Notifiche | GitHub Actions ogni 30 minuti + funzione `notification-email` |


## Che cosa è cambiato

Revisione svolta tra il 16 e il 18 settembre 2026. Il principio guida: le regole importanti vivono nel database, non nell'interfaccia. Nascondere un pulsante non protegge nulla.

| Prima | Adesso |
|---|---|
| Un utente poteva assegnarsi un ruolo o approvarsi da solo; un'email era scritta nel codice come amministratore | Il ruolo arriva solo dalla tabella dei profili, protetta da un trigger |
| I prestiti si registravano con scritture dirette dal browser | Funzioni transazionali con blocco della riga: niente sovra-prestiti né magazzino falsato |
| Statistiche e sessioni leggibili da chiunque fosse collegato | Visibili solo ad admin e presidente |
| Dati della scuola e link delle ispezioni salvati nel browser di una persona | Sul server, condivisi, con gestione dei conflitti e archivio file privato |
| Qualsiasi utente collegato poteva eliminare qualsiasi uscita; le foto erano aperte anche a chi non aveva accesso | Eliminazione riservata ad admin e presidente; archivio foto riservato ai profili approvati |
| Promemoria automatici mai arrivati per tre difetti diversi | Quattro controlli attivi, senza doppioni, con invio email verificato |

Aggiunte anche le scadenze dei DPI con avvisi a semaforo, il rientro previsto delle uscite, l'installazione su telefono e 21 test automatici. Il file principale dell'app passa da 701 a 486 KB.


## Come funziona oggi

GitHub Actions ogni 30 minuti → Il job interroga il database → Chiamata firmata alla funzione email → Invio SMTP e registro aggiornato

| Avviso | Quando scatta |
|---|---|
| Prestito scaduto | Materiale non riconsegnato entro la data indicata |
| Rientro superato | Uscita ancora aperta oltre l'orario previsto più un'ora di tolleranza |
| Ispezione DPI | Scaduta o entro 30 giorni |
| Fine vita DPI | Superata o entro 90 giorni |

Otto migrazioni in `supabase/migrations/` descrivono lo schema e le regole di sicurezza: sono idempotenti e vanno eseguite in ordine di nome. Il collaudo è avvenuto su PostgreSQL locale, poi con una prova generale sul database reale dentro una transazione annullata, infine con le verifiche dopo l'applicazione.


## Da ricordare

> **⚠️ Il promemoria di rientro non è un sistema di allerta**<br>
> Le esecuzioni pianificate possono ritardare e la catena dipende da rete ed email. In emergenza si chiama il 112.

- Le email partono da un indirizzo Gmail personale: per le comunicazioni ufficiali va sostituito con una casella del gruppo, aggiornando tre segreti.
- Le date di ispezione e fine vita dei DPI vanno compilate materiale per materiale: finché sono vuote quegli avvisi non scattano.
- Copia di sicurezza dei dati nello schema `backup_20260917`, da rimuovere dopo qualche settimana di esercizio tranquillo.
- Il piano Supabase gratuito non prevede backup automatici: conviene esportare i dati con regolarità.
- Tutti i soci vedono l'anagrafica completa: utile per scegliere i partecipanti, ma da limitare in futuro.

> **Il documento completo**<br>
> Architettura, dettaglio delle otto migrazioni, cronologia, problemi incontrati con le relative soluzioni e query di controllo si trovano in `docs/TECNICO.md` e nella versione PDF distribuita al gruppo.
