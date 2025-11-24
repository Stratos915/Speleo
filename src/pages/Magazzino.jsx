import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext.jsx';

const initialNewMaterial = {
  name: '',
  description: '',
  quantity_total: '',
  category: '',
};

export default function Magazzino() {
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [createForm, setCreateForm] = useState(initialNewMaterial);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({
    description: '',
    quantity_total: '',
    quantity_available: '',
    category: '',
  });
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    loadMaterials();
  }, []);

  async function loadMaterials() {
    setLoading(true);
    setError('');
    const { data, error: fetchError } = await supabase
      .from('equipment')
      .select('*')
      .order('name', { ascending: true });
    if (fetchError) {
      setError('Impossibile caricare il magazzino. Riprova più tardi.');
    } else {
      setMaterials(data ?? []);
    }
    setLoading(false);
  }

  const categories = useMemo(() => {
    const set = new Set();
    materials.forEach((item) => {
      if (item.category) set.add(item.category);
    });
    return Array.from(set);
  }, [materials]);

  const filteredMaterials = useMemo(() => {
    const term = search.trim().toLowerCase();
    return materials.filter((item) => {
      const matchesSearch =
        !term ||
        item.name.toLowerCase().includes(term) ||
        item.description?.toLowerCase().includes(term) ||
        item.category?.toLowerCase().includes(term);
      const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [materials, search, categoryFilter]);

  async function handleCreateMaterial(event) {
    event.preventDefault();
    setCreating(true);
    setError('');
    const total = Number(createForm.quantity_total);
    if (!createForm.name || Number.isNaN(total) || total <= 0) {
      setError('Compila correttamente nome e quantità totale (> 0).');
      setCreating(false);
      return;
    }

    const payload = {
      name: createForm.name.trim(),
      description: createForm.description.trim() || null,
      quantity_total: total,
      quantity_available: total,
      category: createForm.category.trim() || null,
    };

    const { error: insertError } = await supabase.from('equipment').insert(payload);
    if (insertError) {
      setError(insertError.message);
    } else {
      setCreateForm(initialNewMaterial);
      loadMaterials();
    }
    setCreating(false);
  }

  function startEdit(material) {
    setEditingId(material.equipment_id);
    setEditForm({
      description: material.description ?? '',
      quantity_total: material.quantity_total ?? '',
      quantity_available: material.quantity_available ?? '',
      category: material.category ?? '',
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm({
      description: '',
      quantity_total: '',
      quantity_available: '',
      category: '',
    });
  }

  async function handleUpdateMaterial(event) {
    event.preventDefault();
    if (!editingId) return;
    setUpdating(true);
    setError('');

    const total = Number(editForm.quantity_total);
    const available = Number(editForm.quantity_available);
    if (Number.isNaN(total) || Number.isNaN(available) || total < 0 || available < 0 || available > total) {
      setError('Quantità non valida: disponibile deve essere compresa tra 0 e totale.');
      setUpdating(false);
      return;
    }

    const payload = {
      description: editForm.description.trim() || null,
      quantity_total: total,
      quantity_available: available,
      category: editForm.category.trim() || null,
    };

    const { error: updateError } = await supabase.from('equipment').update(payload).eq('equipment_id', editingId);
    if (updateError) {
      setError(updateError.message);
    } else {
      cancelEdit();
      loadMaterials();
    }
    setUpdating(false);
  }

  return (
    <section className="page-grid">
      <div>
        <h1>Magazzino materiali</h1>
        <p>
          Consulta lo stato aggiornato dell&apos;inventario e verifica disponibilità e categorie di appartenenza. Gli
          amministratori possono inserire e modificare i materiali direttamente da qui.
        </p>
      </div>

      <div className="page-grid" style={{ gap: '1rem' }}>
        <input
          type="search"
          placeholder="Cerca per nome, descrizione o categoria"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
          <option value="all">Tutte le categorie</option>
          {categories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </div>

      {isAdmin && (
        <form onSubmit={handleCreateMaterial} style={{ display: 'grid', gap: '0.75rem' }}>
          <h2>Nuovo materiale</h2>
          <input
            placeholder="Nome materiale"
            value={createForm.name}
            onChange={(event) => setCreateForm({ ...createForm, name: event.target.value })}
            required
          />
          <textarea
            placeholder="Descrizione"
            value={createForm.description}
            onChange={(event) => setCreateForm({ ...createForm, description: event.target.value })}
          />
          <input
            type="number"
            min={0}
            placeholder="Quantità totale"
            value={createForm.quantity_total}
            onChange={(event) => setCreateForm({ ...createForm, quantity_total: event.target.value })}
            required
          />
          <input
            placeholder="Categoria (facoltativa)"
            value={createForm.category}
            onChange={(event) => setCreateForm({ ...createForm, category: event.target.value })}
          />
          <button type="submit" disabled={creating}>
            {creating ? 'Salvataggio...' : 'Aggiungi materiale'}
          </button>
        </form>
      )}

      {error && <p style={{ color: 'var(--color-accent)' }}>{error}</p>}

      {loading ? (
        <p>Caricamento magazzino...</p>
      ) : (
        <div className="page-grid" style={{ gap: '1.25rem' }}>
          {filteredMaterials.map((material) => (
            <article
              key={material.equipment_id}
              style={{
                border: '1px solid var(--color-border)',
                borderRadius: '1rem',
                padding: '1rem',
                background: '#fff',
                boxShadow: '0 12px 22px rgba(14, 151, 154, 0.08)',
              }}
            >
              <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h3 style={{ marginBottom: '0.25rem' }}>{material.name}</h3>
                  {material.category && <span className="chip">{material.category}</span>}
                </div>
                <div style={{ textAlign: 'right', fontWeight: 600 }}>
                  Disponibile{' '}
                  <span style={{ color: material.quantity_available > 0 ? 'var(--color-primary)' : '#d9480f' }}>
                    {material.quantity_available}
                  </span>{' '}
                  / {material.quantity_total}
                </div>
              </header>
              <p style={{ color: 'var(--color-muted)' }}>{material.description || 'Nessuna descrizione'}</p>
              {isAdmin && (
                <>
                  {editingId === material.equipment_id ? (
                    <form onSubmit={handleUpdateMaterial} style={{ marginTop: '0.75rem', display: 'grid', gap: '0.5rem' }}>
                      <textarea
                        placeholder="Descrizione"
                        value={editForm.description}
                        onChange={(event) => setEditForm({ ...editForm, description: event.target.value })}
                      />
                      <div style={{ display: 'grid', gap: '0.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
                        <input
                          type="number"
                          min={0}
                          placeholder="Totale"
                          value={editForm.quantity_total}
                          onChange={(event) => setEditForm({ ...editForm, quantity_total: event.target.value })}
                          required
                        />
                        <input
                          type="number"
                          min={0}
                          placeholder="Disponibile"
                          value={editForm.quantity_available}
                          onChange={(event) => setEditForm({ ...editForm, quantity_available: event.target.value })}
                          required
                        />
                      </div>
                      <input
                        placeholder="Categoria"
                        value={editForm.category}
                        onChange={(event) => setEditForm({ ...editForm, category: event.target.value })}
                      />
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button type="submit" disabled={updating}>
                          {updating ? 'Aggiornamento...' : 'Salva modifiche'}
                        </button>
                        <button type="button" style={{ background: '#e03131' }} onClick={cancelEdit}>
                          Annulla
                        </button>
                      </div>
                    </form>
                  ) : (
                    <button type="button" onClick={() => startEdit(material)}>
                      Modifica materiale
                    </button>
                  )}
                </>
              )}
            </article>
          ))}
          {!filteredMaterials.length && <p>Nessun materiale trovato con i filtri applicati.</p>}
        </div>
      )}
    </section>
  );
}
