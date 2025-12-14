import { useCallback, useEffect, useMemo, useState } from 'react';
import { getMembers } from '../services/members';
import usePermissions from '../hooks/usePermissions.js';
import useAlerts from '../hooks/useAlerts.js';
import AlertList from '../components/AlertList.jsx';
import { useNavigate } from 'react-router-dom';

const QUALIFICATION_OPTIONS = [
  { value: 'istruttore', label: 'Istruttore' },
  { value: 'aiuto_istruttore', label: 'Aiuto istruttore' },
];

const PAYMENT_STATUS_OPTIONS = [
  { value: 'pending', label: 'Da saldare' },
  { value: 'paid', label: 'Pagato' },
  { value: 'exempt', label: 'Esente' },
];

const emptyInstructorForm = {
  memberId: '',
  qualification: QUALIFICATION_OPTIONS[0].value,
  customQualification: '',
};

const emptyStudentForm = {
  firstName: '',
  lastName: '',
  birthDate: '',
  paymentStatus: PAYMENT_STATUS_OPTIONS[0].value,
  regulationRead: false,
  privacyAccepted: false,
  equipmentDelivery: '',
  equipmentReturn: '',
  equipmentNotes: '',
};

const REGISTRY_QUALIFICATION_OPTIONS = [
  { value: 'istruttore', label: 'Istruttore' },
  { value: 'aiuto_istruttore', label: 'Aiuto istruttore' },
];

const SCUOLA_STORAGE_KEY = 'speleo-scuola-data-v2';

const emptyRegistryForm = {
  memberId: '',
  qualificationType: REGISTRY_QUALIFICATION_OPTIONS[0].value,
  customQualification: '',
  qualificationDate: '',
  lastMaintenanceDate: '',
  activities: '',
  nextMaintenanceDate: '',
};

function normalizeRegistryEntry(entry) {
  return {
    ...entry,
    documents: Array.isArray(entry.documents) ? entry.documents : [],
  };
}

