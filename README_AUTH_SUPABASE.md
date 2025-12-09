# Configurazione Supabase per reset/inviti

Per far funzionare correttamente il flusso di invito, reset e primo accesso degli utenti su Speleo App, segui questi passaggi nella dashboard Supabase:

1. Apri **Authentication → URL Configuration**.
2. Imposta **Site URL** su:
   ```
   https://creative-gelato-81d26e.netlify.app
   ```
3. Nella sezione **Redirect URLs**, inserisci (uno per riga):
   ```
   https://creative-gelato-81d26e.netlify.app
   https://creative-gelato-81d26e.netlify.app/auth/callback
   https://creative-gelato-81d26e.netlify.app/reset-password
   http://localhost:5173
   ```

- Gli URL `https://creative-gelato-81d26e.netlify.app/...` servono per la versione in produzione.
- `http://localhost:5173` permette di usare il flusso reset anche in sviluppo locale.

Una volta salvati questi valori, i link inviati da Supabase (invito, forgot password) porteranno gli utenti sulla pagina `/reset-password` pubblicata su Netlify, dove potranno impostare la nuova password e completare l'accesso.
