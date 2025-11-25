import { useEffect, useMemo, useState } from 'react';
import { createEquipment, deleteEquipment, getEquipment, updateEquipment } from '../services/equipment';

const emptyMaterial = {
  equipment_number: '',
  name: '',
  description: '',
  quantity: '',
};

export default function Magazzino() {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(emptyMaterial);
  const [editingId, setEditingId] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadMaterials();
  }, []);

  async function loadMaterials() {
    setLoading(true);
    setError('');
    try {
      const data = await getEquipment();
      setMaterials(data);
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
      equipment_number: form.equipment_number ? Number(form.equipment_number) : null,
      name: form.name.trim(),
      description: form.description.trim() || null,
      quantity: Number(form.quantity),
    };

    try {
      if (editingId) {
        await updateEquipment(editingId, payload);
      } else {
        await createEquipment(payload);
      }
      setForm(emptyMaterial);
      setEditingId(null);
      loadMaterials();
    } catch (submitError) {
      setError(submitError.message ?? 'Errore durante il salvataggio.');
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(material) {
    setEditingId(material.id);
    setForm({
      equipment_number: material.equipment_number ?? '',
      name: material.name ?? '',
      description: material.description ?? '',
      quantity: material.quantity ?? '',
    });
  }

  function cancelEdit() {
    setEditingId(null);
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

      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '0.75rem' }}>
        <h2>{editingId ? 'Modifica materiale' : 'Nuovo materiale'}</h2>
        <input
          type="number"
          min={0}
          placeholder="Codice materiale (opzionale)"
          value={form.equipment_number}
          onChange={(event) => handleChange('equipment_number', event.target.value)}
        />
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
          {editingId && (
            <button type="button" style={{ background: '#adb5bd' }} onClick={cancelEdit}>
              Annulla
            </button>
          )}
        </div>
        {error && <p style={{ color: 'var(--color-accent)' }}>{error}</p>}
      </form>

      {loading ? (
        <p>Caricamento magazzino...</p>
      ) : (
        <div className="page-grid" style={{ gap: '1rem' }}>
          {filtered.map((material) => (
            <article
              key={material.id}
              style={{
                border: '1px solid var(--color-border)',
                borderRadius: '1rem',
                padding: '1rem',
                background: '#fff',
                boxShadow: '0 10px 24px rgba(15, 67, 69, 0.08)',
              }}
            >
              <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h3 style={{ margin: 0 }}>{material.name}</h3>
                  {material.equipment_number && (
                    <span className="chip">Codice #{material.equipment_number}</span>
                  )}
                </div>
                <strong>{material.quantity ?? 0} pezzi</strong>
              </header>
              <p style={{ color: 'var(--color-muted)' }}>{material.description || 'Nessuna descrizione'}</p>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="button" onClick={() => startEdit(material)}>
                  Modifica
                </button>
                <button type="button" style={{ background: '#e03131' }} onClick={() => handleDelete(material.id)}>
                  Elimina
                </button>
              </div>
            </article>
          ))}
          {!filtered.length && <p>Nessun materiale trovato.</p>}
        </div>
      )}
    </section>
  );
}
