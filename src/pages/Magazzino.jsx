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
  restockEquipment,
} from '../services/equipment';
import { safeLogActivity } from '../services/activityLogs.js';
import { getSetting, setSetting } from '../services/settings.js';
import { friendlyDbError } from '../services/loans.js';
import { getDpiAlerts } from '../utils/dpi.js';

const emptyMaterial = {
  equipment_number: '',
  name: '',
  description: '',
  quantity: '',
  notes: '',
  inspection_url: '',
  prossima_ispezione: '',
  fine_vita: '',
};
const INSPECTIONS_FOLDER_STORAGE_KEY = 'speleo-inspections-folder-url';
const INSPECTIONS_BY_ITEM_STORAGE_KEY = 'speleo-inspections-by-item';
const INSPECTIONS_FOLDER_URL = import.meta.env.VITE_INSPECTIONS_FOLDER_URL ?? '';
const INSPECTIONS_FOLDER_SETTING = 'ispezioni_cartella_url';

function dateInputValue(value) {
  return value ? String(value).slice(0, 10) : '';
}

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
  const [inspectionsFolderUrl, setInspectionsFolderUrl] = useState('');
  const [dpiFilter, setDpiFilter] = useState(false);
  const formRef = useRef(null);
  const { role, user } = useAuth();
  const { canEditSection, canUseAction } = usePermissions();
  const canEditInventory = canEditSection('inventory');
  const canLoanInventory = canUseAction('magazzino', 'loan');
  const canManageInspections = ['admin', 'presidente', 'magazziniere'].includes(role);
  const { adminAlerts, dismissAlert } = useAlerts();
  const navigate = useNavigate();

  useEffect(() => {
    loadMaterials();
  }, []);

  useEffect(() => {
    let ignore = false;
    async function loadFolderSetting() {
      try {
        let value = await getSetting(INSPECTIONS_FOLDER_SETTING);
        const legacy = typeof window !== 'undefined' ? window.localStorage.getItem(INSPECTIONS_FOLDER_STORAGE_KEY) : null;
        if (!value && legacy && canManageInspections) {
          await setSetting(INSPECTIONS_FOLDER_SETTING, legacy, user);
          value = legacy;
        }
        if (legacy && value) window.localStorage.removeItem(INSPECTIONS_FOLDER_STORAGE_KEY);
        if (!ignore) setInspectionsFolderUrl(value ?? '');
      } catch (settingError) {
        console.warn('[Magazzino] impostazione cartella ispezioni non disponibile:', settingError.message);
      }
    }
    loadFolderSetting();
    return () => {
      ignore = true;
    };
  }, [canManageInspections, user]);

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
      if (detectedInspection && canManageInspections) {
        await migrateLegacyInspectionLinks(data);
      }
    } catch (loadError) {
      setError(loadError.message ?? 'Impossibile caricare il magazzino.');
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    const source = dpiFilter ? materials.filter((item) => getDpiAlerts(item).length > 0) : materials;
    if (!search.trim()) return source;
    const term = search.toLowerCase();
    return source.filter(
      (item) =>
        item.name?.toLowerCase().includes(term) ||
        item.description?.toLowerCase().includes(term) ||
        String(item.equipment_number ?? '').includes(term),
    );
  }, [materials, search, dpiFilter]);

  const dpiAlertCount = useMemo(
    () => materials.filter((item) => getDpiAlerts(item).length > 0).length,
    [materials],
  );

  // Una tantum: i link salvati in passato solo nel browser vengono copiati nel database.
  async function migrateLegacyInspectionLinks(items) {
    if (typeof window === 'undefined') return;
    const map = getStoredInspectionMap();
    const entries = Object.entries(map).filter(([, url]) => String(url ?? '').trim());
    if (!entries.length) return;
    let moved = 0;
    for (const [id, url] of entries) {
      const item = items.find((material) => String(material.id) === id);
      if (!item || String(item.inspection_url ?? '').trim()) continue;
      try {
        await updateEquipment(item.id, { inspection_url: url });
        moved += 1;
      } catch (migrationError) {
        console.warn('[Magazzino] link ispezione non trasferito:', migrationError.message);
        return;
      }
    }
    window.localStorage.removeItem(INSPECTIONS_BY_ITEM_STORAGE_KEY);
    if (moved) {
      setMaterials(await getEquipment());
    }
  }

  function getStoredInspectionMap() {
    if (typeof window === 'undefined') return {};
    try {
      const raw = window.localStorage.getItem(INSPECTIONS_BY_ITEM_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  function getInspectionUrlForMaterial(material) {
    return String(material?.inspection_url ?? '').trim();
  }

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
      notes: '',
      inspection_url: getInspectionUrlForMaterial(selectedMaterial),
      prossima_ispezione: dateInputValue(selectedMaterial.prossima_ispezione),
      fine_vita: dateInputValue(selectedMaterial.fine_vita),
    }));
    setEditingBorrowed(Math.max(total - available, 0));
    setRestockMode('replace');
  }, [selectedMaterial, editingId, quantityField, availableField, notesField, supportsEquipmentNumber]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    const totalQuantity = Number(form.quantity);
    const notesValue = form.notes.trim() || null;
    const inspectionUrl = form.inspection_url.trim() || null;
    const isRestock = Boolean(selectedMaterial && !editingId);

    if (Number.isNaN(totalQuantity) || totalQuantity < 0 || (isRestock && totalQuantity <= 0)) {
      setError(isRestock ? 'Inserisci quanti pezzi aggiungere.' : 'Inserisci una quantità totale valida.');
      setSubmitting(false);
      return;
    }
    if (inspectionUrl && !/^https?:\/\//i.test(inspectionUrl)) {
      setError('Il link della scheda ispezione deve iniziare con http:// o https://.');
      setSubmitting(false);
      return;
    }

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
    };
    if (supportsEquipmentNumber) {
      payload.equipment_number = form.equipment_number ? Number(form.equipment_number) : null;
    }
    if (notesField) {
      payload.notes = notesValue;
    }
    if (canManageInspections) {
      if (inspectionField) payload.inspection_url = inspectionUrl;
      payload.prossima_ispezione = form.prossima_ispezione || null;
      payload.fine_vita = form.fine_vita || null;
    }

    try {
      let savedEquipment;
      if (isRestock && selectedMaterial) {
        // Rifornimento calcolato dal database sui valori attuali, non su quelli nel browser.
        savedEquipment = await restockEquipment({
          id: selectedMaterial.id,
          quantity: totalQuantity,
          increaseTotal: restockMode === 'stock',
          note: notesValue,
        });
        if (canManageInspections) {
          const inspectionPatch = {
            prossima_ispezione: form.prossima_ispezione || null,
            fine_vita: form.fine_vita || null,
          };
          if (inspectionField) inspectionPatch.inspection_url = inspectionUrl;
          savedEquipment = await updateEquipment(selectedMaterial.id, inspectionPatch);
        }
        safeLogActivity(
          {
            action: 'restock_equipment',
            entity: 'equipment',
            entityId: savedEquipment.id,
            details: { name: savedEquipment.name, added: totalQuantity, mode: restockMode },
          },
          user,
        );
      } else if (editingId) {
        // Si invia solo il totale: il database sposta la disponibilità della stessa
        // differenza, così i pezzi attualmente in prestito restano conteggiati.
        if (quantityField) payload[quantityField] = totalQuantity;
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
      } else {
        if (quantityField) payload[quantityField] = totalQuantity;
        if (availableField) payload[availableField] = totalQuantity;
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
      setError(friendlyDbError(submitError, 'Errore durante il salvataggio.'));
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
      prossima_ispezione: dateInputValue(material.prossima_ispezione),
      fine_vita: dateInputValue(material.fine_vita),
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
    if (!canManageInspections) return;
    if (!canEditInventory) return;
    const currentValue = getInspectionUrlForMaterial(material);
    const nextValue = window.prompt('Inserisci il link Drive della scheda ispezione', currentValue);
    if (nextValue === null) return;
    const normalized = nextValue.trim();
    if (normalized && !/^https?:\/\//i.test(normalized)) {
      setError('Inserisci un URL valido (http:// o https://).');
      return;
    }
    setError('');
    if (!inspectionField) {
      setError('Aggiorna il database (migrazione 05) per salvare i link delle ispezioni.');
      return;
    }
    try {
      await updateEquipment(material.id, { inspection_url: normalized || null });
      await loadMaterials();
    } catch (updateError) {
      setError(updateError.message ?? 'Impossibile aggiornare il link ispezione.');
    }
  }

  async function openInspectionsFolder() {
    if (!canManageInspections) return;
    const target = INSPECTIONS_FOLDER_URL || inspectionsFolderUrl;
    if (target && /^https?:\/\//i.test(target)) {
      window.open(target, '_blank', 'noopener,noreferrer');
      return;
    }
    const manualUrl = window.prompt(
      'Inserisci il link della cartella Drive Ispezioni (verrà salvato per tutto lo staff)',
      'https://drive.google.com/drive/folders/...',
    );
    if (!manualUrl) return;
    const normalized = manualUrl.trim();
    if (!/^https?:\/\//i.test(normalized)) {
      setError('Inserisci un URL valido (http:// o https://).');
      return;
    }
    try {
      await setSetting(INSPECTIONS_FOLDER_SETTING, normalized, user);
      setInspectionsFolderUrl(normalized);
    } catch (settingError) {
      setError(friendlyDbError(settingError, 'Impossibile salvare il link della cartella.'));
    }
    window.open(normalized, '_blank', 'noopener,noreferrer');
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
      {dpiAlertCount > 0 && (
        <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', color: '#c92a2a' }}>
          <input type="checkbox" checked={dpiFilter} onChange={(event) => setDpiFilter(event.target.checked)} />
          Mostra solo i {dpiAlertCount} materiali con ispezione o fine vita in scadenza
        </label>
      )}

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
            <label htmlFor="notes">
              {selectedMaterialId && !editingId ? 'Nota da aggiungere (facoltativa)' : 'Note (acquisti, sostituzioni, altro)'}
            </label>
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
            {canManageInspections && (
              <>
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
                <div style={{ display: 'grid', gap: '0.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                  <label style={{ display: 'grid', gap: '0.25rem' }}>
                    Prossima ispezione
                    <input
                      type="date"
                      value={form.prossima_ispezione}
                      onChange={(event) => handleChange('prossima_ispezione', event.target.value)}
                    />
                  </label>
                  <label style={{ display: 'grid', gap: '0.25rem' }}>
                    Fine vita del dispositivo
                    <input
                      type="date"
                      value={form.fine_vita}
                      onChange={(event) => handleChange('fine_vita', event.target.value)}
                    />
                  </label>
                </div>
                <small style={{ color: 'var(--color-muted)' }}>
                  Per corde, imbraghi e connettori la fine vita la indica il produttore nella nota informativa.
                  L&apos;app avvisa 30 giorni prima dell&apos;ispezione e 90 giorni prima della fine vita.
                </small>
              </>
            )}
            <input
              type="number"
              min={0}
              placeholder={selectedMaterialId && !editingId ? 'Quantità da aggiungere' : 'Quantità totale'}
              value={form.quantity}
              onChange={(event) => handleChange('quantity', event.target.value)}
              required
            />
            {editingId && editingBorrowed > 0 && (
              <small style={{ color: 'var(--color-muted)' }}>
                {editingBorrowed} {editingBorrowed === 1 ? 'pezzo è' : 'pezzi sono'} in prestito: restano conteggiati anche se cambi il totale.
              </small>
            )}
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
                {getDpiAlerts(material).map((alert) => (
                  <p
                    key={alert.kind}
                    style={{
                      margin: '0 0 0.35rem',
                      padding: '0.35rem 0.6rem',
                      borderRadius: '0.5rem',
                      background: alert.level === 'expired' ? '#fff5f5' : '#fff9db',
                      color: alert.level === 'expired' ? '#c92a2a' : '#8a6d00',
                      fontWeight: 600,
                    }}
                  >
                    {alert.text}
                    {alert.kind === 'fine_vita' && alert.level === 'expired' ? ' · non usare, da ritirare' : ''}
                  </p>
                ))}
                {notesField && material[notesField] && (
                  <p style={{ color: 'var(--color-muted)', fontStyle: 'italic' }}>Note: {material[notesField]}</p>
                )}
                {canManageInspections && (
                  <details style={{ marginTop: '0.5rem' }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Ispezioni</summary>
                    <div style={{ marginTop: '0.5rem', display: 'grid', gap: '0.5rem' }}>
                      {getInspectionUrlForMaterial(material) ? (
                        <a href={getInspectionUrlForMaterial(material)} target="_blank" rel="noreferrer">
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
                          {getInspectionUrlForMaterial(material) ? 'Modifica link ispezione' : 'Collega link ispezione'}
                        </button>
                      )}
                    </div>
                  </details>
                )}
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
        {canManageInspections && (
          <button
            type="button"
            style={{ background: '#868e96' }}
            onClick={openInspectionsFolder}
          >
            Ispezioni
          </button>
        )}
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
