import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMembers } from '../services/members';

const EMPTY_FORM = {
  titolo: '',
  luogo: '',
  data: '',
  ora: '',
  tipo: 'sociale',
  responsabile_id: '',
  responsabile_nome: '',
  note: '',
  participants_ids: [],
  participants_manual: '',
};

const TIPO_OPTIONS = [
  { value: 'sociale', label: 'Sociale' },
  { value: 'corso', label: 'Corso' },
  { value: 'allenamento', label: 'Allenamento' },
  { value: 'formazione', label: 'Formazione' },
  { value: 'esplorazione', label: 'Esplorazione' },
  { value: 'altro', label: 'Altro' },
];

function dateForInput(value) {
  if (!value) return '';
  if (value.includes('T')) {
    return value.split('T')[0];
  }
  return value;
}

function timetzForInput(value) {
  if (!value) return '';
  const time = value.split('+')[0]; // Drop timezone info returned by Supabase.
  return time.slice(0, 5);
}

function timeToTimetz(value) {
  if (!value) return null;
  // Supabase richiede un valore di tipo timetz, aggiungiamo i secondi + timezone per compatibilità.
  return `${value}:00+00`;
}

export default function UscitaForm({
  initialValues = null,
  onSubmit,
  submitting = false,
  errorMessage = '',
  successMessage = '',
  onCancel,
  submitLabel = 'Salva uscita',
  membersList = null,
}) {
  const navigate = useNavigate();
  const [form, setForm] = useState(() => ({
    ...EMPTY_FORM,
    ...(initialValues ?? {}),
    data: initialValues?.data ? dateForInput(initialValues.data) : '',
    ora: initialValues?.ora ? timetzForInput(initialValues.ora) : '',
    participants_ids: initialValues?.participants_ids?.map(String) ?? [],
  }));
  const [members, setMembers] = useState(membersList ?? []);
  const [membersLoading, setMembersLoading] = useState(!membersList);
  const [membersError, setMembersError] = useState('');
  const [participantsSearch, setParticipantsSearch] = useState('');
  const timeInputRef = useRef(null);
  const prestitoParams = useMemo(() => {
    if (!initialValues?.id) return null;
    const params = new URLSearchParams();
    params.set('uscita', initialValues.id);
    if (initialValues.titolo) params.set('uscitaTitle', initialValues.titolo);
    if (initialValues.data) params.set('uscitaDate', initialValues.data);
    return params.toString();
  }, [initialValues?.id, initialValues?.titolo, initialValues?.data]);

  useEffect(() => {
    setForm({
      ...EMPTY_FORM,
      ...(initialValues ?? {}),
      data: initialValues?.data ? dateForInput(initialValues.data) : '',
      ora: initialValues?.ora ? timetzForInput(initialValues.ora) : '',
      responsabile_id: initialValues?.responsabile_id ?? '',
      responsabile_nome: initialValues?.responsabile_nome ?? initialValues?.responsabile ?? '',
      participants_ids: initialValues?.participants_ids?.map(String) ?? [],
      participants_manual: initialValues?.participants_manual ?? '',
    });
    setParticipantsSearch('');
  }, [initialValues]);

  useEffect(() => {
    if (membersList) {
      setMembers(membersList);
      setMembersLoading(false);
      return undefined;
    }

    let ignore = false;
    async function loadMembers() {
      setMembersLoading(true);
      setMembersError('');
      try {
        const data = await getMembers();
        if (!ignore) {
          setMembers(data);
        }
      } catch (error) {
        if (!ignore) {
          setMembersError(error.message ?? 'Impossibile recuperare la lista soci.');
        }
      } finally {
        if (!ignore) {
          setMembersLoading(false);
        }
      }
    }
    loadMembers();
    return () => {
      ignore = true;
    };
  }, [membersList]);

  const isSubmitDisabled = useMemo(() => {
    return submitting || membersLoading;
  }, [membersLoading, submitting]);

  const mapsLink = useMemo(() => {
    if (!form.luogo?.trim()) return null;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(form.luogo.trim())}`;
  }, [form.luogo]);

  const filteredParticipants = useMemo(() => {
    if (!participantsSearch.trim()) return members;
    const term = participantsSearch.toLowerCase();
    return members.filter(
      (member) =>
        member.full_name?.toLowerCase().includes(term) ||
        String(member.membership_number ?? '').includes(term),
    );
  }, [members, participantsSearch]);

  function handleChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!onSubmit) return;
    const payload = {
      titolo: form.titolo.trim(),
      luogo: form.luogo.trim(),
      data: form.data || null,
      ora: timeToTimetz(form.ora),
      tipo: form.tipo.trim() || null,
      responsabile_id: form.responsabile_id || null,
      responsabile_nome: form.responsabile_nome.trim() || null,
      participants_ids: form.participants_ids?.length ? form.participants_ids : null,
      participants_manual: form.participants_manual.trim() || null,
      note: form.note?.trim() ? form.note.trim() : null,
    };
    await onSubmit(payload);
  }

  return (
    <form className="page-grid" onSubmit={handleSubmit}>
      <div className="card">
        <label htmlFor="titolo">Titolo</label>
        <input
          id="titolo"
          value={form.titolo}
          onChange={(event) => handleChange('titolo', event.target.value)}
          required
          placeholder="Es. Escursione formativa"
        />
      </div>

      <div className="card">
        <label htmlFor="luogo">Luogo</label>
        <input
          id="luogo"
          value={form.luogo}
          onChange={(event) => handleChange('luogo', event.target.value)}
          required
          placeholder="Es. Grotta XYZ"
        />
        {mapsLink && (
          <small>
            <a href={mapsLink} target="_blank" rel="noopener noreferrer">
              Apri posizione su Google Maps
            </a>
          </small>
        )}
      </div>

      <div className="card">
        <label htmlFor="data">Data</label>
        <input id="data" type="date" value={form.data} onChange={(event) => handleChange('data', event.target.value)} required />
      </div>

      <div className="card">
        <label htmlFor="ora">Ora</label>
        <div className="input-with-icon">
          <button
            type="button"
            aria-label="Apri selettore orario"
            onClick={() => timeInputRef.current?.showPicker?.()}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}
          >
            🕒
          </button>
          <input
            id="ora"
            ref={timeInputRef}
            type="time"
            value={form.ora}
            onChange={(event) => handleChange('ora', event.target.value)}
            required
          />
        </div>
      </div>

      <div className="card">
        <label htmlFor="tipo">Tipo</label>
        <select id="tipo" value={form.tipo} onChange={(event) => handleChange('tipo', event.target.value)}>
          {TIPO_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="card">
        <label htmlFor="responsabile">Responsabile</label>
        <input
          placeholder="Nome responsabile"
          value={form.responsabile_nome}
          onChange={(event) => handleChange('responsabile_nome', event.target.value)}
        />
        {membersLoading ? (
          <p>Caricamento soci...</p>
        ) : (
          <>
            <select
              id="responsabile"
              value={form.responsabile_id}
              onChange={(event) => {
                const selectedId = event.target.value;
                const selectedMember = members.find((member) => String(member.id) === selectedId);
                setForm((prev) => ({
                  ...prev,
                  responsabile_id: selectedId,
                  responsabile_nome: selectedMember ? selectedMember.full_name : prev.responsabile_nome,
                }));
              }}
              disabled={!members.length}
            >
              <option value="">{members.length ? 'Seleziona responsabile' : 'Nessun socio disponibile'}</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.membership_number ? `${member.membership_number} · ${member.full_name}` : member.full_name}
                </option>
              ))}
            </select>
            {!members.length && !membersError && (
              <small style={{ color: 'var(--color-muted)' }}>
                Importa i soci per assegnare un responsabile (facoltativo).
              </small>
            )}
          </>
        )}
        {membersError && <p style={{ color: 'var(--color-accent)' }}>{membersError}</p>}
      </div>

      <div className="card">
        <label htmlFor="participants">Partecipanti (seleziona soci)</label>
        {membersLoading ? (
          <p>Caricamento soci...</p>
        ) : (
          <>
            <input
              type="search"
              placeholder="Filtra per nome o tessera"
              value={participantsSearch}
              onChange={(event) => setParticipantsSearch(event.target.value)}
            />
            <div
              id="participants"
              style={{
                maxHeight: '12rem',
                overflowY: 'auto',
                border: '1px solid rgba(0,0,0,0.1)',
                borderRadius: '0.75rem',
                padding: '0.5rem',
                marginTop: '0.5rem',
              }}
            >
              {!filteredParticipants.length && <p style={{ color: 'var(--color-muted)' }}>Nessun socio trovato.</p>}
              {filteredParticipants.map((member) => {
                const memberId = String(member.id);
                const checked = form.participants_ids.includes(memberId);
                return (
                  <label
                    key={memberId}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.15rem 0' }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => {
                        const { checked: isChecked } = event.target;
                        if (isChecked) {
                          handleChange('participants_ids', [...new Set([...form.participants_ids, memberId])]);
                        } else {
                          handleChange(
                            'participants_ids',
                            form.participants_ids.filter((value) => value !== memberId),
                          );
                        }
                      }}
                    />
                    <span>
                      {member.membership_number ? `${member.membership_number} · ${member.full_name}` : member.full_name}
                    </span>
                  </label>
                );
              })}
            </div>
            <small style={{ color: 'var(--color-muted)' }}>
              Spunta più nomi contemporaneamente o usa il campo qui sotto per partecipanti esterni.
            </small>
          </>
        )}
        <label htmlFor="participantsManual" style={{ marginTop: '0.5rem' }}>
          Partecipanti esterni (uno per riga o separati da virgola)
        </label>
        <textarea
          id="participantsManual"
          rows={2}
          placeholder="Es. Mario Rossi&#10;Squadra esterna"
          value={form.participants_manual}
          onChange={(event) => handleChange('participants_manual', event.target.value)}
        />
      </div>

      <div className="card">
        <label htmlFor="note">Note</label>
        <textarea
          id="note"
          rows={3}
          value={form.note}
          onChange={(event) => handleChange('note', event.target.value)}
          placeholder="Dettagli logistici, materiale necessario..."
        />
      </div>

      {prestitoParams ? (
        <div className="card">
          <p style={{ margin: '0 0 0.35rem' }}>Materiale necessario</p>
          <button
            type="button"
            onClick={() => navigate(`/prestito-avanzato?${prestitoParams}`)}
            style={{ background: 'var(--color-primary-dark)' }}
          >
            Apri modulo prestiti
          </button>
        </div>
      ) : (
        <div className="card">
          <small>Salva l&apos;uscita per collegare il materiale necessario.</small>
        </div>
      )}

      {errorMessage && <p style={{ color: 'var(--color-accent)' }}>{errorMessage}</p>}
      {successMessage && <p style={{ color: 'var(--color-primary)' }}>{successMessage}</p>}

      <div className="card" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        {onCancel && (
          <button type="button" style={{ background: '#adb5bd' }} onClick={onCancel}>
            Annulla
          </button>
        )}
        <button type="submit" disabled={isSubmitDisabled}>
          {submitting ? 'Salvataggio...' : submitLabel}
        </button>
      </div>
    </form>
  );
}
