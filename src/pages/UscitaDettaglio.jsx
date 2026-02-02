import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import useAuth from '../context/useAuth.js';
import usePermissions from '../hooks/usePermissions.js';
import UscitaForm from '../components/UscitaForm.jsx';
import { getUscitaById, updateUscita } from '../services/uscite';
import { getMembers } from '../services/members';
import { getEquipmentById, setEquipmentAvailability } from '../services/equipment.js';
import { supabase } from '../lib/supabaseClient';

const PHOTO_BUCKET = import.meta.env.VITE_SUPABASE_PHOTOS_BUCKET || 'uscite-foto';

function formatDate(value) {
  if (!value) return '-';
  const source = value.includes('T') ? value : `${value}T00:00:00`;
  const date = new Date(source);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

function formatTime(value) {
  if (!value) return '-';
  const [timePart] = value.split('+');
  return timePart.slice(0, 5);
}

export default function UscitaDettaglio() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { role, user } = useAuth();
  const { canEditSection } = usePermissions();
  const canEditUscite = canEditSection('uscita');
  const canManageLoans = canEditSection('prestiti');
  const [uscita, setUscita] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [formError, setFormError] = useState('');
  const [prestitoParams, setPrestitoParams] = useState('');
  const [membersMap, setMembersMap] = useState(new Map());
  const [feedbackText, setFeedbackText] = useState('');
  const [photosText, setPhotosText] = useState('');
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [feedbackStatus, setFeedbackStatus] = useState('');
  const [feedbackError, setFeedbackError] = useState('');
  const [hasOpenLoans, setHasOpenLoans] = useState(false);
  const [checkingLoans, setCheckingLoans] = useState(true);
  const [uscitaLoans, setUscitaLoans] = useState([]);
  const [uscitaLoansLoading, setUscitaLoansLoading] = useState(true);
  const [uscitaLoansError, setUscitaLoansError] = useState('');
  const [loanProcessingId, setLoanProcessingId] = useState(null);
  const [statusChanging, setStatusChanging] = useState(false);
  const [statusError, setStatusError] = useState('');
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [photoDownloadError, setPhotoDownloadError] = useState('');

  const loadDettaglio = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const data = await getUscitaById(id);
      setUscita(data);
      setFeedbackText(data.feedback ?? '');
      setPhotosText((data.photo_urls ?? []).join('\n'));
    } catch (loadError) {
      setError(loadError.message ?? 'Uscita non trovata.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadDettaglio();
  }, [loadDettaglio]);

  useEffect(() => {
    let ignore = false;
    async function checkOpenLoans() {
      if (!id) {
        setHasOpenLoans(false);
        setCheckingLoans(false);
        return;
      }
      setCheckingLoans(true);
      try {
        const { count, error } = await supabase
          .from('loans')
          .select('id', { count: 'exact', head: true })
          .eq('uscita_id', id)
          .eq('status', 'in_corso');
        if (error) {
          throw error;
        }
        if (!ignore) {
          setHasOpenLoans((count ?? 0) > 0);
        }
      } catch (loanError) {
        if (!ignore) {
          console.error('[UscitaDettaglio] Errore verifica prestiti aperti:', loanError.message);
          setHasOpenLoans(false);
        }
      } finally {
        if (!ignore) {
          setCheckingLoans(false);
        }
      }
    }
    checkOpenLoans();
    return () => {
      ignore = true;
    };
  }, [id]);

  useEffect(() => {
    let ignore = false;
    async function loadUscitaLoans() {
      if (!id) return;
      setUscitaLoansLoading(true);
      setUscitaLoansError('');
      try {
        const { data, error: loansError } = await supabase
          .from('loans')
          .select('id,equipment_id,borrower_name,borrower_email,quantity,status,delivered_at,returned_at,notes,equipment:equipment_id(name)')
          .eq('uscita_id', id)
          .order('delivered_at', { ascending: false });
        if (loansError) throw loansError;
        if (!ignore) {
          setUscitaLoans(data ?? []);
        }
      } catch (loadError) {
        if (!ignore) {
          console.error('[UscitaDettaglio] Errore caricamento prestiti collegati:', loadError.message);
          setUscitaLoans([]);
          setUscitaLoansError('Impossibile caricare i prestiti collegati.');
        }
      } finally {
        if (!ignore) {
          setUscitaLoansLoading(false);
        }
      }
    }
    loadUscitaLoans();
    return () => {
      ignore = true;
    };
  }, [id]);

  async function handleLoanReturn(loan) {
    const loanEmail = loan.borrower_email || loan.borrower_name;
    const isOwner = loanEmail && user?.email && loanEmail === user.email;
    if (!canManageLoans && !isOwner) return;
    setLoanProcessingId(loan.id);
    setUscitaLoansError('');
    const now = new Date().toISOString();
    const { error: loanError } = await supabase
      .from('loans')
      .update({ status: 'chiuso', returned_at: now })
      .eq('id', loan.id);
    if (loanError) {
      setUscitaLoansError('Impossibile chiudere il prestito.');
      setLoanProcessingId(null);
      return;
    }
    try {
      const equipmentRow = await getEquipmentById(loan.equipment_id);
      const currentAvailable = Number(equipmentRow.quantity_available ?? equipmentRow.quantity ?? 0);
      const newAvailability = currentAvailable + loan.quantity;
      await setEquipmentAvailability({ column: 'equipment_id', value: loan.equipment_id }, newAvailability);
    } catch (availabilityError) {
      console.error('[UscitaDettaglio] Errore aggiornamento magazzino:', availabilityError);
      setUscitaLoansError('Prestito chiuso ma quantita non aggiornata. Controlla il magazzino.');
    }
    setLoanProcessingId(null);
    setUscitaLoans((prev) =>
      prev.map((item) => (item.id === loan.id ? { ...item, status: 'chiuso', returned_at: now } : item)),
    );
    setHasOpenLoans((prev) => (prev ? prev : false));
  }

  useEffect(() => {
    async function loadMembers() {
      const list = await getMembers();
      const map = new Map();
      list.forEach((member) => {
        if (member?.id) {
          map.set(String(member.id), member.full_name);
        }
      });
      setMembersMap(map);
    }
    loadMembers();
  }, []);

  async function handleUpdate(payload) {
    setSaving(true);
    setFormError('');
    setSuccess('');
    try {
      const updated = await updateUscita(id, payload);
      setUscita(updated);
      setFeedbackText(updated.feedback ?? '');
      setPhotosText((updated.photo_urls ?? []).join('\n'));
      setSuccess('Uscita aggiornata.');
      setEditMode(false);
    } catch (updateError) {
      setFormError(updateError.message ?? 'Errore durante l\'aggiornamento.');
    } finally {
      setSaving(false);
    }
  }

  async function handleFeedbackSave() {
    setFeedbackSaving(true);
    setFeedbackError('');
    setFeedbackStatus('');
    try {
      const photos = photosText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      const updated = await updateUscita(id, {
        feedback: feedbackText.trim() || null,
        photo_urls: photos.length ? photos : null,
      });
      setUscita(updated);
      setFeedbackStatus('Feedback aggiornato.');
    } catch (saveError) {
      setFeedbackError(saveError.message ?? 'Impossibile salvare il feedback.');
    } finally {
      setFeedbackSaving(false);
    }
  }

  async function handleStatusToggle(nextStatus) {
    setStatusChanging(true);
    setStatusError('');
    try {
      const payload = { status: nextStatus };
      if (supportsClosedAt) {
        payload.closed_at = nextStatus === 'chiusa' ? new Date().toISOString() : null;
      }
      const updated = await updateUscita(id, payload);
      setUscita(updated);
      setSuccess(nextStatus === 'chiusa' ? 'Uscita chiusa.' : 'Uscita riaperta.');
    } catch (toggleError) {
      if (supportsClosedAt && /closed_at/i.test(toggleError.message ?? '')) {
        try {
          const updated = await updateUscita(id, { status: nextStatus });
          setUscita(updated);
          setSuccess(nextStatus === 'chiusa' ? 'Uscita chiusa.' : 'Uscita riaperta.');
          return;
        } catch (fallbackError) {
          setStatusError(fallbackError.message ?? 'Impossibile aggiornare lo stato dell\'uscita.');
        }
      } else {
        setStatusError(toggleError.message ?? 'Impossibile aggiornare lo stato dell\'uscita.');
      }
    } finally {
      setStatusChanging(false);
    }
  }

  async function handlePhotoUpload(event) {
    if (!uscita) return;
    const input = event.target;
    const files = Array.from(input.files ?? []);
    if (!files.length) return;
    if (!PHOTO_BUCKET) {
      setUploadError('Configura VITE_SUPABASE_PHOTOS_BUCKET per abilitare l\'upload delle foto.');
      return;
    }
    setUploadError('');
    setUploadingPhotos(true);
    try {
      const uploadedUrls = [];
      for (const file of files) {
        const sanitizedName = file.name.replace(/\s+/g, '-');
        const path = `${uscita.id}/${Date.now()}-${sanitizedName}`;
        const { error: uploadErrorResp } = await supabase.storage
          .from(PHOTO_BUCKET)
          .upload(path, file, { upsert: false, cacheControl: '3600', contentType: file.type });
        if (uploadErrorResp) {
          throw uploadErrorResp;
        }
        const { data: publicData } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path);
        if (publicData?.publicUrl) {
          uploadedUrls.push(publicData.publicUrl);
        }
      }
      const mergedPhotos = [...new Set([...(uscita.photo_urls ?? []), ...uploadedUrls])];
      const updated = await updateUscita(id, { photo_urls: mergedPhotos });
      setUscita(updated);
      setPhotosText((updated.photo_urls ?? []).join('\n'));
      setFeedbackStatus('Foto caricate con successo.');
    } catch (uploadErr) {
      setUploadError(uploadErr.message ?? 'Impossibile caricare le foto.');
    } finally {
      setUploadingPhotos(false);
      input.value = '';
    }
  }

  async function handlePhotoDownload(url) {
    if (!url) return;
    setPhotoDownloadError('');
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Impossibile scaricare la foto.');
      }
      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      const pathname = url.split('?')[0];
      const fallbackName = pathname.split('/').pop() || 'foto-uscita';
      link.href = objectUrl;
      link.download = decodeURIComponent(fallbackName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(objectUrl);
    } catch (downloadError) {
      setPhotoDownloadError(downloadError.message ?? 'Impossibile scaricare la foto.');
    }
  }

  const supportsClosedAt = uscita ? Object.prototype.hasOwnProperty.call(uscita, 'closed_at') : false;
  const isClosed = uscita?.status === 'chiusa';
  const mapsLink = useMemo(() => {
    if (!uscita?.luogo) return null;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(uscita.luogo)}`;
  }, [uscita?.luogo]);

  useEffect(() => {
    if (!uscita) return;
    const params = new URLSearchParams();
    params.set('uscita', uscita.id);
    if (uscita.titolo) params.set('uscitaTitle', uscita.titolo);
    if (uscita.data) params.set('uscitaDate', uscita.data);
    setPrestitoParams(params.toString());
  }, [uscita]);

  const uscitaDateObject = useMemo(() => {
    if (!uscita?.data) return null;
    const parsed = new Date(uscita.data);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }, [uscita?.data]);

  const disableLoanButton = useMemo(() => {
    if (isClosed) return true;
    if (!uscitaDateObject || Number.isNaN(uscitaDateObject.getTime())) return false;
    return uscitaDateObject < new Date() && !hasOpenLoans;
  }, [uscitaDateObject, hasOpenLoans, isClosed]);

  const canReopenUscita = role === 'admin' || role === 'presidente';

  if (loading) {
    return <p>Caricamento uscita...</p>;
  }

  if (!uscita) {
    return (
      <section className="page-grid">
        <p>{error || 'Uscita non trovata.'}</p>
        <Link to="/uscite">Torna all'elenco</Link>
      </section>
    );
  }

  return (
    <section className="page-grid">
      <header>
        <button type="button" style={{ background: '#adb5bd' }} onClick={() => navigate('/uscite')}>
          ← Torna all'elenco
        </button>
        <h1>{uscita.titolo}</h1>
        <p>Creato il: {uscita.created_at ? new Date(uscita.created_at).toLocaleString('it-IT') : '-'}</p>
        <p>
          Stato: <strong>{isClosed ? 'Chiusa' : 'Aperta'}</strong>
          {isClosed && uscita.closed_at
            ? ` · chiusa il ${new Date(uscita.closed_at).toLocaleString('it-IT')}`
            : ''}
        </p>
      </header>

      {error && <p style={{ color: 'var(--color-accent)' }}>{error}</p>}
      {success && <p style={{ color: 'var(--color-primary)' }}>{success}</p>}
      {statusError && <p style={{ color: 'var(--color-accent)' }}>{statusError}</p>}

      <article className="card">
        <h2>Dettagli uscita</h2>
        <dl style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.75rem' }}>
          <dt>Data</dt>
          <dd>{formatDate(uscita.data)}</dd>
          <dt>Ora</dt>
          <dd>{formatTime(uscita.ora)}</dd>
          <dt>Luogo</dt>
          <dd>
            {mapsLink ? (
              <a href={mapsLink} target="_blank" rel="noopener noreferrer">
                {uscita.luogo}
              </a>
            ) : (
              '-'
            )}
          </dd>
          <dt>Tipo</dt>
          <dd>{uscita.tipo || '-'}</dd>
          <dt>Responsabile</dt>
          <dd>{uscita.responsabile_nome || uscita.responsabile_full_name || 'Da assegnare'}</dd>
          <dt>Partecipanti</dt>
          <dd>
            {uscita.participants_ids?.length || uscita.participants_manual
              ? [
                  ...(uscita.participants_ids ?? [])
                    .map((participantId) => membersMap.get(participantId))
                    .filter(Boolean),
                  uscita.participants_manual,
                ]
                  .filter(Boolean)
                  .join(', ')
              : 'Nessun partecipante indicato.'}
          </dd>
          <dt>Note</dt>
          <dd>{uscita.note || 'Nessuna nota inserita.'}</dd>
        </dl>
      </article>

      {canEditUscite && (
        <article className="card">
          <h2>Feedback e foto</h2>
          <textarea
            rows={3}
            placeholder="Commenti conclusivi sull'uscita..."
            value={feedbackText}
            onChange={(event) => setFeedbackText(event.target.value)}
          />
          <label htmlFor="photoUrls" style={{ marginTop: '0.5rem', fontWeight: 600 }}>
            Link foto (uno per riga)
          </label>
          <textarea
            id="photoUrls"
            rows={3}
            placeholder="https://..."
            value={photosText}
            onChange={(event) => setPhotosText(event.target.value)}
          />
          {PHOTO_BUCKET ? (
            <>
              <label htmlFor="photoUpload" style={{ marginTop: '0.5rem', fontWeight: 600 }}>
                Carica nuove foto
              </label>
              <div
                onDragOver={(event) => {
                  event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (uploadingPhotos) return;
                  handlePhotoUpload({ target: { files: event.dataTransfer.files } });
                }}
                style={{
                  border: '1px dashed rgba(0,0,0,0.2)',
                  borderRadius: '0.75rem',
                  padding: '0.75rem',
                  marginBottom: '0.5rem',
                  background: '#fff',
                }}
              >
                <p style={{ margin: 0, color: 'var(--color-muted)' }}>
                  Trascina le foto qui oppure utilizza il pulsante Sfoglia.
                </p>
                <input
                  id="photoUpload"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handlePhotoUpload}
                  disabled={uploadingPhotos}
                />
              </div>
            </>
          ) : (
            <p style={{ color: 'var(--color-muted)' }}>
              Configura la variabile VITE_SUPABASE_PHOTOS_BUCKET per attivare l&apos;upload diretto delle foto.
            </p>
          )}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button type="button" onClick={handleFeedbackSave} disabled={feedbackSaving}>
              {feedbackSaving ? 'Salvataggio...' : 'Salva feedback'}
            </button>
            <button
              type="button"
              style={{ background: '#adb5bd' }}
              onClick={() => {
                setFeedbackText(uscita.feedback ?? '');
                setPhotosText((uscita.photo_urls ?? []).join('\n'));
              }}
            >
              Ripristina
            </button>
            {!isClosed && (
              <button
                type="button"
                style={{ background: '#2b8a3e' }}
                onClick={() => handleStatusToggle('chiusa')}
                disabled={statusChanging}
              >
                {statusChanging ? 'Aggiornamento...' : 'Chiudi uscita'}
              </button>
            )}
          </div>
          {feedbackError && <p style={{ color: 'var(--color-accent)' }}>{feedbackError}</p>}
          {feedbackStatus && <p style={{ color: 'var(--color-primary)' }}>{feedbackStatus}</p>}
          {uploadError && <p style={{ color: 'var(--color-accent)' }}>{uploadError}</p>}
          {photoDownloadError && <p style={{ color: 'var(--color-accent)' }}>{photoDownloadError}</p>}
          {(uscita.photo_urls ?? []).length > 0 && (
            <div style={{ marginTop: '0.75rem' }}>
              <strong>Foto caricate:</strong>
              <ul
                style={{
                  listStyle: 'none',
                  padding: 0,
                  margin: '0.5rem 0 0',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                  gap: '0.75rem',
                }}
              >
                {uscita.photo_urls.map((url) => (
                  <li
                    key={url}
                    style={{
                      border: '1px solid rgba(0,0,0,0.08)',
                      borderRadius: '0.75rem',
                      padding: '0.5rem',
                      background: '#f8f9fa',
                    }}
                  >
                    <div
                      style={{
                        width: '100%',
                        aspectRatio: '4 / 3',
                        borderRadius: '0.5rem',
                        overflow: 'hidden',
                        marginBottom: '0.4rem',
                        background: '#fff',
                      }}
                    >
                      <img
                        src={url}
                        alt="Anteprima foto uscita"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '0.25rem', flexDirection: 'column' }}>
                      <a href={url} target="_blank" rel="noopener noreferrer">
                        Apri originale
                      </a>
                      <button
                        type="button"
                        style={{ background: '#2b8a3e', color: '#fff' }}
                        onClick={() => handlePhotoDownload(url)}
                      >
                        Scarica
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </article>
      )}

      {canEditUscite && (
        <article className="card">
          {editMode ? (
            <UscitaForm
              initialValues={uscita}
              onSubmit={handleUpdate}
              submitting={saving}
              errorMessage={formError}
              onCancel={() => {
                setEditMode(false);
                setFormError('');
                setSuccess('');
              }}
              submitLabel="Aggiorna uscita"
            />
          ) : (
            <>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => {
                    setEditMode(true);
                    setSuccess('');
                  }}
                  disabled={isClosed}
                  title={isClosed ? 'Non puoi modificare uscite concluse.' : undefined}
                >
                  Modifica uscita
                </button>
                <button
                  type="button"
                  style={{ background: 'var(--color-primary-dark)' }}
                  onClick={() =>
                    navigate(prestitoParams ? `/prestito-avanzato?${prestitoParams}` : '/prestito-avanzato')
                  }
                  disabled={checkingLoans || disableLoanButton}
                  title={
                    checkingLoans
                      ? 'Verifico lo stato dei prestiti collegati...'
                      : disableLoanButton
                      ? 'Uscita conclusa: tutti i prestiti risultano chiusi'
                      : undefined
                  }
                >
                  Materiale necessario per questa uscita
                </button>
                <button
                  type="button"
                  style={{ background: isClosed ? '#1971c2' : '#2b8a3e' }}
                  onClick={() => handleStatusToggle(isClosed ? 'aperta' : 'chiusa')}
                  disabled={statusChanging || (isClosed && !canReopenUscita)}
                  title={
                    isClosed && !canReopenUscita
                      ? 'Solo admin e presidente possono riaprire un\'uscita chiusa.'
                      : undefined
                  }
                >
                  {statusChanging
                    ? 'Aggiornamento...'
                    : isClosed
                    ? 'Riapri uscita'
                    : 'Chiudi uscita'}
                </button>
              </div>
              {disableLoanButton && (
                <small style={{ color: 'var(--color-muted)' }}>
                  Hai chiuso tutti i prestiti collegati dopo la data dell&apos;uscita, non puoi crearne di nuovi.
                </small>
              )}
              {isClosed && (
                <small style={{ color: 'var(--color-muted)' }}>Riapri l&apos;uscita per modificare i dettagli.</small>
              )}
            </>
          )}
          <article className="card">
            <h3>Prestiti collegati</h3>
            {uscitaLoansError && <p style={{ color: 'var(--color-accent)' }}>{uscitaLoansError}</p>}
            {uscitaLoansLoading ? (
              <p>Caricamento prestiti...</p>
            ) : uscitaLoans.length ? (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.5rem' }}>
                {uscitaLoans.map((loan) => (
                  <li key={loan.id} style={{ border: '1px solid var(--color-border)', borderRadius: '0.75rem', padding: '0.75rem' }}>
                    <strong>
                      {(loan.equipment?.name ?? loan.equipment_id)} · x{loan.quantity}
                    </strong>
                    <p style={{ margin: '0.25rem 0', color: 'var(--color-muted)' }}>a: {loan.borrower_name}</p>
                    <small style={{ color: 'var(--color-muted)' }}>
                      consegnato il {loan.delivered_at ? new Date(loan.delivered_at).toLocaleString('it-IT') : '—'}
                    </small>
                    {loan.status === 'chiuso' && (
                      <p style={{ margin: '0.25rem 0', color: 'var(--color-muted)' }}>
                        restituito il {loan.returned_at ? new Date(loan.returned_at).toLocaleString('it-IT') : '—'}
                      </p>
                    )}
                    {loan.status === 'in_corso' &&
                      (canManageLoans || (user?.email && (loan.borrower_email || loan.borrower_name) === user.email)) && (
                        <button
                          type="button"
                          style={{ marginTop: '0.35rem' }}
                          disabled={loanProcessingId === loan.id}
                          onClick={() => handleLoanReturn(loan)}
                        >
                          {loanProcessingId === loan.id ? 'Aggiornamento...' : 'Restituisci materiale'}
                        </button>
                      )}
                  </li>
                ))}
              </ul>
            ) : (
              <p>Nessun prestito collegato a questa uscita.</p>
            )}
          </article>
        </article>
      )}
    </section>
  );
}
