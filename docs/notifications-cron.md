## Edge Function `notification-cron`

1. **Prerequisiti**  
   Assicurati di avere configurato in Supabase le variabili:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - facoltative `NOTIFICATION_ADMIN_EMAIL`, `NOTIFICATION_MAGAZZINIERE_EMAIL`, ... (per i destinatari)
   - `NOTIFICATION_EMAIL_WEBHOOK` per l’invio email (endpoint custom o integrazione esterna)
   - `NOTIFICATION_CRON_SECRET` per proteggere la funzione cron.

2. **Deploy**  
   Nell’IDE di Supabase vai su Edge Functions:
   ```bash
   supabase functions deploy notification-cron
   ```

3. **Trigger pianificato**  
   Sempre da Supabase → Scheduled Tasks, crea un cron che richiami l’URL della funzione (`/functions/v1/notification-cron`) e passa l’header `Authorization: Bearer <NOTIFICATION_CRON_SECRET>`.

4. **Funzionamento**  
   - La funzione calcola le notifiche per prestiti materiali scaduti e libri non restituiti.
   - Inserisce/aggiorna la tabella `notifications`.
   - Invia le email per le notifiche con `due_date` scaduta e `sent_email_at` nullo.
