# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Supabase setup

L'app utilizza alcune tabelle Supabase (`equipment`, `members`, `uscite`, `loans`). Se non hai ancora creato la tabella dei prestiti, puoi usare lo script `docs/loans-table.sql` dalla dashboard SQL di Supabase per generarla rapidamente (comprende colonne per materiale, socio collegato, quantità e date consegna/restituzione).

Per collegare un'uscita a un responsabile e ai materiali prenotati sono richieste le colonne `responsabile_id` (uuid) e `responsabile_nome` (text) nella tabella `uscite`. Puoi aggiungerle con:

```sql
alter table public.uscite add column if not exists responsabile_id uuid;
alter table public.uscite add column if not exists responsabile_nome text;
alter table public.uscite add column if not exists participants_ids uuid[];
alter table public.uscite add column if not exists participants_manual text;
alter table public.uscite add column if not exists feedback text;
alter table public.uscite add column if not exists photo_urls text[];
alter table public.uscite add column if not exists status text default 'aperta';
alter table public.uscite add column if not exists closed_at timestamptz;
```

Ricorda inoltre di creare le RLS policy di `SELECT`/`UPDATE` per `equipment` e di `SELECT` per `members` se usi Row Level Security.

Per tracciare il pagamento della tessera annuale, aggiungi la colonna `membership_paid boolean default false` alla tabella `members`:

```sql
alter table public.members add column if not exists membership_paid boolean default false;
```

Per caricare le foto direttamente dall'app crea anche un bucket Storage (es. `uscite-foto`) dalla dashboard Supabase e rendilo pubblico o fornisci URL firmati adeguati. Aggiungi al file `.env.local` la variabile:

```
VITE_SUPABASE_PHOTOS_BUCKET=uscite-foto
```

Se vuoi memorizzare note specifiche sui materiali (acquisti, sostituzioni, ecc.) aggiungi alla tabella `equipment` una colonna testuale:

```sql
alter table public.equipment add column if not exists notes text;
```

Per collegare a ogni materiale la relativa scheda ispezione (link Drive), aggiungi anche:

```sql
alter table public.equipment add column if not exists inspection_url text;
```

Se vuoi usare il pulsante globale **Ispezioni** nella pagina Inventario, configura in `.env.local`:

```
VITE_INSPECTIONS_FOLDER_URL=https://drive.google.com/...
```

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
