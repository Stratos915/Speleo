import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { etichettaRuolo, ruoliDelProfilo } from '../utils/permissions.js';

const STATI = { approved: 'approvato', rejected: 'rifiutato', pending: 'in attesa' };

function nomeCompleto(profilo) {
  return `${profilo.first_name ?? ''} ${profilo.last_name ?? ''}`.trim();
}

function dataBreve(value) {
  if (!value) return 'N/D';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'N/D' : date.toLocaleDateString('it-IT');
}

function messaggioErrore(error) {
  const testo = error?.message ?? '';
  if (error?.code === 'PGRST202' || /elimina_account/.test(testo)) {
    return 'Funzione non ancora attiva: va eseguita la migrazione 13 (elimina_account) su Supabase.';
  }
  return testo || 'Impossibile eliminare l\'account.';
}

/**
 * Elenco degli account che possono accedere all'app, con il pulsante «Elimina»
 * per togliere quelli che non servono più. Solo admin e presidente (lo controlla
 * anche il database, nella funzione elimina_account).
 */
export default function AccountRegistrati({ currentUserId, onEliminato }) {
  const [profili, setProfili] = useState([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState('');
  const [esito, setEsito] = useState('');
  const [cerca, setCerca] = useState('');
  const [inCorso, setInCorso] = useState(null);

  const carica = useCallback(async () => {
    setCaricamento(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .neq('approval_status', 'pending')
        .order('email', { ascending: true });
      if (error) throw error;
      setProfili(data ?? []);
    } catch (loadError) {
      setErrore(loadError.message ?? 'Impossibile caricare gli account.');
    } finally {
      setCaricamento(false);
    }
  }, []);

  useEffect(() => {
    carica();
  }, [carica]);

  const filtrati = useMemo(() => {
    const termine = cerca.trim().toLowerCase();
    if (!termine) return profili;
    return profili.filter(
      (profilo) =>
        String(profilo.email ?? '').toLowerCase().includes(termine) ||
        nomeCompleto(profilo).toLowerCase().includes(termine),
    );
  }, [profili, cerca]);

  async function elimina(profilo) {
    const etichetta = profilo.email ?? nomeCompleto(profilo) ?? 'questo account';
    const conferma = window.confirm(
      `Eliminare l'account ${etichetta}?\n\nNon potrà più accedere all'app. L'anagrafica del socio, i prestiti e le uscite restano. L'operazione non si può annullare.`,
    );
    if (!conferma) return;
    setInCorso(profilo.id);
    setErrore('');
    setEsito('');
    try {
      const { error } = await supabase.rpc('elimina_account', { p_user_id: profilo.id });
      if (error) throw error;
      setProfili((prev) => prev.filter((row) => row.id !== profilo.id));
      setEsito(`Account ${etichetta} eliminato.`);
      onEliminato?.();
    } catch (deleteError) {
      setErrore(messaggioErrore(deleteError));
    } finally {
      setInCorso(null);
    }
  }

  return (
    <div style={{ marginTop: '1rem' }}>
      <strong>Account registrati</strong>
      <p style={{ margin: '0.25rem 0 0.5rem', color: 'var(--color-muted)' }}>
        Elimina gli account che non servono più: la persona non potrà più accedere, ma la sua scheda in Soci resta.
      </p>
      <input
        type="search"
        placeholder="Cerca per email o nome"
        value={cerca}
        onChange={(event) => setCerca(event.target.value)}
        style={{ marginBottom: '0.5rem' }}
      />
      {errore && <p style={{ color: '#c92a2a' }}>{errore}</p>}
      {esito && <p style={{ color: '#2b8a3e' }}>{esito}</p>}
      {caricamento ? (
        <p>Caricamento account...</p>
      ) : filtrati.length ? (
        <div style={{ display: 'grid', gap: '0.5rem' }}>
          {filtrati.map((profilo) => {
            const tuo = profilo.id === currentUserId;
            return (
              <div
                key={profilo.id}
                style={{
                  border: '1px solid var(--color-border)',
                  borderRadius: '0.75rem',
                  padding: '0.6rem 0.75rem',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                  <strong>{profilo.email ?? 'Email non disponibile'}</strong>
                  <p style={{ margin: '0.15rem 0 0', color: 'var(--color-muted)' }}>
                    {[nomeCompleto(profilo), ruoliDelProfilo(profilo.role, profilo.ruoli_extra).map(etichettaRuolo).join(' + '), STATI[profilo.approval_status] ?? profilo.approval_status, `dal ${dataBreve(profilo.created_at)}`]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                {tuo ? (
                  <span className="chip">Il tuo account</span>
                ) : (
                  <button
                    type="button"
                    style={{ background: '#e03131' }}
                    onClick={() => elimina(profilo)}
                    disabled={inCorso === profilo.id}
                  >
                    {inCorso === profilo.id ? 'Eliminazione...' : 'Elimina'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p>Nessun account trovato.</p>
      )}
    </div>
  );
}
