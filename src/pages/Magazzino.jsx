import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuth from '../context/useAuth.js';
import {
  createEquipment,
  deleteEquipment,
  getEquipment,
  getEquipmentColumnNames,
  updateEquipment,
} from '../services/equipment';

const emptyMaterial = {
  equipment_number: '',
  name: '',
  description: '',
  quantity: '',
  notes: '',
};

export default function Magazzino() {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(emptyMaterial);
  const [editingId, setEditingId] = useState(null);
  const [editingBorrowed, setEditingBorrowed] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [supportsEquipmentNumber, setSupportsEquipmentNumber] = useState(true);
  const [quantityField, setQuantityField] = useState('quantity');
  const [availableField, setAvailableField] = useState('quantity_available');
  const [notesField, setNotesField] = useState(null);
  const formRef = useRef(null);
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const navigate = useNavigate();

  useEffect(() => {
    loadMaterials();
  }, []);

  useEffect(() => {
    if (showForm && formRef.current) {
      formRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [showForm]);

  async function loadMaterials() {
    setLoading(true);
    setError('');
    try {
      const data = await getEquipment();
      setMaterials(data);
      setSupportsEquipmentNumber(
        data.some((item) => Object.prototype.hasOwnProperty.call(item, 'equipment_number')),
      );
      const { quantity: detectedQuantity, available: detectedAvailable, notes: detectedNotes } = getEquipmentColumnNames();
      if (detectedQuantity) {
        setQuantityField(detectedQuantity);
      } else if (data.length) {
        const first = data[0];
        const quantityCandidate = ['quantity', 'qty', 'quantita', 'total_quantity'].find(
          (key) => Object.prototype.hasOwnProperty.call(first, key),
        );
        if (quantityCandidate) {
          setQuantityField(quantityCandidate);
        }
      }
      if (detectedAvailable) {
        setAvailableField(detectedAvailable);
      } else if (data.length) {
        const first = data[0];
        const availableCandidate = ['quantity_available', 'available_quantity', 'disponibile'].find(
          (key) => Object.prototype.hasOwnProperty.call(first, key),
        );
        if (availableCandidate) {
          setAvailableField(availableCandidate);
        }
      }
      setNotesField(detectedNotes);
    } catch (loadError) {
      setError(loadError.message ?? 'Impossibile caricare il magazzino.');
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return materials;
    const term = search.toLowerCase();
    return materials.filter(
      (item) =>
        item.name?.toLowerCase().includes(term) ||
        item.description?.toLowerCase().includes(term) ||
        String(item.equipment_number ?? '').includes(term),
    );
  }, [materials, search]);

  function handleChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
    };
    const totalQuantity = Number(form.quantity);
    const notesValue = form.notes.trim() || null;
    if (supportsEquipmentNumber) {
      payload.equipment_number = form.equipment_number ? Number(form.equipment_number) : null;
    }
    if (quantityField) {
      payload[quantityField] = totalQuantity;
    }
    if (Number.isNaN(totalQuantity) || totalQuantity < 0) {
      setError('Inserisci una quantità totale valida.');
      setSubmitting(false);
      return;
    }
    if (editingId) {
      const newAvailable = Math.max(totalQuantity - editingBorrowed, 0);
      if (availableField) {
        payload[availableField] = newAvailable;
      }
    } else {
      if (availableField) {
        payload[availableField] = totalQuantity;
      }
    }
    if (notesField) {
      payload.notes = notesValue;
    }

    try {
      if (editingId) {
        await updateEquipment(editingId, payload);
      } else {
        await createEquipment(payload);
      }
      setForm(emptyMaterial);
      setEditingId(null);
      setEditingBorrowed(0);
      loadMaterials();
    } catch (submitError) {
      setError(submitError.message ?? 'Errore durante il salvataggio.');
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(material) {
    const total = Number(
      material[quantityField] ?? material.quantity ?? material.total_quantity ?? 0,
    );
    const available = Number(
      material[availableField] ?? material.quantity_available ?? material.available_quantity ?? total,
    );
    setEditingId(material.id);
    setEditingBorrowed(Math.max(total - available, 0));
    setForm({
      equipment_number: supportsEquipmentNumber ? material.equipment_number ?? '' : '',
      name: material.name ?? '',
      description: material.description ?? '',
      quantity: total || available || '',
      notes: notesField ? material[notesField] ?? '' : '',
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingBorrowed(0);
    setForm(emptyMaterial);
  }

  async function handleDelete(id) {
    if (!window.confirm('Vuoi davvero eliminare questo materiale?')) return;
    setError('');
    try {
      await deleteEquipment(id);
      loadMaterials();
    } catch (deleteError) {
      setError(deleteError.message ?? 'Impossibile eliminare il materiale.');
    }
  }

  return (
    <section className="page-grid">
      <div>
        <h1>Magazzino materiali</h1>
        <p>Gestisci l&apos;inventario dell&apos;attrezzatura speleo già importata su Supabase.</p>
      </div>

      <input
        type="search"
        placeholder="Cerca per nome, descrizione o codice"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />

      {showForm && (
        <div className="card" ref={formRef}>
          <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '0.75rem' }}>
            <h2>{editingId ? 'Modifica materiale' : 'Nuovo materiale'}</h2>
            {supportsEquipmentNumber && (
              <input
                type="number"
                min={0}
                placeholder="Codice materiale (opzionale)"
                value={form.equipment_number}
                onChange={(event) => handleChange('equipment_number', event.target.value)}
              />
            )}
            <input
              placeholder="Nome"
              value={form.name}
              onChange={(event) => handleChange('name', event.target.value)}
              required
            />
            <textarea
              placeholder="Descrizione"
              value={form.description}
              onChange={(event) => handleChange('description', event.target.value)}
            />
            <label htmlFor="notes">Note (acquisti, sostituzioni, altro)</label>
            <textarea
              id="notes"
              placeholder={
                notesField
                  ? 'Es. Acquistato da Petzl a giugno 2024'
                  : 'Aggiungi una colonna "notes" nella tabella equipment per salvare queste informazioni'
              }
              value={form.notes}
              disabled={!notesField}
              onChange={(event) => handleChange('notes', event.target.value)}
            />
            {!notesField && (
              <small style={{ color: 'var(--color-muted)' }}>
                Questo campo verrà abilitato quando la tabella equipment includerà una colonna <code>notes</code>.
              </small>
            )}
            <input
              type="number"
              min={0}
              placeholder="Quantità"
              value={form.quantity}
              onChange={(event) => handleChange('quantity', event.target.value)}
              required
            />
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="submit" disabled={submitting}>
                {submitting ? 'Salvataggio...' : editingId ? 'Aggiorna' : 'Aggiungi'}
              </button>
              <button type="button" style={{ background: '#adb5bd' }} onClick={cancelEdit}>
                Annulla
              </button>
            </div>
            {error && <p style={{ color: 'var(--color-accent)' }}>{error}</p>}
          </form>
        </div>
      )}

      {loading ? (
        <p>Caricamento magazzino...</p>
      ) : (
        <div className="card-list">
          {filtered.map((material, index) => {
            const key =
              material.id ?? `${material.equipment_number ?? 'no-code'}-${material.name ?? 'item'}`;
            const total = Number(
              material[quantityField] ?? material.quantity ?? material.total_quantity ?? 0,
            );
            const available = Number(
              material[availableField] ??
                material.quantity_available ??
                material.available_quantity ??
                total,
            );
            const displayId = material.equipment_number ?? index + 1;
            return (
              <article className="card" key={key}>
                <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h3 style={{ margin: 0 }}>{material.name}</h3>
                    <span className="chip">ID #{displayId}</span>
                  </div>
                  <strong>
                    {available}/{total} pezzi
                  </strong>
                </header>
                <p style={{ color: 'var(--color-muted)' }}>{material.description || 'Nessuna descrizione'}</p>
                {notesField && material[notesField] && (
                  <p style={{ color: 'var(--color-muted)', fontStyle: 'italic' }}>Note: {material[notesField]}</p>
                )}
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => {
                      startEdit(material);
                      setShowForm(true);
                    }}
                  >
                    Modifica
                  </button>
                  <button type="button" style={{ background: '#e03131' }} onClick={() => handleDelete(material.id)}>
                    Elimina
                  </button>
                  {isAdmin && (
                    <button
                      type="button"
                      style={{ background: 'var(--color-primary-dark)' }}
                      onClick={() => navigate(`/prestito-avanzato?equipmentId=${material.id}`)}
                    >
                      Presta
                    </button>
                  )}
                </div>
              </article>
            );
          })}
          {!filtered.length && <p>Nessun materiale trovato.</p>}
        </div>
      )}
      <button
        type="button"
        className="floating-button"
      onClick={() => {
        setShowForm((prev) => !prev);
        setEditingId(null);
        setEditingBorrowed(0);
        setForm(emptyMaterial);
      }}
    >
        {showForm ? 'Chiudi modulo' : 'Nuovo materiale'}
      </button>
    </section>
  );
}
