import { useMemo, useState } from 'react';
import { filtraSoci, formatMemberLabel, nomeSocio, ordinaSociPerNome, tesseraSocio } from '../utils/members.js';

function etichettaPredefinita(member) {
  const nome = nomeSocio(member) || formatMemberLabel(member, { includeMembership: false });
  const tessera = tesseraSocio(member);
  return tessera ? `${nome} (tessera ${tessera})` : nome;
}

/**
 * Tendina dei soci con ricerca libera: si scrive una parte del nome, della
 * tessera o dell'email e l'elenco (sempre in ordine alfabetico) si restringe.
 * Il socio già scelto resta nell'elenco anche se non corrisponde alla ricerca.
 */
export default function SelectSocio({
  members = [],
  value = '',
  onChange,
  id,
  placeholder = 'Seleziona socio',
  disabled = false,
  required = false,
  etichetta = etichettaPredefinita,
  style,
  selectStyle,
}) {
  const [ricerca, setRicerca] = useState('');
  const ordinati = useMemo(() => ordinaSociPerNome(members.filter((member) => member?.id)), [members]);
  const visibili = useMemo(() => {
    const trovati = filtraSoci(ordinati, ricerca);
    const scelto = value ? ordinati.find((member) => String(member.id) === String(value)) : null;
    if (scelto && !trovati.includes(scelto)) return ordinaSociPerNome([scelto, ...trovati]);
    return trovati;
  }, [ordinati, ricerca, value]);
  const nessunRisultato = Boolean(ricerca.trim()) && !filtraSoci(ordinati, ricerca).length;

  return (
    <div style={{ display: 'grid', gap: '0.35rem', ...style }}>
      <input
        type="search"
        placeholder="Cerca per nome, cognome o tessera"
        aria-label="Cerca socio"
        value={ricerca}
        onChange={(event) => setRicerca(event.target.value)}
        disabled={disabled}
      />
      <select
        id={id}
        value={value ?? ''}
        onChange={(event) => onChange?.(event.target.value)}
        disabled={disabled || !ordinati.length}
        required={required}
        style={selectStyle}
      >
        <option value="">
          {!ordinati.length ? 'Nessun socio disponibile' : nessunRisultato ? 'Nessun socio trovato' : placeholder}
        </option>
        {visibili.map((member) => (
          <option key={member.id} value={String(member.id)}>
            {etichetta(member)}
          </option>
        ))}
      </select>
      {ricerca.trim() && !nessunRisultato && (
        <small style={{ color: 'var(--color-muted)' }}>
          {filtraSoci(ordinati, ricerca).length} soci trovati: aprili dalla tendina.
        </small>
      )}
    </div>
  );
}