function generateId() {
  const cryptoRef = typeof globalThis !== 'undefined' ? globalThis.crypto : null;
  if (cryptoRef?.randomUUID) {
    return cryptoRef.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function addYears(dateString, yearsToAdd = 5) {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  date.setFullYear(date.getFullYear() + yearsToAdd);
  return date.toISOString().split('T')[0];
}

function buildCourse(name) {
  return {
    id: generateId(),
    name,
    instructors: [],
    students: [],
    linkedUscite: [],
    isClosed: false,
    closedAt: null,
  };
}

function buildYearFolder(label, initialCourseName = '') {
  const courses = initialCourseName ? [buildCourse(initialCourseName)] : [];
  return {
    id: generateId(),
    label,
    courses,
  };
}

export default function Corso() {
  const currentYear = new Date().getFullYear();
  const initialYear = useMemo(() => buildYearFolder(`Anno ${currentYear}`, `Corso ${currentYear}`), [currentYear]);
  const { canEditSection, canViewPage } = usePermissions();
  const { adminAlerts, userAlerts, dismissAlert } = useAlerts();
  const navigate = useNavigate();
  const canViewScuola = canViewPage('scuola');
  const canEditScuola = canEditSection('scuola');

  if (!canViewScuola) {
    return (
      <section className="page-grid">
        <p>Non hai i permessi per accedere a questa pagina.</p>
      </section>
    );
  }

  if (!canEditScuola) {
    return (
      <section className="page-grid">
        <h1>Scuola</h1>
        <p>Puoi consultare corsi e registro dalla pagina Report. Solo il direttore scuola o gli amministratori possono modificarli.</p>
        <AlertList alerts={userAlerts} navigate={navigate} onDismiss={dismissAlert} />
      </section>
    );
  }
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [membersError, setMembersError] = useState('');
  const [yearFolders, setYearFolders] = useState([initialYear]);
  const [activeYearId, setActiveYearId] = useState(initialYear.id);
  const [activeCourseId, setActiveCourseId] = useState(initialYear.courses[0]?.id ?? null);
  const [expandedYearId, setExpandedYearId] = useState(initialYear.id);
  const [yearFormLabel, setYearFormLabel] = useState('');
  const [courseFormName, setCourseFormName] = useState('');
  const [instructorForm, setInstructorForm] = useState(emptyInstructorForm);
  const [instructorError, setInstructorError] = useState('');
  const [studentForm, setStudentForm] = useState(emptyStudentForm);
  const [studentError, setStudentError] = useState('');
  const [registry, setRegistry] = useState([]);
  const [registryForm, setRegistryForm] = useState(emptyRegistryForm);
  const [registryExpandedEntry, setRegistryExpandedEntry] = useState(null);
  const [registryFolderExpanded, setRegistryFolderExpanded] = useState(false);
  const [registrySelectedYearId, setRegistrySelectedYearId] = useState(initialYear.id);
  const [registryError, setRegistryError] = useState('');
  const [registryFilter, setRegistryFilter] = useState('all');
  const [registryDragEntry, setRegistryDragEntry] = useState(null);
  const [registryUploadStatus, setRegistryUploadStatus] = useState({});
  const [registryUploadErrors, setRegistryUploadErrors] = useState({});
  const [coursesFolderExpanded, setCoursesFolderExpanded] = useState(false);
  const [materialsFolderExpanded, setMaterialsFolderExpanded] = useState(false);
  const [teachingMaterials, setTeachingMaterials] = useState([]);
  const [teachingMaterialsUploadStatus, setTeachingMaterialsUploadStatus] = useState(false);
  const [teachingMaterialsError, setTeachingMaterialsError] = useState('');
  const [hydrated, setHydrated] = useState(false);

  const loadMembers = useCallback(async () => {
    setMembersLoading(true);
    setMembersError('');
    try {
      const data = await getMembers();
      setMembers(data);
    } catch (error) {
      setMembersError(error.message ?? 'Non riesco a recuperare i soci.');
    } finally {
      setMembersLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      setHydrated(true);
      return;
    }
    try {
      const raw = window.localStorage.getItem(SCUOLA_STORAGE_KEY);
      if (!raw) {
        setHydrated(true);
        return;
      }
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.yearFolders) && parsed.yearFolders.length) {
        setYearFolders(parsed.yearFolders);
        const storedYearId =
          parsed.state?.activeYearId && parsed.yearFolders.some((year) => year.id === parsed.state.activeYearId)
            ? parsed.state.activeYearId
            : parsed.yearFolders[0].id;
        setActiveYearId(storedYearId);
        setExpandedYearId(storedYearId);
        const storedYear = parsed.yearFolders.find((year) => year.id === storedYearId);
        const storedCourseId =
          parsed.state?.activeCourseId && storedYear?.courses.some((course) => course.id === parsed.state.activeCourseId)
            ? parsed.state.activeCourseId
            : storedYear?.courses[0]?.id ?? null;
        setActiveCourseId(storedCourseId);
        const nextRegistrySelectedYear =
          parsed.state?.registrySelectedYearId &&
          parsed.yearFolders.some((year) => year.id === parsed.state.registrySelectedYearId)
            ? parsed.state.registrySelectedYearId
            : storedYearId;
        setRegistrySelectedYearId(nextRegistrySelectedYear);
      }
      if (Array.isArray(parsed.registry)) {
        setRegistry(parsed.registry.map((entry) => normalizeRegistryEntry(entry)));
      }
      if (Array.isArray(parsed.teachingMaterials)) {
        setTeachingMaterials(parsed.teachingMaterials);
      }
    } catch (storageError) {
      console.error('[Scuola] Impossibile caricare i dati salvati:', storageError);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return;
    try {
      const payload = {
        updatedAt: new Date().toISOString(),
        yearFolders,
        registry,
        teachingMaterials,
        state: {
          activeYearId,
          activeCourseId,
          registrySelectedYearId,
        },
      };
      window.localStorage.setItem(SCUOLA_STORAGE_KEY, JSON.stringify(payload));
      window.dispatchEvent(new Event('speleo-scuola-update'));
    } catch (storageError) {
      console.error('[Scuola] Impossibile salvare i dati della scuola:', storageError);
    }
  }, [hydrated, yearFolders, registry, teachingMaterials, activeYearId, activeCourseId, registrySelectedYearId]);

  useEffect(() => {
    const year = yearFolders.find((item) => item.id === activeYearId) ?? yearFolders[0] ?? null;
    if (!year) {
      setActiveCourseId(null);
      return;
    }
    if (!year.courses.some((course) => course.id === activeCourseId)) {
      setActiveCourseId(year.courses[0]?.id ?? null);
    }
  }, [yearFolders, activeYearId, activeCourseId]);

  const membersMap = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);
  const activeYear = yearFolders.find((item) => item.id === activeYearId) ?? null;
  const activeCourse = activeYear?.courses.find((course) => course.id === activeCourseId) ?? null;
  const isActiveCourseClosed = Boolean(activeCourse?.isClosed);
  const instructors = activeCourse?.instructors ?? [];
  const students = activeCourse?.students ?? [];
  const coursesSummary = useMemo(() => {
    const totalCourses = yearFolders.reduce((sum, year) => sum + (year.courses?.length ?? 0), 0);
    return { years: yearFolders.length, courses: totalCourses };
  }, [yearFolders]);
  const registryEntriesWithYear = useMemo(
    () =>
      registry.map((entry) => ({
        ...entry,
        documents: Array.isArray(entry.documents) ? entry.documents : [],
        yearLabel: yearFolders.find((year) => year.id === entry.yearId)?.label ?? 'Anno non indicato',
      })),
    [registry, yearFolders],
  );
  const registryStats = useMemo(() => {
    const summary = { total: registryEntriesWithYear.length, ai: 0, it: 0 };
    registryEntriesWithYear.forEach((entry) => {
      if (entry.qualificationType === 'aiuto_istruttore') summary.ai += 1;
      else summary.it += 1;
    });
    return summary;
  }, [registryEntriesWithYear]);
  const filteredRegistryEntries = useMemo(
    () =>
      registryEntriesWithYear.filter((entry) =>
        registryFilter === 'all' ? true : entry.qualificationType === registryFilter,
      ),
    [registryEntriesWithYear, registryFilter],
  );
  const registryYearOptions = useMemo(() => {
    const START_YEAR = 2025;
    const END_YEAR = 2050;
    const yearMap = new Map();
    yearFolders.forEach((year) => {
      yearMap.set(year.label, { id: year.id, label: year.label });
    });
    for (let year = START_YEAR; year <= END_YEAR; year += 1) {
      const label = `Anno ${year}`;
      if (!yearMap.has(label)) {
        yearMap.set(label, { id: `virtual-${year}`, label });
      }
    }
    return Array.from(yearMap.values()).sort((a, b) => {
      const yearA = Number(a.label.replace(/\D+/g, '')) || 0;
      const yearB = Number(b.label.replace(/\D+/g, '')) || 0;
      if (yearA && yearB) return yearA - yearB;
      return a.label.localeCompare(b.label, 'it', { numeric: true });
    });
  }, [yearFolders]);

  function updateYearFolder(yearId, updater) {
    setYearFolders((prev) =>
      prev.map((year) => (year.id === yearId ? { ...year, ...updater(year) } : year)),
    );
  }

  function renderCorpoIstruttoriSection() {
    if (!activeYear || !activeCourse) return null;
    return (
      <article className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0 }}>Corpo istruttori · {activeCourse.name} ({activeYear.label})</h2>
            <p style={{ marginTop: '0.25rem', color: 'var(--color-muted)' }}>
              Seleziona i soci dal menu e assegna la qualifica. I dati rimangono nella cartella dell&apos;anno attivo.
            </p>
          </div>
          <button type="button" style={{ background: '#adb5bd' }} onClick={loadMembers}>
            {membersLoading ? 'Aggiornamento...' : 'Ricarica soci'}
          </button>
        </div>

        {membersError && <p style={{ color: 'var(--color-accent)' }}>{membersError}</p>}
        {isActiveCourseClosed && (
          <p style={{ color: 'var(--color-accent)' }}>
            Questo corso è chiuso. Riaprilo per modificare il corpo istruttori.
          </p>
        )}

        <form
          onSubmit={handleAddInstructor}
          style={{ display: 'grid', gap: '0.75rem', marginTop: '1rem' }}
        >
          <label>
            Seleziona socio
            <select
              value={instructorForm.memberId}
              onChange={(event) => handleInstructorFormChange('memberId', event.target.value)}
              disabled={membersLoading || isActiveCourseClosed}
            >
              <option value="">--</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.full_name} {member.old_id ? `(Tessera ${member.old_id})` : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            Qualifica principale
            <select
              value={instructorForm.qualification}
              onChange={(event) => handleInstructorFormChange('qualification', event.target.value)}
              disabled={isActiveCourseClosed}
            >
              {QUALIFICATION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Qualifiche aggiuntive
            <input
              placeholder="Es. Referente sicurezza, formatore interno..."
              value={instructorForm.customQualification}
              onChange={(event) => handleInstructorFormChange('customQualification', event.target.value)}
              disabled={isActiveCourseClosed}
            />
          </label>
          <button type="submit" disabled={membersLoading || isActiveCourseClosed}>
            {membersLoading ? 'Caricamento soci...' : isActiveCourseClosed ? 'Corso chiuso' : 'Aggiungi al corpo'}
          </button>
          {instructorError && <p style={{ color: 'var(--color-accent)' }}>{instructorError}</p>}
        </form>

        <div className="card-list" style={{ marginTop: '1.5rem' }}>
          {instructors.map((item) => {
            const member = membersMap.get(item.memberId);
            return (
              <article key={item.memberId} className="card" style={{ padding: '1rem' }}>
                <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 style={{ margin: 0 }}>{member?.full_name ?? 'Socio non trovato'}</h3>
                    <p style={{ margin: 0, color: 'var(--color-muted)' }}>
                      Tessera: {member?.old_id ?? 'N/D'} · {member?.email ?? 'Email non disponibile'}
                    </p>
                  </div>
                  <button
                    type="button"
                    style={{ background: '#e03131' }}
                    onClick={() => handleInstructorRemove(item.memberId)}
                    disabled={isActiveCourseClosed}
                  >
                    Rimuovi
                  </button>
                </header>
                <div style={{ display: 'grid', gap: '0.5rem', marginTop: '0.75rem' }}>
                  <label>
                    Qualifica
                    <select
                      value={item.qualification}
                      onChange={(event) => handleInstructorUpdate(item.memberId, 'qualification', event.target.value)}
                      disabled={isActiveCourseClosed}
                    >
                      {QUALIFICATION_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Qualifiche aggiuntive
                    <input
                      placeholder="Note personali"
                      value={item.customQualification}
                      onChange={(event) =>
                        handleInstructorUpdate(item.memberId, 'customQualification', event.target.value)
                      }
                      disabled={isActiveCourseClosed}
                    />
                  </label>
                </div>
              </article>
            );
          })}
          {!instructors.length && (
            <p style={{ color: 'var(--color-muted)' }}>
              Nessun istruttore associato a questo corso.
            </p>
          )}
        </div>
      </article>




    );
  }

  function renderCorsistiSection() {
    if (!activeCourse) return null;
    return (
      <article className="card">
        <h2>Corsisti · {activeCourse.name}</h2>
        <p style={{ marginTop: '0.25rem', color: 'var(--color-muted)' }}>
          Gestisci manualmente i partecipanti con le conferme privacy/regolamento e lo stato attrezzatura.
        </p>
        {isActiveCourseClosed && (
          <p style={{ color: 'var(--color-accent)' }}>
            Questo corso è chiuso. Riaprilo per aggiungere o modificare i corsisti.
          </p>
        )}

        <form
          onSubmit={handleAddStudent}
          style={{
            display: 'grid',
            gap: '0.75rem',
            marginTop: '1rem',
            borderBottom: '1px solid rgba(0,0,0,0.08)',
            paddingBottom: '1rem',
          }}
        >
          <div
            style={{
              display: 'grid',
              gap: '0.75rem',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            }}
          >
            <input
              placeholder="Nome"
              value={studentForm.firstName}
              onChange={(event) => handleStudentFormChange('firstName', event.target.value)}
              required
              disabled={isActiveCourseClosed}
            />
            <input
              placeholder="Cognome"
              value={studentForm.lastName}
              onChange={(event) => handleStudentFormChange('lastName', event.target.value)}
              required
              disabled={isActiveCourseClosed}
            />
            <label>
              Data di nascita
              <input
                type="date"
                value={studentForm.birthDate}
                onChange={(event) => handleStudentFormChange('birthDate', event.target.value)}
                disabled={isActiveCourseClosed}
              />
            </label>
            <label>
              Stato pagamento
              <select
                value={studentForm.paymentStatus}
                onChange={(event) => handleStudentFormChange('paymentStatus', event.target.value)}
                disabled={isActiveCourseClosed}
              >
                {PAYMENT_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={studentForm.regulationRead}
                onChange={(event) => handleStudentFormChange('regulationRead', event.target.checked)}
                disabled={isActiveCourseClosed}
              />
              Regolamento letto
            </label>
            <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={studentForm.privacyAccepted}
                onChange={(event) => handleStudentFormChange('privacyAccepted', event.target.checked)}
                disabled={isActiveCourseClosed}
              />
              Privacy firmata
            </label>
          </div>

          <div
            style={{
              display: 'grid',
              gap: '0.75rem',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            }}
          >
            <label>
              Consegna attrezzatura
              <input
                type="date"
                value={studentForm.equipmentDelivery}
                onChange={(event) => handleStudentFormChange('equipmentDelivery', event.target.value)}
                disabled={isActiveCourseClosed}
              />
            </label>
            <label>
              Restituzione attrezzatura
              <input
                type="date"
                value={studentForm.equipmentReturn}
                onChange={(event) => handleStudentFormChange('equipmentReturn', event.target.value)}
                disabled={isActiveCourseClosed}
              />
            </label>
          </div>

          <textarea
            rows={2}
            placeholder="Note attrezzatura, taglie, esigenze particolari..."
            value={studentForm.equipmentNotes}
            onChange={(event) => handleStudentFormChange('equipmentNotes', event.target.value)}
            disabled={isActiveCourseClosed}
          />

          <button type="submit" disabled={isActiveCourseClosed}>
            {isActiveCourseClosed ? 'Corso chiuso' : 'Aggiungi corsista'}
          </button>
          {studentError && <p style={{ color: 'var(--color-accent)' }}>{studentError}</p>}
        </form>

        <div className="card-list" style={{ marginTop: '1.5rem' }}>
          {students.map((student) => (
            <article key={student.id} className="card" style={{ padding: '1rem' }}>
              <header
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}
              >
                <div>
                  <h3 style={{ margin: 0 }}>
                    {student.firstName} {student.lastName}
                  </h3>
                  <p style={{ margin: 0, color: 'var(--color-muted)' }}>
                    {student.birthDate
                      ? `Nato/a il ${new Date(student.birthDate).toLocaleDateString('it-IT')}`
                      : 'Data di nascita non indicata'}
                  </p>
                </div>
                <button
                  type="button"
                  style={{ background: '#e03131' }}
                  onClick={() => handleRemoveStudent(student.id)}
                  disabled={isActiveCourseClosed}
                >
                  Rimuovi
                </button>
              </header>

              <div style={{ display: 'grid', gap: '0.75rem', marginTop: '0.75rem' }}>
                <label>
                  Stato pagamento
                  <select
                    value={student.paymentStatus}
                    onChange={(event) => handleStudentUpdate(student.id, 'paymentStatus', event.target.value)}
                    disabled={isActiveCourseClosed}
                  >
                    {PAYMENT_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      checked={student.regulationRead}
                      onChange={(event) => handleStudentUpdate(student.id, 'regulationRead', event.target.checked)}
                      disabled={isActiveCourseClosed}
                    />
                    Regolamento letto
                  </label>
                  <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      checked={student.privacyAccepted}
                      onChange={(event) => handleStudentUpdate(student.id, 'privacyAccepted', event.target.checked)}
                      disabled={isActiveCourseClosed}
                    />
                    Privacy firmata
                  </label>
                </div>
                <div
                  style={{
                    display: 'grid',
                    gap: '0.75rem',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  }}
                >
                  <label>
                    Consegna attrezzatura
                    <input
                      type="date"
                      value={student.equipmentDelivery}
                      onChange={(event) =>
                        handleStudentUpdate(student.id, 'equipmentDelivery', event.target.value)
                      }
                      disabled={isActiveCourseClosed}
                    />
                  </label>
                  <label>
                    Restituzione attrezzatura
                    <input
                      type="date"
                      value={student.equipmentReturn}
                      onChange={(event) => handleStudentUpdate(student.id, 'equipmentReturn', event.target.value)}
                      disabled={isActiveCourseClosed}
                    />
                  </label>
                </div>
                <label>
                  Note attrezzatura
                  <textarea
                    rows={2}
                    value={student.equipmentNotes}
                    onChange={(event) => handleStudentUpdate(student.id, 'equipmentNotes', event.target.value)}
                    disabled={isActiveCourseClosed}
                  />
                </label>
              </div>
            </article>
          ))}
          {!students.length && (
            <p style={{ color: 'var(--color-muted)' }}>Ancora nessun partecipante registrato in questo corso.</p>
          )}
        </div>
      </article>
    );
  }

function updateCourse(yearId, courseId, updater) {
  setYearFolders((prev) =>
    prev.map((year) => {
      if (year.id !== yearId) return year;
      return {
          ...year,
          courses: year.courses.map((course) =>
            course.id === courseId ? { ...course, ...updater(course) } : course,
          ),
        };
      }),
    );
  }

  function handleAddYear(event) {
    event.preventDefault();
    const label = yearFormLabel.trim() || `Anno ${yearFolders.length + currentYear}`;
    const newYear = buildYearFolder(label, `Corso ${label}`);
    setYearFolders((prev) => [...prev, newYear]);
    setActiveYearId(newYear.id);
    setExpandedYearId(newYear.id);
    setActiveCourseId(newYear.courses[0]?.id ?? null);
    setRegistrySelectedYearId(newYear.id);
    setYearFormLabel('');
  }

  function handleYearRename(yearId, value) {
    updateYearFolder(yearId, () => ({ label: value }));
  }

  function handleYearRemove(event, yearId) {
    event.preventDefault();
    if (yearFolders.length === 1) {
      window.alert('Deve esistere almeno un anno di riferimento.');
      return;
    }
    const remaining = yearFolders.filter((year) => year.id !== yearId);
    setYearFolders(remaining);
    if (activeYearId === yearId) {
      const fallbackYear = remaining[0] ?? null;
      setActiveYearId(fallbackYear?.id ?? null);
      setActiveCourseId(fallbackYear?.courses[0]?.id ?? null);
    }
    if (expandedYearId === yearId) {
      setExpandedYearId(remaining[0]?.id ?? null);
    }
    if (registrySelectedYearId === yearId) {
      setRegistrySelectedYearId(remaining[0]?.id ?? null);
    }
  }

  function handleAddCourse(event) {
    event.preventDefault();
    if (!activeYear) {
      window.alert('Crea prima una cartella anno.');
      return;
    }
    const name = courseFormName.trim() || `Corso ${activeYear.courses.length + 1}`;
    const nextCourse = buildCourse(name);
    setYearFolders((prev) =>
      prev.map((year) =>
        year.id === activeYear.id ? { ...year, courses: [...year.courses, nextCourse] } : year,
      ),
    );
    setActiveCourseId(nextCourse.id);
    setCourseFormName('');
  }

  function handleCourseRename(courseId, value) {
    if (!activeYear) return;
    updateCourse(activeYear.id, courseId, () => ({ name: value }));
  }

  function handleCourseRemove(event, courseId) {
    event.preventDefault();
    if (!activeYear) return;
    const remaining = activeYear.courses.filter((course) => course.id !== courseId);
    if (!remaining.length) {
      window.alert('Ogni anno deve contenere almeno un corso.');
      return;
    }
    setYearFolders((prev) =>
      prev.map((year) =>
        year.id === activeYear.id ? { ...year, courses: remaining } : year,
      ),
    );
    if (activeCourseId === courseId) {
      setActiveCourseId(remaining[0].id);
    }
  }

  function handleCourseStatusToggle(courseId) {
    if (!activeYear) return;
    updateCourse(activeYear.id, courseId, (course) => {
      const nextClosed = !course.isClosed;
      return {
        isClosed: nextClosed,
        closedAt: nextClosed ? new Date().toISOString() : null,
      };
    });
  }

  function handleInstructorFormChange(field, value) {
    setInstructorForm((prev) => ({ ...prev, [field]: value }));
    setInstructorError('');
  }

  function handleAddInstructor(event) {
    event.preventDefault();
    setInstructorError('');
    if (!activeYear || !activeCourse) {
      setInstructorError('Seleziona un corso valido.');
      return;
    }
    if (activeCourse.isClosed) {
      setInstructorError('Questo corso è chiuso. Riaprilo per modificare il corpo istruttori.');
      return;
    }
    if (!instructorForm.memberId) {
      setInstructorError('Seleziona un socio dall\'elenco.');
      return;
    }
    if (instructors.some((item) => item.memberId === instructorForm.memberId)) {
      setInstructorError('Il socio è già presente nel corpo di questo corso.');
      return;
    }
    const member = membersMap.get(instructorForm.memberId);
    if (!member) {
      setInstructorError('Socio non trovato, aggiorna l\'elenco soci.');
      return;
    }
    const nextInstructor = {
      memberId: instructorForm.memberId,
      qualification: instructorForm.qualification,
      customQualification: instructorForm.customQualification.trim(),
    };
    updateCourse(activeYear.id, activeCourse.id, (course) => ({
      instructors: [...course.instructors, nextInstructor],
    }));
    setInstructorForm(emptyInstructorForm);
  }

  function handleInstructorUpdate(memberId, field, value) {
    if (!activeYear || !activeCourse || activeCourse.isClosed) return;
    updateCourse(activeYear.id, activeCourse.id, (course) => ({
      instructors: course.instructors.map((item) =>
        item.memberId === memberId ? { ...item, [field]: value } : item,
      ),
    }));
  }

  function handleInstructorRemove(memberId) {
    if (!activeYear || !activeCourse || activeCourse.isClosed) return;
    updateCourse(activeYear.id, activeCourse.id, (course) => ({
      instructors: course.instructors.filter((item) => item.memberId !== memberId),
    }));
  }

  function handleStudentFormChange(field, value) {
    setStudentForm((prev) => ({ ...prev, [field]: value }));
    setStudentError('');
  }

  function handleAddStudent(event) {
    event.preventDefault();
    setStudentError('');
    if (!activeYear || !activeCourse) {
      setStudentError('Seleziona un corso valido.');
      return;
    }
    if (activeCourse.isClosed) {
      setStudentError('Questo corso è chiuso. Riaprilo per aggiungere corsisti.');
      return;
    }
    if (!studentForm.firstName.trim() || !studentForm.lastName.trim()) {
      setStudentError('Nome e cognome sono obbligatori.');
      return;
    }
    const nextStudent = {
      id: generateId(),
      firstName: studentForm.firstName.trim(),
      lastName: studentForm.lastName.trim(),
      birthDate: studentForm.birthDate || '',
      paymentStatus: studentForm.paymentStatus,
      regulationRead: Boolean(studentForm.regulationRead),
      privacyAccepted: Boolean(studentForm.privacyAccepted),
      equipmentDelivery: studentForm.equipmentDelivery,
      equipmentReturn: studentForm.equipmentReturn,
      equipmentNotes: studentForm.equipmentNotes.trim(),
    };
    updateCourse(activeYear.id, activeCourse.id, (course) => ({
      students: [...course.students, nextStudent],
    }));
    setStudentForm(emptyStudentForm);
  }

  function handleStudentUpdate(id, field, value) {
    if (!activeYear || !activeCourse || activeCourse.isClosed) return;
    updateCourse(activeYear.id, activeCourse.id, (course) => ({
      students: course.students.map((student) =>
        student.id === id ? { ...student, [field]: value } : student,
      ),
    }));
  }

  function handleRemoveStudent(id) {
    if (!activeYear || !activeCourse || activeCourse.isClosed) return;
    updateCourse(activeYear.id, activeCourse.id, (course) => ({
      students: course.students.filter((student) => student.id !== id),
    }));
  }

  function handleRegistryFormChange(field, value) {
    setRegistryForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'qualificationDate' && !next.lastMaintenanceDate) {
        next.nextMaintenanceDate = addYears(value);
      }
      if (field === 'lastMaintenanceDate') {
        next.nextMaintenanceDate = addYears(value);
      }
      return next;
    });
    setRegistryError('');
  }

  function handleRegistryYearChange(value) {
    if (!value) {
      setRegistrySelectedYearId(null);
      return;
    }

    if (value.startsWith('virtual-')) {
      const yearNumber = Number(value.replace('virtual-', ''));
      const fallbackLabel = Number.isFinite(yearNumber) ? `Anno ${yearNumber}` : `Cartella ${new Date().getFullYear()}`;
      const createdYear = buildYearFolder(fallbackLabel, `Corso ${yearNumber || fallbackLabel}`);
      setYearFolders((prev) => [...prev, createdYear]);
      setActiveYearId(createdYear.id);
      setExpandedYearId(createdYear.id);
      setRegistrySelectedYearId(createdYear.id);
      return;
    }

    setRegistrySelectedYearId(value);
    setRegistryError('');
  }

  function handleAddRegistryEntry(event) {
    event.preventDefault();
    setRegistryError('');
    const form = registryForm;
    if (!registrySelectedYearId) {
      setRegistryError('Seleziona una cartella anno per il registro.');
      return;
    }
    if (!form.memberId) {
      setRegistryError('Seleziona un socio per il registro istruttori.');
      return;
    }
    const member = membersMap.get(form.memberId);
    if (!member) {
      setRegistryError('Socio non trovato, aggiorna l\'elenco soci.');
      return;
    }
    const nextEntry = {
      id: generateId(),
      yearId: registrySelectedYearId,
      memberId: form.memberId,
      qualificationType: form.qualificationType,
      customQualification: form.customQualification.trim(),
      qualificationDate: form.qualificationDate,
      lastMaintenanceDate: form.lastMaintenanceDate,
      activities: form.activities.trim(),
      nextMaintenanceDate: form.nextMaintenanceDate || addYears(form.lastMaintenanceDate || form.qualificationDate),
      documents: [],
    };
    setRegistry((prev) => [...prev, nextEntry]);
    setRegistryForm(emptyRegistryForm);
  }

  function handleRegistryUpdate(id, field, value) {
    setRegistry((prev) =>
      prev.map((entry) => {
        if (entry.id !== id) return entry;
        const next = { ...entry, [field]: value };
        if (!Array.isArray(next.documents)) next.documents = entry.documents ?? [];
        if (field === 'lastMaintenanceDate' || field === 'qualificationDate') {
          next.nextMaintenanceDate =
            field === 'lastMaintenanceDate'
              ? addYears(value)
              : addYears(entry.lastMaintenanceDate || value);
        }
        return next;
      }),
    );
  }

  function formatFileSize(bytes) {
    if (!Number.isFinite(bytes)) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error(`Impossibile leggere il file ${file.name}`));
      reader.readAsDataURL(file);
    });
  }

  async function handleRegistryDocumentsUpload(entryId, fileList) {
    const files = Array.from(fileList ?? []).filter(Boolean);
    if (!files.length) return;
    setRegistryUploadErrors((prev) => ({ ...prev, [entryId]: '' }));
    setRegistryUploadStatus((prev) => ({ ...prev, [entryId]: true }));
    try {
      const documents = await Promise.all(
        files.map(async (file) => ({
          id: generateId(),
          name: file.name,
          size: file.size,
          type: file.type,
          dataUrl: await readFileAsDataUrl(file),
          uploadedAt: new Date().toISOString(),
        })),
      );
      setRegistry((prev) =>
        prev.map((entry) => {
          if (entry.id !== entryId) return entry;
          return {
            ...entry,
            documents: [...(entry.documents ?? []), ...documents],
          };
        }),
      );
    } catch (uploadError) {
      console.error('[Scuola] Errore upload documenti registro:', uploadError);
      setRegistryUploadErrors((prev) => ({
        ...prev,
        [entryId]: uploadError.message ?? 'Impossibile caricare i documenti.',
      }));
    } finally {
      setRegistryUploadStatus((prev) => ({ ...prev, [entryId]: false }));
    }
  }

  function handleRegistryDocumentRemove(entryId, documentId) {
    setRegistry((prev) =>
      prev.map((entry) => {
        if (entry.id !== entryId) return entry;
        return {
          ...entry,
          documents: (entry.documents ?? []).filter((document) => document.id !== documentId),
        };
      }),
    );
  }

  function handleRegistryRemove(id) {
    setRegistry((prev) => prev.filter((entry) => entry.id !== id));
  }

  async function handleTeachingMaterialsUpload(fileList) {
    const files = Array.from(fileList ?? []).filter(Boolean);
    if (!files.length) return;
    setTeachingMaterialsError('');
    setTeachingMaterialsUploadStatus(true);
    try {
      const documents = await Promise.all(
        files.map(async (file) => ({
          id: generateId(),
          name: file.name,
          size: file.size,
          type: file.type,
          dataUrl: await readFileAsDataUrl(file),
          uploadedAt: new Date().toISOString(),
        })),
      );
      setTeachingMaterials((prev) => [...prev, ...documents]);
    } catch (uploadError) {
      console.error('[Scuola] Errore upload materiale didattico:', uploadError);
      setTeachingMaterialsError(uploadError.message ?? 'Impossibile caricare i file.');
    } finally {
      setTeachingMaterialsUploadStatus(false);
    }
  }

  function handleTeachingMaterialRemove(id) {
    setTeachingMaterials((prev) => prev.filter((doc) => doc.id !== id));
  }

  return (
    <section className="page-grid">
      <AlertList alerts={[...adminAlerts, ...userAlerts]} navigate={navigate} onDismiss={dismissAlert} />
      <header>
        <h1>Scuola e formazione</h1>
        <p>
          Organizza i corsi raggruppandoli per anno, tieni traccia dei corsisti e mantieni il registro delle
          qualifiche istruttori con scadenze quinquennali.
        </p>
        <small style={{ color: 'var(--color-muted)' }}>
          Le modifiche vengono salvate automaticamente e sono consultabili dalla pagina Report.
        </small>
      </header>

      <article className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h2 style={{ margin: 0 }}>Cartella corsi GSU</h2>
            <p style={{ marginTop: '0.25rem', color: 'var(--color-muted)' }}>
              Cartelle anno: {coursesSummary.years} · Corsi registrati: {coursesSummary.courses}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCoursesFolderExpanded((prev) => !prev)}
            style={{ background: coursesFolderExpanded ? '#adb5bd' : 'var(--color-primary)' }}
          >
            {coursesFolderExpanded ? 'Chiudi cartella' : 'Apri cartella'}
          </button>
        </div>
        {coursesFolderExpanded && (
          <>
            <h2>Cartelle anno</h2>
            <p style={{ marginTop: '0.25rem', color: 'var(--color-muted)' }}>
              Ogni anno contiene uno o più corsi. Espandi una cartella per vederne i corsi in dettaglio.
            </p>
            <form
              onSubmit={handleAddYear}
              style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '1rem' }}
            >
              <input
                placeholder="Es. Anno 2025"
                value={yearFormLabel}
                onChange={(event) => setYearFormLabel(event.target.value)}
                style={{ flex: '1 0 200px' }}
              />
              <button type="submit">Nuovo anno</button>
            </form>

            <div className="card-list" style={{ marginTop: '1.5rem' }}>
          {yearFolders.map((year) => (
            <article key={year.id} className="card" style={{ padding: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                <label style={{ flex: 1 }}>
                  Nome cartella
                  <input
                    value={year.label}
                    onChange={(event) => handleYearRename(year.id, event.target.value)}
                    style={{ marginTop: '0.35rem' }}
                  />
                </label>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    style={{ background: year.id === activeYearId ? 'var(--color-primary)' : undefined }}
                    onClick={() => {
                      setActiveYearId(year.id);
                      setExpandedYearId(year.id);
                      setActiveCourseId(year.courses[0]?.id ?? null);
                    }}
                  >
                    {year.id === activeYearId ? 'Anno attivo' : 'Apri anno'}
                  </button>
                  <button
                    type="button"
                    style={{ background: '#868e96' }}
                    onClick={() => setExpandedYearId((current) => (current === year.id ? null : year.id))}
                  >
                    {expandedYearId === year.id ? 'Nascondi corsi' : 'Mostra corsi'}
                  </button>
                  <button type="button" style={{ background: '#e03131' }} onClick={(event) => handleYearRemove(event, year.id)}>
                    Elimina
                  </button>
                </div>
              </div>
              <p style={{ margin: '0.5rem 0', color: 'var(--color-muted)' }}>
                Corsi in cartella: {year.courses.length}
              </p>
              {expandedYearId === year.id && (
                <div style={{ marginTop: '1rem', borderTop: '1px solid rgba(0,0,0,0.08)', paddingTop: '1rem' }}>
                  {year.courses.map((course) => {
                    const isCurrentCourse = year.id === activeYearId && course.id === activeCourseId;
                    return (
                      <div
                        key={course.id}
                        className="card"
                        style={{
                          padding: '0.75rem',
                          marginBottom: '0.75rem',
                          border: isCurrentCourse ? '2px solid var(--color-primary)' : '1px solid rgba(0,0,0,0.08)',
                        }}
                      >
                        <label style={{ display: 'block', fontWeight: 600 }}>
                          Nome corso
                          <input
                            value={course.name}
                            onChange={(event) => handleCourseRename(course.id, event.target.value)}
                            style={{ marginTop: '0.35rem' }}
                          />
                        </label>
                        <p style={{ margin: '0.25rem 0', color: course.isClosed ? '#c92a2a' : '#2f9e44' }}>
                          Stato: <strong>{course.isClosed ? 'Chiuso' : 'Aperto'}</strong>
                          {course.closedAt ? ` · chiuso il ${new Date(course.closedAt).toLocaleDateString('it-IT')}` : ''}
                        </p>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                        onClick={() => {
                            setActiveYearId(year.id);
                            setActiveCourseId(course.id);
                          }}
                            style={{ background: isCurrentCourse ? 'var(--color-primary)' : undefined }}
                          >
                            {isCurrentCourse ? 'Corso attivo' : 'Gestisci corso'}
                          </button>
                          <button
                            type="button"
                            style={{ background: course.isClosed ? '#1971c2' : '#2b8a3e' }}
                            onClick={() => {
                              setActiveYearId(year.id);
                              handleCourseStatusToggle(course.id);
                            }}
                          >
                            {course.isClosed ? 'Riapri corso' : 'Chiudi corso'}
                          </button>
                          <button
                            type="button"
                            style={{ background: '#e03131' }}
                            onClick={(event) => {
                              setActiveYearId(year.id);
                              handleCourseRemove(event, course.id);
                            }}
                          >
                            Elimina
                          </button>
                        </div>
                        {isCurrentCourse && (
                          <div style={{ marginTop: '1rem', display: 'grid', gap: '1rem' }}>
                            {renderCorpoIstruttoriSection()}
                            {renderCorsistiSection()}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <form onSubmit={handleAddCourse} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <input
                      placeholder="Nome nuovo corso"
                      value={courseFormName}
                      onChange={(event) => setCourseFormName(event.target.value)}
                      style={{ flex: '1 0 200px' }}
                    />
                    <button type="submit">Aggiungi corso</button>
                  </form>
                </div>
              )}
            </article>
          ))}
            </div>
          </>
        )}
      </article>
      <article className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h2 style={{ margin: 0 }}>Cartella Registro Corpo Istruttori GSU</h2>
            <p style={{ marginTop: '0.25rem', color: 'var(--color-muted)' }}>
              Archivio annuale delle qualifiche, dei mantenimenti e delle attività del corpo istruttori. Totale registrazioni:{' '}
              {registry.length}.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setRegistryFolderExpanded((prev) => !prev)}
            style={{ background: registryFolderExpanded ? '#adb5bd' : 'var(--color-primary)' }}
          >
            {registryFolderExpanded ? 'Chiudi cartella' : 'Apri cartella'}
          </button>
        </div>
        {registryFolderExpanded && (
          <>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0.75rem',
                alignItems: 'center',
                marginTop: '1rem',
                padding: '0.75rem',
                border: '1px solid rgba(0,0,0,0.08)',
                borderRadius: '0.75rem',
                background: '#f8f9fa',
              }}
            >
              <div style={{ flex: '2 0 220px' }}>
                <strong>Totale registrazioni: {registryStats.total}</strong>
                <p style={{ margin: '0.25rem 0', color: 'var(--color-muted)' }}>
                  IT: {registryStats.it} · AI: {registryStats.ai}
                </p>
              </div>
              <label style={{ flex: '1 0 200px' }}>
                Filtro qualifica
                <select value={registryFilter} onChange={(event) => setRegistryFilter(event.target.value)}>
                  <option value="all">Tutte le qualifiche</option>
                  {REGISTRY_QUALIFICATION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="card-list" style={{ marginTop: '1rem' }}>
              {filteredRegistryEntries.length ? (
                filteredRegistryEntries.map((entry) => {
                  const member = membersMap.get(entry.memberId);
                  const abbreviation = entry.qualificationType === 'aiuto_istruttore' ? 'AI' : 'IT';
                  const isExpanded = registryExpandedEntry === entry.id;
                  return (
                    <article key={entry.id} className="card" style={{ padding: '1rem' }}>
                      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <h4 style={{ margin: 0 }}>
                            {member?.full_name ?? 'Socio non trovato'} · {abbreviation}
                          </h4>
                          <p style={{ margin: 0, color: 'var(--color-muted)' }}>
                            Tessera: {member?.old_id ?? 'N/D'} · {member?.email ?? 'Email non disponibile'} · {entry.yearLabel}
                          </p>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            type="button"
                            style={{ background: isExpanded ? '#adb5bd' : 'var(--color-primary)' }}
                            onClick={() =>
                              setRegistryExpandedEntry((current) => (current === entry.id ? null : entry.id))
                            }
                          >
                            {isExpanded ? 'Nascondi dettagli' : 'Dettagli'}
                          </button>
                          <button type="button" style={{ background: '#e03131' }} onClick={() => handleRegistryRemove(entry.id)}>
                            Rimuovi
                          </button>
                        </div>
                      </header>
                      {isExpanded && (
                        <div style={{ display: 'grid', gap: '0.75rem', marginTop: '0.75rem' }}>
                          <label>
                            Qualifica
                            <select
                              value={entry.qualificationType}
                              onChange={(event) => handleRegistryUpdate(entry.id, 'qualificationType', event.target.value)}
                            >
                              {REGISTRY_QUALIFICATION_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Altre qualifiche
                            <input
                              value={entry.customQualification}
                              onChange={(event) => handleRegistryUpdate(entry.id, 'customQualification', event.target.value)}
                            />
                          </label>
                          <label>
                            Data conseguimento
                            <input
                              type="date"
                              value={entry.qualificationDate}
                              onChange={(event) => handleRegistryUpdate(entry.id, 'qualificationDate', event.target.value)}
                            />
                          </label>
                          <label>
                            Ultimo mantenimento
                            <input
                              type="date"
                              value={entry.lastMaintenanceDate}
                              onChange={(event) => handleRegistryUpdate(entry.id, 'lastMaintenanceDate', event.target.value)}
                            />
                          </label>
                          <label>
                            Attività negli ultimi 5 anni
                            <textarea
                              rows={2}
                              value={entry.activities}
                              onChange={(event) => handleRegistryUpdate(entry.id, 'activities', event.target.value)}
                            />
                          </label>
                          <label>
                            Prossimo mantenimento
                            <input
                              type="date"
                              value={entry.nextMaintenanceDate}
                              onChange={(event) => handleRegistryUpdate(entry.id, 'nextMaintenanceDate', event.target.value)}
                            />
                          </label>
                          <div
                            onDragOver={(event) => {
                              event.preventDefault();
                              setRegistryDragEntry(entry.id);
                            }}
                            onDragLeave={(event) => {
                              event.preventDefault();
                              setRegistryDragEntry((current) => (current === entry.id ? null : current));
                            }}
                            onDrop={(event) => {
                              event.preventDefault();
                              setRegistryDragEntry(null);
                              handleRegistryDocumentsUpload(entry.id, event.dataTransfer.files);
                            }}
                            style={{
                              border:
                                registryDragEntry === entry.id
                                  ? '2px dashed var(--color-primary)'
                                  : '1px dashed rgba(0,0,0,0.2)',
                              borderRadius: '0.75rem',
                              padding: '0.75rem',
                              background: '#fff',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '0.5rem',
                            }}
                          >
                            <div>
                              <label htmlFor={`registryDocs-${entry.id}`} style={{ fontWeight: 600 }}>
                                CV e attestati
                              </label>
                              <p style={{ margin: '0.15rem 0', color: 'var(--color-muted)' }}>
                                Trascina i file qui oppure utilizza il pulsante di upload.
                              </p>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                              <input
                                id={`registryDocs-${entry.id}`}
                                type="file"
                                multiple
                                onChange={(event) => {
                                  handleRegistryDocumentsUpload(entry.id, event.target.files);
                                  event.target.value = '';
                                }}
                                disabled={Boolean(registryUploadStatus[entry.id])}
                              />
                              {registryUploadStatus[entry.id] && <span>Caricamento...</span>}
                            </div>
                            {registryUploadErrors[entry.id] && (
                              <p style={{ color: 'var(--color-accent)' }}>{registryUploadErrors[entry.id]}</p>
                            )}
                            {(entry.documents ?? []).length ? (
                              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.5rem' }}>
                                {entry.documents.map((document) => {
                                  const uploadedDate = document.uploadedAt ? new Date(document.uploadedAt) : null;
                                  const uploadedLabel =
                                    uploadedDate && !Number.isNaN(uploadedDate.getTime())
                                      ? uploadedDate.toLocaleDateString('it-IT')
                                      : 'Data non disponibile';
                                  return (
                                    <li
                                      key={document.id}
                                      style={{
                                        display: 'flex',
                                        flexWrap: 'wrap',
                                        justifyContent: 'space-between',
                                        gap: '0.5rem',
                                        padding: '0.5rem',
                                        border: '1px solid rgba(0,0,0,0.08)',
                                        borderRadius: '0.5rem',
                                        background: '#f8f9fa',
                                      }}
                                    >
                                      <div>
                                        <strong>{document.name}</strong>
                                        <p style={{ margin: 0, color: 'var(--color-muted)', fontSize: '0.85rem' }}>
                                          {formatFileSize(document.size)} · {uploadedLabel}
                                        </p>
                                      </div>
                                      <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                                        <a href={document.dataUrl} download={document.name}>
                                          Scarica
                                        </a>
                                        <button
                                          type="button"
                                          style={{ background: '#e03131' }}
                                          onClick={() => handleRegistryDocumentRemove(entry.id, document.id)}
                                        >
                                          Rimuovi
                                        </button>
                                      </div>
                                    </li>
                                  );
                                })}
                              </ul>
                            ) : (
                              <p style={{ margin: 0, color: 'var(--color-muted)' }}>Nessun documento caricato.</p>
                            )}
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })
              ) : (
                <p style={{ color: 'var(--color-muted)' }}>
                  Nessun istruttore con la qualifica selezionata. Modifica il filtro per visualizzare altre registrazioni.
                </p>
              )}
            </div>

        <form
          onSubmit={handleAddRegistryEntry}
          style={{
            display: 'grid',
            gap: '0.75rem',
            marginTop: '1.5rem',
            borderTop: '1px solid rgba(0,0,0,0.08)',
            paddingTop: '1.5rem',
          }}
        >
          <label>
            Cartella anno
            <select
              value={registrySelectedYearId ?? ''}
              onChange={(event) => handleRegistryYearChange(event.target.value || null)}
            >
              <option value="">--</option>
              {registryYearOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Seleziona istruttore
            <select
              value={registryForm.memberId}
              onChange={(event) => handleRegistryFormChange('memberId', event.target.value)}
              disabled={membersLoading}
            >
              <option value="">--</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.full_name} {member.old_id ? `(Tessera ${member.old_id})` : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            Qualifica nel registro
            <select
              value={registryForm.qualificationType}
              onChange={(event) => handleRegistryFormChange('qualificationType', event.target.value)}
            >
              {REGISTRY_QUALIFICATION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Altre qualifiche
            <input
              placeholder="Es. referente sicurezza, formatore interno..."
              value={registryForm.customQualification}
              onChange={(event) => handleRegistryFormChange('customQualification', event.target.value)}
            />
          </label>
          <label>
            Data conseguimento qualifica
            <input
              type="date"
              value={registryForm.qualificationDate}
              onChange={(event) => handleRegistryFormChange('qualificationDate', event.target.value)}
            />
          </label>
          <label>
            Ultimo mantenimento
            <input
              type="date"
              value={registryForm.lastMaintenanceDate}
              onChange={(event) => handleRegistryFormChange('lastMaintenanceDate', event.target.value)}
            />
          </label>
          <label>
            Attività negli ultimi 5 anni
            <textarea
              rows={2}
              placeholder="Corsi seguiti, esercitazioni, stage..."
              value={registryForm.activities}
              onChange={(event) => handleRegistryFormChange('activities', event.target.value)}
            />
          </label>
          <label>
            Prossimo mantenimento
            <input
              type="date"
              value={registryForm.nextMaintenanceDate}
              onChange={(event) => handleRegistryFormChange('nextMaintenanceDate', event.target.value)}
            />
          </label>
          <button type="submit" disabled={membersLoading || !registrySelectedYearId}>
            Aggiungi al registro
          </button>
          {registryError && <p style={{ color: 'var(--color-accent)' }}>{registryError}</p>}
        </form>
      </>
    )}
  </article>
      <article className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h2 style={{ margin: 0 }}>Cartella materiale didattico</h2>
            <p style={{ marginTop: '0.25rem', color: 'var(--color-muted)' }}>
              File caricati: {teachingMaterials.length}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setMaterialsFolderExpanded((prev) => !prev)}
            style={{ background: materialsFolderExpanded ? '#adb5bd' : 'var(--color-primary)' }}
          >
            {materialsFolderExpanded ? 'Chiudi cartella' : 'Apri cartella'}
          </button>
        </div>
        {materialsFolderExpanded && (
          <div style={{ marginTop: '1rem', display: 'grid', gap: '0.75rem' }}>
            <p style={{ color: 'var(--color-muted)', margin: 0 }}>
              Usa l&apos;area seguente per caricare dispense, modulistica e altri documenti utili agli istruttori e ai corsisti.
            </p>
            <div
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                handleTeachingMaterialsUpload(event.dataTransfer.files);
              }}
              style={{
                border: '1px dashed rgba(0,0,0,0.2)',
                borderRadius: '0.75rem',
                padding: '0.75rem',
                background: '#fff',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
              }}
            >
              <div>
                <label htmlFor="teachingMaterialsUpload" style={{ fontWeight: 600 }}>
                  Carica file
                </label>
                <p style={{ margin: '0.15rem 0', color: 'var(--color-muted)' }}>
                  Trascina i file qui oppure utilizza il pulsante Sfoglia.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  id="teachingMaterialsUpload"
                  type="file"
                  multiple
                  onChange={(event) => {
                    handleTeachingMaterialsUpload(event.target.files);
                    event.target.value = '';
                  }}
                  disabled={teachingMaterialsUploadStatus}
                />
                {teachingMaterialsUploadStatus && <span>Caricamento...</span>}
              </div>
              {teachingMaterialsError && <p style={{ color: 'var(--color-accent)' }}>{teachingMaterialsError}</p>}
            </div>
            {teachingMaterials.length ? (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.5rem' }}>
                {teachingMaterials.map((doc) => (
                  <li
                    key={doc.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '0.5rem',
                      border: '1px solid rgba(0,0,0,0.08)',
                      borderRadius: '0.5rem',
                      padding: '0.5rem',
                      background: '#f8f9fa',
                    }}
                  >
                    <div>
                      <strong>{doc.name}</strong>
                      <p style={{ margin: 0, color: 'var(--color-muted)', fontSize: '0.85rem' }}>
                        {formatFileSize(doc.size)} ·{' '}
                        {doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString('it-IT') : 'Data non disponibile'}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                      <a href={doc.dataUrl} download={doc.name}>
                        Scarica
                      </a>
                      <button type="button" style={{ background: '#e03131' }} onClick={() => handleTeachingMaterialRemove(doc.id)}>
                        Rimuovi
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ margin: 0, color: 'var(--color-muted)' }}>Nessun materiale caricato.</p>
            )}
          </div>
        )}
      </article>
</section>
  );
}
