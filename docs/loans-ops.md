# Prestiti: note operative

Queste note riepilogano gli interventi necessari per mantenere il flusso prestiti stabile.

## 1) Quantita magazzino aggiornata automaticamente
- La tabella `equipment` usa `quantity_total` e `quantity_available`.
- Le funzioni trigger su `loans` devono usare questi nomi di colonna.
- Le funzioni sono `SECURITY DEFINER` per poter aggiornare `equipment` anche con RLS attivo.
- Se viene segnalato materiale mancante, la disponibilita aumenta solo di `quantity - missing_quantity`.

Se i trigger risultano disabilitati, riabilitarli:
```sql
alter table public.loans enable trigger loans_adjust_equipment_insert;
alter table public.loans enable trigger loans_adjust_equipment_update;
alter table public.loans enable trigger loans_adjust_equipment_delete;
```

## 2) Backfill borrower_email (per prestiti storici)
Se alcuni prestiti non hanno `borrower_email`, i soci potrebbero non poter chiudere il prestito.
Prima verificare i match:
```sql
select l.id, l.borrower_name, p.email
from public.loans l
join public.profiles p
  on lower(trim(p.first_name || ' ' || p.last_name)) = lower(trim(l.borrower_name))
where l.borrower_email is null;
```
Se i risultati sono corretti:
```sql
update public.loans l
set borrower_email = p.email
from public.profiles p
where l.borrower_email is null
  and lower(trim(p.first_name || ' ' || p.last_name)) = lower(trim(l.borrower_name));
```

## 3) Materiale mancante
Le colonne usate sono `missing_quantity` (intero) e `missing_notes` (testo).
Quando si chiude un prestito, `missing_quantity` indica quanti pezzi non sono rientrati.
