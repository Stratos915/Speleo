import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuth from '../context/useAuth.js';
import usePermissions from '../hooks/usePermissions.js';
import useAlerts from '../hooks/useAlerts.js';
import AlertList from '../components/AlertList.jsx';
import {
  createEquipment,
  deleteEquipment,
  getEquipment,
  getEquipmentColumnNames,
  updateEquipment,
} from '../services/equipment';
import { safeLogActivity } from '../services/activityLogs.js';

const emptyMaterial = {
  equipment_number: '',
  name: '',
  description: '',
  quantity: '',
  notes: '',
  inspection_url: '',
};
const INSPECTIONS_FOLDER_URL = import.meta.env.VITE_INSPECTIONS_FOLDER_URL ?? '';

export default function Magazzino() {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(emptyMaterial);
  const [editingId, setEditingId] = useState(null);
  const [editingBorrowed, setEditingBorrowed] = useState(0);
  const [selectedMaterialId, setSelectedMaterialId] = useState('');
  const [restockMode, setRestockMode] = useState('replace');
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [supportsEquipmentNumber, setSupportsEquipmentNumber] = useState(true);
  const [quantityField, setQuantityField] = useState('quantity');
  const [availableField, setAvailableField] = useState('quantity_available');
  const [notesField, setNotesField] = useState(null);
  const [inspectionField, setInspectionField] = useState(null);
  const formRef = useRef(null);
  const { user } = useAuth();
  const { canEditSection, canUseAction } = usePermissions();
  const canEditInventory = canEditSection('inventory');
  const canLoanInventory = canUseAction('magazzino', 'loan');
  const { adminAlerts, dismissAlert } = useAlerts();
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
      const {
        quantity: detectedQuantity,
        available: detectedAvailable,
        notes: detectedNotes,
        inspection: detectedInspection,
      } = getEquipmentColumnNames();
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
      setInspectionField(detectedInspection);
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

  const selectedMaterial = useMemo(() => {
    if (!selectedMaterialId) return null;
    return materials.find((item) => String(item.id) === selectedMaterialId) ?? null;
  }, [materials, selectedMaterialId]);

  useEffect(() => {
    if (!selectedMaterial || editingId) return;
    const total = Number(
      selectedMaterial[quantityField] ?? selectedMaterial.quantity ?? selectedMaterial.total_quantity ?? 0,
    );
    const available = Number(
      selectedMaterial[availableField] ??
        selectedMaterial.quantity_available ??
        selectedMaterial.available_quantity ??
        total,
    );
    setForm((prev) => ({
      ...prev,
      equipment_number: supportsEquipmentNumber ? selectedMaterial.equipment_number ?? '' : '',
      name: selectedMaterial.name ?? prev.name,
      description: selectedMaterial.description ?? prev.description,
      quantity: '',
      notes: notesField ? selectedMaterial[notesField] ?? '' : prev.notes,
      inspection_url: selectedMaterial.inspection_url ?? '',
    }));
    setEditingBorrowed(Math.max(total - available, 0));
    setRestockMode('replace');
  }, [selectedMaterial, editingId, quantityField, availableField, notesField, supportsEquipmentNumber]);

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
    const inspectionUrl = form.inspection_url.trim() || null;
    const isRestock = Boolean(selectedMaterial && !editingId);
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
    } else if (isRestock && selectedMaterial) {
      const currentTotal = Number(
        selectedMaterial[quantityField] ?? selectedMaterial.quantity ?? selectedMaterial.total_quantity ?? 0,
      );
      const currentAvailable = Number(
        selectedMaterial[availableField] ??
          selectedMaterial.quantity_available ??
          selectedMaterial.available_quantity ??
          currentTotal,
      );
      const shouldIncreaseTotal = restockMode === 'stock';
      const updatedTotal = shouldIncreaseTotal ? currentTotal + totalQuantity : currentTotal;
      const updatedAvailable = currentAvailable + totalQuantity;
      payload[quantityField] = updatedTotal;
      if (availableField) {
        payload[availableField] = updatedAvailable;
      }
      if (notesField && notesValue) {
        const existingNotes = selectedMaterial[notesField] ?? '';
        payload.notes = existingNotes ? `${existingNotes}\n${notesValue}` : notesValue;
      }
    } else {
      if (availableField) {
        payload[availableField] = totalQuantity;
      }
    }
    if (notesField && !isRestock) {
      payload.notes = notesValue;
    }
    if (inspectionField) {
      payload.inspection_url = inspectionUrl;
    }

    try {
      let savedEquipment;
      if (editingId) {
        savedEquipment = await updateEquipment(editingId, payload);
        safeLogActivity(
          {
            action: 'update_equipment',
            entity: 'equipment',
            entityId: savedEquipment.id,
            details: { name: savedEquipment.name },
          },
          user,
        );
      } else if (isRestock && selectedMaterial) {
        savedEquipment = await updateEquipment(selectedMaterial.id, payload);
        safeLogActivity(
          {
            action: 'restock_equipment',
            entity: 'equipment',
            entityId: savedEquipment.id,
            details: { name: savedEquipment.name, added: totalQuantity },
          },
          user,
        );
      } else {
        savedEquipment = await createEquipment(payload);
        safeLogActivity(
          {
            action: 'create_equipment',
            entity: 'equipment',
            entityId: savedEquipment.id,
            details: { name: savedEquipment.name },
          },
          user,
        );
      }
      setForm(emptyMaterial);
      setEditingId(null);
      setEditingBorrowed(0);
      setSelectedMaterialId('');
      setRestockMode('replace');
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
    setSelectedMaterialId('');
    setRestockMode('replace');
    setForm({
      equipment_number: supportsEquipmentNumber ? material.equipment_number ?? '' : '',
      name: material.name ?? '',
      description: material.description ?? '',
      quantity: total || available || '',
      notes: notesField ? material[notesField] ?? '' : '',
      inspection_url: material.inspection_url ?? '',
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingBorrowed(0);
    setSelectedMaterialId('');
    setRestockMode('replace');
    setForm(emptyMaterial);
  }

  async function handleInspectionLinkEdit(material) {
    if (!canEditInventory) return;
    const currentValue = material.inspection_url ?? '';
    const nextValue = window.prompt('Inserisci il link Drive della scheda ispezione', currentValue);
    if (nextValue === null) return;
    const normalized = nextValue.trim();
    if (normalized && !/^https?:\/\//i.test(normalized)) {
      setError('Inserisci un URL valido (http:// o https://).');
      return;
    }
    setError('');
    try {
      await updateEquipment(material.id, { inspection_url: normalized || null });
      await loadMaterials();
    } catch (updateError) {
      setError(
        updateError.message ??
          'Impossibile aggiornare il link ispezione. Verifica la colonna inspection_url nella tabella equipment.',
      );
    }
  }

  function openInspectionsFolder() {
    if (!INSPECTIONS_FOLDER_URL) {
      setError('Configura VITE_INSPECTIONS_FOLDER_URL per aprire la cartella generale Ispezioni.');
      return;
    }
    window.open(INSPECTIONS_FOLDER_URL, '_blank', 'noopener,noreferrer');
  }

  async function handleDelete(id) {
    if (!window.confirm('Vuoi davvero eliminare questo materiale?')) return;
    setError('');
    try {
      await deleteEquipment(id);
      safeLogActivity(
        {
          action: 'delete_equipment',
          entity: 'equipment',
          entityId: id,
        },
        user,
      );
      loadMaterials();
    } catch (deleteError) {
      setError(deleteError.message ?? 'Impossibile eliminare il materiale.');
    }
  }

  return (
    <section className="page-grid">
      <AlertList
        alerts={[...adminAlerts]}
        navigate={navigate}
        onDismiss={dismissAlert}
      />
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

      {!canEditInventory && (
        <p className="card" style={{ background: '#fff5f5', borderColor: '#ffc9c9', color: '#c92a2a' }}>
          Non hai i permessi per modificare il magazzino. Puoi consultare i materiali ma non aggiornarli.
        </p>
      )}

      {showForm && canEditInventory && (
        <div className="card" ref={formRef}>
          <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '0.75rem' }}>
            <h2>{editingId ? 'Modifica materiale' : 'Nuovo materiale'}</h2>
            {!editingId && (
              <>
                <label htmlFor="materialSelect">Aggiungi quantità a materiale esistente (opzionale)</label>
                <div style={{ display: 'grid', gap: '0.35rem' }}>
                  <select
                    id="materialSelect"
                    value={selectedMaterialId}
                    onChange={(event) => setSelectedMaterialId(event.target.value)}
                  >
                    <option value="">-- Nuovo materiale (scrivi sotto) --</option>
                    {materials.map((material, index) => {
                      const optionKey = material?.id ?? `material-${index}`;
                      const displayId = material?.equipment_number ?? index + 1;
                      return (
                        <option key={optionKey} value={String(material.id)}>
                          {material.name ?? 'Materiale senza nome'} (ID #{displayId})
                        </option>
                      );
                    })}
                  </select>
                  {selectedMaterialId && (
                    <button
                      type="button"
                      style={{ background: '#adb5bd', width: 'fit-content' }}
                      onClick={() => setSelectedMaterialId('')}
                    >
                      Usa nuovo materiale
                    </button>
                  )}
                </div>
                {selectedMaterialId && (
                  <div
                    style={{
                      marginTop: '0.5rem',
                      padding: '0.6rem 0.75rem',
                      border: '1px solid rgba(0,0,0,0.08)',
                      borderRadius: '0.75rem',
                      background: '#f8f9fa',
                      display: 'grid',
                      gap: '0.4rem',
                    }}
                  >
                    <small style={{ color: 'var(--color-muted)' }}>
                      Verranno aggiornate solo le quantità. Nome e descrizione restano invariati.
                    </small>
                    <label style={{ display: 'grid', gridTemplateColumns: '18px 1fr', alignItems: 'start', gap: '0.5rem' }}>
                      <input
                        type="radio"
                        name="restockMode"
                        value="replace"
                        checked={restockMode === 'replace'}
                        onChange={() => setRestockMode('replace')}
                      />
                      <span>
                        <strong>Sostituzione</strong> (materiale perso): aumenta solo disponibile (totale invariato)
                      </span>
                    </label>
                    <label style={{ display: 'grid', gridTemplateColumns: '18px 1fr', alignItems: 'start', gap: '0.5rem' }}>
                      <input
                        type="radio"
                        name="restockMode"
                        value="stock"
                        checked={restockMode === 'stock'}
                        onChange={() => setRestockMode('stock')}
                      />
                      <span>
                        <strong>Aggiunta scorte</strong>: aumenta totale e disponibile
                      </span>
                    </label>
                  </div>
                )}
              </>
            )}
            {supportsEquipmentNumber && (
              <input
                type="number"
                min={0}
                placeholder="Codice materiale (opzionale)"
                value={form.equipment_number}
                onChange={(event) => handleChange('equipment_number', event.target.value)}
                disabled={Boolean(selectedMaterialId) && !editingId}
              />
            )}
              <input
                placeholder="Nome"
                value={form.name}
                onChange={(event) => handleChange('name', event.target.value)}
                required
                disabled={Boolean(selectedMaterialId) && !editingId}
              />
            <textarea
              placeholder="Descrizione"
              value={form.description}
              onChange={(event) => handleChange('description', event.target.value)}
              disabled={Boolean(selectedMaterialId) && !editingId}
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
            <label htmlFor="inspection_url">Link scheda ispezione (Drive)</label>
            <input
              id="inspection_url"
              type="url"
              placeholder={
                inspectionField ? 'https://drive.google.com/...' : 'https://drive.google.com/...'
              }
              value={form.inspection_url}
              onChange={(event) => handleChange('inspection_url', event.target.value)}
            />
            {!inspectionField && (
              <small style={{ color: 'var(--color-muted)' }}>
                Se il salvataggio fallisce, aggiungi la colonna <code>inspection_url</code> alla tabella equipment.
              </small>
            )}
            <input
              type="number"
              min={0}
              placeholder={selectedMaterialId && !editingId ? 'Quantità da aggiungere' : 'Quantità'}
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
                <details style={{ marginTop: '0.5rem' }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Ispezioni</summary>
                  <div style={{ marginTop: '0.5rem', display: 'grid', gap: '0.5rem' }}>
                    {material.inspection_url ? (
                      <a href={material.inspection_url} target="_blank" rel="noreferrer">
                        Apri scheda ispezione su Drive
                      </a>
                    ) : (
                      <p style={{ margin: 0, color: 'var(--color-muted)' }}>
                        Nessuna scheda ispezione collegata.
                      </p>
                    )}
                    {canEditInventory && (
                      <button
                        type="button"
                        style={{ width: 'fit-content', background: '#adb5bd' }}
                        onClick={() => handleInspectionLinkEdit(material)}
                      >
                        {material.inspection_url ? 'Modifica link ispezione' : 'Collega link ispezione'}
                      </button>
                    )}
                  </div>
                </details>
                {(canEditInventory || canLoanInventory) && (
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      type="button"
                      onClick={() => {
                        if (!canEditInventory) return;
                        startEdit(material);
                        setShowForm(true);
                      }}
                      disabled={!canEditInventory}
                      style={{ opacity: canEditInventory ? 1 : 0.5, cursor: canEditInventory ? 'pointer' : 'not-allowed' }}
                    >
                      Modifica
                    </button>
                    <button
                      type="button"
                      style={{ background: '#e03131', opacity: canEditInventory ? 1 : 0.5, cursor: canEditInventory ? 'pointer' : 'not-allowed' }}
                      onClick={() => canEditInventory && handleDelete(material.id)}
                      disabled={!canEditInventory}
                    >
                      Elimina
                    </button>
                    {canLoanInventory && (
                      <button
                        type="button"
                        style={{ background: 'var(--color-primary-dark)' }}
                        onClick={() => navigate(`/prestito-avanzato?equipmentId=${material.id}`)}
                      >
                        Presta
                      </button>
                    )}
                  </div>
                )}
              </article>
            );
          })}
          {!filtered.length && <p>Nessun materiale trovato.</p>}
        </div>
      )}
      <div
        style={{
          position: 'fixed',
          right: '1rem',
          bottom: '1rem',
          zIndex: 12,
          display: 'grid',
          gap: '0.6rem',
          justifyItems: 'end',
        }}
      >
        <button
          type="button"
          style={{ background: '#868e96' }}
          onClick={openInspectionsFolder}
        >
          Ispezioni
        </button>
        {canEditInventory && (
          <button
            type="button"
            style={{
              background: 'var(--color-accent)',
              boxShadow: '0 12px 24px rgba(242, 115, 103, 0.35)',
            }}
            onClick={() => {
              setShowForm((prev) => !prev);
              setEditingId(null);
              setEditingBorrowed(0);
              setSelectedMaterialId('');
              setForm(emptyMaterial);
            }}
          >
            {showForm ? 'Chiudi modulo' : 'Nuovo materiale'}
          </button>
        )}
      </div>
    </section>
  );
}
