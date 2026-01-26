import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useAuth from '../context/useAuth.js';
import { bulkCreateMembers, createMember, deleteMember, getMembers, updateMember } from '../services/members';
import usePermissions from '../hooks/usePermissions.js';
import { safeLogActivity } from '../services/activityLogs.js';
import {
  createMemberPurchase,
  deleteMemberPurchase,
  getMemberPurchases,
  updateMemberPurchase,
} from '../services/memberPurchases';
import { supabase } from '../lib/supabaseClient';
import { getAllRoles } from '../utils/permissions.js';

const YEAR_START = 2025;
const YEAR_END = 2050;
const currentYear = new Date().getFullYear();
const DEFAULT_YEAR = Math.max(YEAR_START, Math.min(currentYear, YEAR_END));

const emptyMember = {
  membership_number: '',
  full_name: '',
  email: '',
  phone: '',
  membership_paid: false,
  membership_year: DEFAULT_YEAR,
};
const DEFAULT_YEAR_STRING = String(DEFAULT_YEAR);
const PURCHASE_TYPES = [
  { value: 'maglietta', label: 'Maglietta' },
  { value: 'felpa', label: 'Felpa' },
  { value: 'gadget', label: 'Gadget' },
];
const PURCHASE_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const PAYMENT_STATUS = [
  { value: 'unpaid', label: 'Da saldare' },
  { value: 'paid', label: 'Pagato' },
];
const ORDER_STATUS = [
  { value: 'ordered', label: 'Ordinato' },
  { value: 'delivered', label: 'Consegnato' },
  { value: 'cancelled', label: 'Annullato' },
];

export default function Members() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [membersTab, setMembersTab] = useState('anagrafica');
  const [purchaseTypeFilter, setPurchaseTypeFilter] = useState('all');
  const [purchaseSizeFilter, setPurchaseSizeFilter] = useState('all');
  const [purchaseStatusFilter, setPurchaseStatusFilter] = useState('all');
  const [purchaseOrderFilter, setPurchaseOrderFilter] = useState('all');
  const [purchaseYearFilter, setPurchaseYearFilter] = useState(DEFAULT_YEAR_STRING);
  const [purchases, setPurchases] = useState([]);
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const [purchaseError, setPurchaseError] = useState('');
  const [purchaseSubmitting, setPurchaseSubmitting] = useState(false);
  const [purchaseEditingId, setPurchaseEditingId] = useState(null);
  const [purchaseForm, setPurchaseForm] = useState({
    member_id: '',
    item_type: PURCHASE_TYPES[0].value,
    size: PURCHASE_SIZES[2],
    quantity: 1,
    price: '',
    payment_status: PAYMENT_STATUS[0].value,
    status: ORDER_STATUS[0].value,
    purchase_year: DEFAULT_YEAR_STRING,
    notes: '',
  });
  const [form, setForm] = useState(emptyMember);
  const [editingId, setEditingId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [togglingId, setTogglingId] = useState(null);
  const [supportsEmail, setSupportsEmail] = useState(true);
  const [supportsPhone, setSupportsPhone] = useState(true);
  const [supportsYear, setSupportsYear] = useState(false);
  const [yearColumn, setYearColumn] = useState('membership_year');
  const [yearFilter, setYearFilter] = useState(DEFAULT_YEAR_STRING);
  const formRef = useRef(null);
  const duplicatedYearsRef = useRef(new Set());
  const [cloningYear, setCloningYear] = useState(null);
  const { user, role } = useAuth();
  const { canEditSection } = usePermissions();
  const canEditMembers = canEditSection('soci');
  const canManageRoles = role === 'admin' || role === 'presidente';
  const [profilesByEmail, setProfilesByEmail] = useState(new Map());
  const [rolesLoading, setRolesLoading] = useState(false);
  const [rolesError, setRolesError] = useState('');
  const [roleUpdating, setRoleUpdating] = useState({});
  const rolesList = useMemo(() => getAllRoles(), []);

  const yearOptions = useMemo(() => {
    const maxYear = Math.max(YEAR_END, currentYear + 5);
    return Array.from({ length: maxYear - YEAR_START + 1 }, (_item, index) => YEAR_START + index);
  }, []);

  const loadMembers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getMembers();
      setMembers(data);
      setSupportsEmail(data.some((item) => Object.prototype.hasOwnProperty.call(item, 'email')));
      setSupportsPhone(data.some((item) => Object.prototype.hasOwnProperty.call(item, 'phone')));
      const first = data[0];
      if (first) {
        if (Object.prototype.hasOwnProperty.call(first, 'membership_year')) {
          setYearColumn('membership_year');
          setSupportsYear(true);
        } else if (Object.prototype.hasOwnProperty.call(first, 'year')) {
          setYearColumn('year');
          setSupportsYear(true);
        } else if (Object.prototype.hasOwnProperty.call(first, 'anno')) {
          setYearColumn('anno');
          setSupportsYear(true);
        } else {
          setSupportsYear(false);
        }
      }
    } catch (loadError) {
      setError(loadError.message ?? 'Impossibile caricare i soci.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPurchases = useCallback(async () => {
    setPurchaseLoading(true);
    setPurchaseError('');
    try {
      const data = await getMemberPurchases();
      setPurchases(data);
    } catch (loadError) {
      setPurchaseError(loadError.message ?? 'Impossibile caricare gli acquisti.');
    } finally {
      setPurchaseLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  useEffect(() => {
    if (membersTab !== 'acquisti') return;
    loadPurchases();
  }, [membersTab, loadPurchases]);

  useEffect(() => {
    if (!canManageRoles || !supportsEmail) return;
    let ignore = false;
    async function loadProfiles() {
      setRolesLoading(true);
      setRolesError('');
      try {
        const { data, error: profilesError } = await supabase
          .from('profiles')
          .select('id,email,role');
        if (profilesError) throw profilesError;
        if (!ignore) {
          const map = new Map();
          (data ?? []).forEach((row) => {
            if (row?.email) {
              map.set(row.email.toLowerCase(), row);
            }
          });
          setProfilesByEmail(map);
        }
      } catch (profilesLoadError) {
        if (!ignore) {
          setRolesError(profilesLoadError.message ?? 'Impossibile caricare i ruoli.');
        }
      } finally {
        if (!ignore) {
          setRolesLoading(false);
        }
      }
    }
    loadProfiles();
    return () => {
      ignore = true;
    };
  }, [canManageRoles, supportsEmail]);

  useEffect(() => {
    if (showForm && formRef.current) {
      formRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [showForm]);

  useEffect(() => {
    if (!canEditMembers && showForm) {
      setShowForm(false);
    }
  }, [canEditMembers, showForm]);

  useEffect(() => {
    if (editingId) return;
    if (yearFilter === 'all' || yearFilter === 'unknown') return;
    setForm((prev) => ({
      ...prev,
      membership_year: Number(yearFilter) || DEFAULT_YEAR,
    }));
  }, [yearFilter, editingId]);

  const availableYears = useMemo(() => {
    const set = new Set();
    members.forEach((member) => {
      const parsed = Number(member.membership_year);
      if (Number.isFinite(parsed)) {
        set.add(parsed);
      }
    });
    if (set.size === 0) {
      set.add(DEFAULT_YEAR);
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [members]);

  const duplicateYear = useCallback(
    async (targetYear) => {
      if (!supportsYear || !canEditMembers) return;
      if (!Number.isFinite(targetYear)) return;
      const baseYear =
        availableYears
          .slice()
          .reverse()
          .find((year) => year < targetYear) ?? availableYears[availableYears.length - 1] ?? DEFAULT_YEAR;
      const templateMembers = members.filter((member) => Number(member.membership_year) === baseYear);
      if (!templateMembers.length) {
        setError('Nessun socio disponibile da usare per il nuovo anno.');
        return;
      }
      setCloningYear(targetYear);
      setError('');
      try {
        const payloads = templateMembers.map((member) => {
          const membershipNumber = member.membership_number ?? member.old_id ?? null;
          const payload = {
            full_name: member.full_name,
            old_id: member.old_id ?? membershipNumber,
            membership_number: membershipNumber,
            membership_paid: false,
          };
          if (supportsEmail) payload.email = member.email ?? null;
          if (supportsPhone) payload.phone = member.phone ?? null;
          if (yearColumn) {
            payload[yearColumn] = targetYear;
          }
          if (yearColumn !== 'membership_year') {
            payload.membership_year = targetYear;
          }
          return payload;
        });
        await bulkCreateMembers(payloads);
        safeLogActivity(
          {
            action: 'duplicate_members_year',
            entity: 'members',
            details: { targetYear, records: payloads.length },
          },
          user,
        );
        await loadMembers();
      } catch (dupError) {
        setError(dupError.message ?? 'Impossibile popolare il nuovo anno.');
        duplicatedYearsRef.current.delete(targetYear);
      } finally {
        setCloningYear(null);
      }
    },
    [supportsYear, canEditMembers, members, availableYears, supportsEmail, supportsPhone, yearColumn, loadMembers],
  );

  const filteredMembers = useMemo(() => {
    const term = search.toLowerCase();
    return members.filter((member) => {
      const matchesText =
        !term ||
        member.full_name?.toLowerCase().includes(term) ||
        String(member.old_id ?? '').includes(term) ||
        member.email?.toLowerCase().includes(term);
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'paid' ? member.membership_paid : !member.membership_paid);
      const memberYear = Number(member.membership_year);
      const matchesYear =
        yearFilter === 'all' ||
        (Number.isFinite(memberYear) ? String(memberYear) === yearFilter : yearFilter === 'unknown');
      return matchesText && matchesStatus && matchesYear;
    });
  }, [members, search, statusFilter, yearFilter]);

  const membersById = useMemo(
    () => new Map(members.map((member) => [String(member.id), member])),
    [members],
  );

  const filteredPurchases = useMemo(() => {
    return purchases.filter((purchase) => {
      const matchesType = purchaseTypeFilter === 'all' || purchase.item_type === purchaseTypeFilter;
      const matchesSize =
        purchaseSizeFilter === 'all' ||
        String(purchase.size ?? '').toLowerCase() === purchaseSizeFilter.toLowerCase();
      const matchesPayment = purchaseStatusFilter === 'all' || purchase.payment_status === purchaseStatusFilter;
      const matchesOrder = purchaseOrderFilter === 'all' || purchase.status === purchaseOrderFilter;
      const matchesYear =
        purchaseYearFilter === 'all' || String(purchase.purchase_year ?? '') === String(purchaseYearFilter);
      return matchesType && matchesSize && matchesPayment && matchesOrder && matchesYear;
    });
  }, [
    purchases,
    purchaseTypeFilter,
    purchaseSizeFilter,
    purchaseStatusFilter,
    purchaseOrderFilter,
    purchaseYearFilter,
  ]);

  const selectedYearNumber = Number(yearFilter);
  const hasSelectedYearData = useMemo(
    () => Number.isFinite(selectedYearNumber) && members.some((member) => Number(member.membership_year) === selectedYearNumber),
    [members, selectedYearNumber],
  );

  const summaryByYear = useMemo(() => {
    const map = new Map();
    yearOptions.forEach((year) => map.set(String(year), { year: String(year), total: 0, paid: 0, unpaid: 0 }));
    map.set('unknown', { year: 'N/D', total: 0, paid: 0, unpaid: 0 });
    members.forEach((member) => {
      const parsedYear = Number(member.membership_year);
      const key = Number.isFinite(parsedYear) ? String(parsedYear) : 'unknown';
      if (!map.has(key)) {
        map.set(key, { year: Number.isFinite(parsedYear) ? String(parsedYear) : 'N/D', total: 0, paid: 0, unpaid: 0 });
      }
      const entry = map.get(key);
      entry.total += 1;
      if (member.membership_paid) entry.paid += 1;
      else entry.unpaid += 1;
    });
    return Array.from(map.values()).sort((a, b) => {
      const yearA = Number(a.year);
      const yearB = Number(b.year);
      if (Number.isNaN(yearA) && Number.isNaN(yearB)) return 0;
      if (Number.isNaN(yearA)) return 1;
      if (Number.isNaN(yearB)) return -1;
      return yearB - yearA;
    });
  }, [members, yearOptions]);

  const activeSummaryYear = useMemo(() => {
    if (yearFilter === 'all' || yearFilter === 'unknown') {
      return String(Math.min(Math.max(currentYear, YEAR_START), YEAR_END));
    }
    return yearFilter;
  }, [yearFilter]);

  const activeSummary = useMemo(() => {
    const fallback = { year: activeSummaryYear, total: 0, paid: 0, unpaid: 0 };
    return summaryByYear.find((item) => item.year === activeSummaryYear) ?? fallback;
  }, [summaryByYear, activeSummaryYear]);

  function handleChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handlePurchaseChange(field, value) {
    setPurchaseForm((prev) => ({ ...prev, [field]: value }));
  }

  function resetPurchaseForm() {
    setPurchaseEditingId(null);
    setPurchaseForm({
      member_id: '',
      item_type: PURCHASE_TYPES[0].value,
      size: PURCHASE_SIZES[2],
      quantity: 1,
      price: '',
      payment_status: PAYMENT_STATUS[0].value,
      status: ORDER_STATUS[0].value,
      purchase_year: DEFAULT_YEAR_STRING,
      notes: '',
    });
  }

  function formatPurchasePrice(value) {
    if (value === null || value === undefined || value === '') return 'N/D';
    const numeric = Number(value);
    if (Number.isNaN(numeric)) return String(value);
    return `${numeric.toFixed(2)} €`;
  }

  function handleEdit(member) {
    setEditingId(member.id);
    setForm({
      membership_number: member.old_id ?? '',
      full_name: member.full_name ?? '',
      email: supportsEmail ? member.email ?? '' : '',
      phone: supportsPhone ? member.phone ?? '' : '',
      membership_paid: Boolean(member.membership_paid),
      membership_year: Number(member.membership_year) || DEFAULT_YEAR,
    });
    setShowForm(true);
  }

  function handlePurchaseEdit(purchase) {
    setPurchaseEditingId(purchase.id);
    setPurchaseForm({
      member_id: purchase.member_id ?? '',
      item_type: purchase.item_type ?? PURCHASE_TYPES[0].value,
      size: purchase.size ?? PURCHASE_SIZES[2],
      quantity: Number(purchase.quantity ?? 1),
      price: purchase.price ?? '',
      payment_status: purchase.payment_status ?? PAYMENT_STATUS[0].value,
      status: purchase.status ?? ORDER_STATUS[0].value,
      purchase_year: String(purchase.purchase_year ?? DEFAULT_YEAR_STRING),
      notes: purchase.notes ?? '',
    });
  }

  function resetForm(yearValue = yearFilter) {
    setEditingId(null);
    setForm({
      membership_number: '',
      full_name: '',
      email: '',
      phone: '',
      membership_paid: false,
      membership_year: Number(yearValue) || DEFAULT_YEAR,
    });
  }

  async function handlePurchaseSubmit(event) {
    event.preventDefault();
    if (!purchaseForm.member_id) {
      setPurchaseError('Seleziona un socio prima di salvare.');
      return;
    }
    setPurchaseSubmitting(true);
    setPurchaseError('');
    const priceValue = Number(purchaseForm.price);
    const payload = {
      member_id: purchaseForm.member_id,
      item_type: purchaseForm.item_type,
      size: purchaseForm.size || null,
      quantity: Number(purchaseForm.quantity) || 1,
      price: Number.isNaN(priceValue) ? null : priceValue,
      payment_status: purchaseForm.payment_status,
      status: purchaseForm.status,
      purchase_year: Number(purchaseForm.purchase_year) || DEFAULT_YEAR,
      notes: purchaseForm.notes?.trim() || null,
    };
    try {
      let savedPurchase;
      if (purchaseEditingId) {
        savedPurchase = await updateMemberPurchase(purchaseEditingId, payload);
        safeLogActivity(
          {
            action: 'update_member_purchase',
            entity: 'member_purchases',
            entityId: savedPurchase.id,
            details: { item_type: savedPurchase.item_type, member_id: savedPurchase.member_id },
          },
          user,
        );
      } else {
        savedPurchase = await createMemberPurchase(payload);
        safeLogActivity(
          {
            action: 'create_member_purchase',
            entity: 'member_purchases',
            entityId: savedPurchase.id,
            details: { item_type: savedPurchase.item_type, member_id: savedPurchase.member_id },
          },
          user,
        );
      }
      resetPurchaseForm();
      loadPurchases();
    } catch (submitError) {
      setPurchaseError(submitError.message ?? 'Impossibile salvare l&apos;acquisto.');
    } finally {
      setPurchaseSubmitting(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    const membershipValue = form.membership_number ? Number(form.membership_number) : null;
    const normalizedYear = Number(form.membership_year) || DEFAULT_YEAR;
    const payload = {
      full_name: form.full_name.trim(),
      email: supportsEmail ? form.email.trim() || null : undefined,
      phone: supportsPhone ? form.phone.trim() || null : undefined,
      membership_paid: Boolean(form.membership_paid),
      old_id: membershipValue,
    };
    if (supportsYear && yearColumn) {
      payload[yearColumn] = normalizedYear;
    }
    if (!supportsEmail) delete payload.email;
    if (!supportsPhone) delete payload.phone;
    try {
      let savedMember;
      if (editingId) {
        savedMember = await updateMember(editingId, payload);
        safeLogActivity(
          {
            action: 'update_member',
            entity: 'members',
            entityId: savedMember.id,
            details: { name: savedMember.full_name, year: normalizedYear },
          },
          user,
        );
      } else {
        savedMember = await createMember(payload);
        safeLogActivity(
          {
            action: 'create_member',
            entity: 'members',
            entityId: savedMember.id,
            details: { name: savedMember.full_name, year: normalizedYear },
          },
          user,
        );
      }
      resetForm();
      setShowForm(false);
      loadMembers();
    } catch (submitError) {
      setError(submitError.message ?? 'Errore durante il salvataggio del socio.');
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleMembershipPayment(member) {
    setTogglingId(member.id);
    setError('');
    try {
      const nextStatus = !member.membership_paid;
      await updateMember(member.id, { membership_paid: nextStatus });
      safeLogActivity(
        {
          action: 'toggle_membership_payment',
          entity: 'members',
          entityId: member.id,
          details: { status: nextStatus },
        },
        user,
      );
      await loadMembers();
    } catch (toggleError) {
      setError(toggleError.message ?? 'Impossibile aggiornare lo stato della tessera.');
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Vuoi eliminare questo socio?')) return;
    setError('');
    try {
      await deleteMember(id);
      safeLogActivity(
        {
          action: 'delete_member',
          entity: 'members',
          entityId: id,
        },
        user,
      );
      loadMembers();
    } catch (deleteError) {
      setError(deleteError.message ?? 'Impossibile eliminare il socio.');
    }
  }

  async function handlePurchaseDelete(id) {
    if (!window.confirm('Vuoi eliminare questo acquisto?')) return;
    setPurchaseError('');
    try {
      await deleteMemberPurchase(id);
      safeLogActivity(
        {
          action: 'delete_member_purchase',
          entity: 'member_purchases',
          entityId: id,
        },
        user,
      );
      loadPurchases();
    } catch (deleteError) {
      setPurchaseError(deleteError.message ?? 'Impossibile eliminare l&apos;acquisto.');
    }
  }

  async function togglePurchasePayment(purchase) {
    setPurchaseError('');
    const nextStatus = purchase.payment_status === 'paid' ? 'unpaid' : 'paid';
    try {
      await updateMemberPurchase(purchase.id, { payment_status: nextStatus });
      safeLogActivity(
        {
          action: 'toggle_member_purchase_payment',
          entity: 'member_purchases',
          entityId: purchase.id,
          details: { payment_status: nextStatus },
        },
        user,
      );
      loadPurchases();
    } catch (toggleError) {
      setPurchaseError(toggleError.message ?? 'Impossibile aggiornare il pagamento.');
    }
  }

  async function handleRoleChange(memberEmail, nextRole) {
    if (!memberEmail) return;
    setRolesError('');
    setRoleUpdating((prev) => ({ ...prev, [memberEmail]: true }));
    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ role: nextRole })
        .eq('email', memberEmail);
      if (updateError) throw updateError;
      setProfilesByEmail((prev) => {
        const next = new Map(prev);
        const key = memberEmail.toLowerCase();
        const existing = next.get(key) ?? { email: memberEmail };
        next.set(key, { ...existing, role: nextRole });
        return next;
      });
    } catch (roleError) {
      setRolesError(roleError.message ?? 'Impossibile aggiornare il ruolo.');
    } finally {
      setRoleUpdating((prev) => ({ ...prev, [memberEmail]: false }));
    }
  }

  useEffect(() => {
    if (!supportsYear || !canEditMembers) return;
    if (yearFilter === 'all' || yearFilter === 'unknown') return;
    if (!Number.isFinite(selectedYearNumber)) return;
    if (selectedYearNumber < YEAR_START) return;
    if (hasSelectedYearData) return;
    if (duplicatedYearsRef.current.has(selectedYearNumber)) return;
    duplicatedYearsRef.current.add(selectedYearNumber);
    duplicateYear(selectedYearNumber);
  }, [yearFilter, supportsYear, canEditMembers, selectedYearNumber, hasSelectedYearData, duplicateYear]);

  return (
    <section className="page-grid">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1>Gestione soci</h1>
          <p>Anagrafica aggiornata importata dalla versione precedente.</p>
        </div>
        {membersTab === 'anagrafica' && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', minWidth: '220px' }}>
            Cerca socio
            <input
              type="search"
              placeholder="Nome, tessera o email"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              style={{ maxWidth: '320px' }}
            />
          </label>
        )}
      </div>

      <div className="pill-group">
        {[
          { value: 'anagrafica', label: 'Elenco soci' },
          { value: 'acquisti', label: 'Acquisti & gadget' },
        ].map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setMembersTab(item.value)}
            className={`pill-button ${membersTab === item.value ? 'pill-button--active' : ''}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error && (
        <article
          className="card"
          style={{
            background: '#fff5f5',
            borderColor: '#ff8787',
            color: '#c92a2a',
            marginBottom: '1rem',
          }}
        >
          {error}
        </article>
      )}
      {rolesError && (
        <article
          className="card"
          style={{
            background: '#fff5f5',
            borderColor: '#ff8787',
            color: '#c92a2a',
            marginBottom: '1rem',
          }}
        >
          {rolesError}
        </article>
      )}

      {membersTab === 'anagrafica' ? (
        <>
          <div
            className="card"
            style={{
              padding: '0.75rem 1rem',
              marginBottom: '1rem',
              background: '#f8f9fa',
              borderRadius: '0.75rem',
              border: '1px solid rgba(0,0,0,0.08)',
            }}
          >
            <strong>Anno {activeSummary.year}</strong>
            <p style={{ margin: '0.25rem 0', color: 'var(--color-muted)' }}>
              Totale soci: {activeSummary.total} · Quota pagata: {activeSummary.paid} · Da saldare: {activeSummary.unpaid}
            </p>
            <small style={{ color: 'var(--color-muted)' }}>
              Il riepilogo segue automaticamente l&apos;anno selezionato o quello corrente del dispositivo.
            </small>
          </div>

          {!canEditMembers && (
            <p className="card" style={{ background: '#fff5f5', borderColor: '#ffc9c9', color: '#c92a2a' }}>
              Non hai i permessi per modificare l&apos;anagrafica. Puoi solo consultare i dati.
            </p>
          )}

          <div
            className="card"
            style={{
              marginBottom: '1rem',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '1rem',
              alignItems: 'center',
            }}
          >
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: '220px', flex: '1 1 220px' }}>
              Cartella anno
              <select value={yearFilter} onChange={(event) => setYearFilter(event.target.value)}>
                <option value="all">Tutti gli anni</option>
                {yearOptions.map((yearOption) => (
                  <option key={yearOption} value={String(yearOption)}>
                    {yearOption}
                  </option>
                ))}
                <option value="unknown">N/D</option>
              </select>
            </label>
            <p style={{ flex: '2 1 320px', margin: 0, color: 'var(--color-muted)' }}>
              Seleziona l&apos;anno per consultare l&apos;elenco soci dedicato e preparare le cartelle future (2025-2050). I nuovi soci ereditano automaticamente
              l&apos;anno attivo.
            </p>
            {cloningYear && (
              <p style={{ flexBasis: '100%', margin: 0, color: '#1971c2' }}>
                Sto popolando l&apos;anno {cloningYear} con l&apos;elenco attuale...
              </p>
            )}
            {!cloningYear &&
              supportsYear &&
              yearFilter !== 'all' &&
              yearFilter !== 'unknown' &&
              Number.isFinite(selectedYearNumber) &&
              selectedYearNumber >= YEAR_START &&
              selectedYearNumber <= YEAR_END &&
              !hasSelectedYearData && (
                <button
                  type="button"
                  style={{ marginLeft: 'auto', background: '#228be6' }}
                  onClick={() => duplicateYear(selectedYearNumber)}
                >
                  Popola anno {selectedYearNumber}
                </button>
              )}
          </div>

          <div className="pill-group">
            {[
              { value: 'all', label: 'Tutti' },
              { value: 'paid', label: 'Pagati' },
              { value: 'unpaid', label: 'Da saldare' },
            ].map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setStatusFilter(item.value)}
                className={`pill-button ${statusFilter === item.value ? 'pill-button--active' : ''}`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <article className="card" style={{ background: '#f8f9fa', border: '1px dashed rgba(0,0,0,0.2)' }}>
            <h2 style={{ marginTop: 0 }}>Acquisti soci</h2>
            <p style={{ color: 'var(--color-muted)' }}>
              Gestione di magliette e gadget con taglie, pagamenti e stato ordine. I dati sono filtrabili e modificabili.
            </p>
            {!canEditMembers && (
              <p style={{ color: '#c92a2a', margin: 0 }}>
                Non hai i permessi per modificare gli acquisti. Puoi solo consultare.
              </p>
            )}
          </article>
          {purchaseError && (
            <article
              className="card"
              style={{
                background: '#fff5f5',
                borderColor: '#ff8787',
                color: '#c92a2a',
                marginBottom: '1rem',
              }}
            >
              {purchaseError}
            </article>
          )}
          <div
            className="card"
            style={{
              marginBottom: '1rem',
              display: 'grid',
              gap: '0.75rem',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            }}
          >
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              Tipo acquisto
              <select value={purchaseTypeFilter} onChange={(event) => setPurchaseTypeFilter(event.target.value)}>
                <option value="all">Tutti</option>
                {PURCHASE_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              Taglia
              <select value={purchaseSizeFilter} onChange={(event) => setPurchaseSizeFilter(event.target.value)}>
                <option value="all">Tutte</option>
                {PURCHASE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              Stato pagamento
              <select value={purchaseStatusFilter} onChange={(event) => setPurchaseStatusFilter(event.target.value)}>
                <option value="all">Tutti</option>
                {PAYMENT_STATUS.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              Stato ordine
              <select value={purchaseOrderFilter} onChange={(event) => setPurchaseOrderFilter(event.target.value)}>
                <option value="all">Tutti</option>
                {ORDER_STATUS.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              Anno
              <select value={purchaseYearFilter} onChange={(event) => setPurchaseYearFilter(event.target.value)}>
                <option value="all">Tutti</option>
                {yearOptions.map((yearOption) => (
                  <option key={yearOption} value={String(yearOption)}>
                    {yearOption}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {canEditMembers && (
            <div className="card">
              <form onSubmit={handlePurchaseSubmit} style={{ display: 'grid', gap: '0.75rem' }}>
                <h3 style={{ margin: 0 }}>{purchaseEditingId ? 'Modifica acquisto' : 'Nuovo acquisto'}</h3>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  Socio
                  <select
                    value={purchaseForm.member_id}
                    onChange={(event) => handlePurchaseChange('member_id', event.target.value)}
                    required
                  >
                    <option value="">Seleziona socio</option>
                    {members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.full_name} (#{member.old_id ?? 'N/D'})
                      </option>
                    ))}
                  </select>
                </label>
                <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    Tipo
                    <select
                      value={purchaseForm.item_type}
                      onChange={(event) => handlePurchaseChange('item_type', event.target.value)}
                    >
                      {PURCHASE_TYPES.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    Taglia
                    <select value={purchaseForm.size} onChange={(event) => handlePurchaseChange('size', event.target.value)}>
                      {PURCHASE_SIZES.map((size) => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    Quantita
                    <input
                      type="number"
                      min={1}
                      value={purchaseForm.quantity}
                      onChange={(event) => handlePurchaseChange('quantity', Number(event.target.value))}
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    Prezzo
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="0.00"
                      value={purchaseForm.price}
                      onChange={(event) => handlePurchaseChange('price', event.target.value)}
                    />
                  </label>
                </div>
                <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    Pagamento
                    <select
                      value={purchaseForm.payment_status}
                      onChange={(event) => handlePurchaseChange('payment_status', event.target.value)}
                    >
                      {PAYMENT_STATUS.map((status) => (
                        <option key={status.value} value={status.value}>
                          {status.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    Stato ordine
                    <select
                      value={purchaseForm.status}
                      onChange={(event) => handlePurchaseChange('status', event.target.value)}
                    >
                      {ORDER_STATUS.map((status) => (
                        <option key={status.value} value={status.value}>
                          {status.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    Anno
                    <select
                      value={purchaseForm.purchase_year}
                      onChange={(event) => handlePurchaseChange('purchase_year', event.target.value)}
                    >
                      {yearOptions.map((yearOption) => (
                        <option key={yearOption} value={String(yearOption)}>
                          {yearOption}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  Note
                  <textarea
                    rows={2}
                    value={purchaseForm.notes}
                    onChange={(event) => handlePurchaseChange('notes', event.target.value)}
                  />
                </label>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button type="submit" disabled={purchaseSubmitting}>
                    {purchaseSubmitting ? 'Salvataggio...' : purchaseEditingId ? 'Aggiorna' : 'Aggiungi'}
                  </button>
                  <button
                    type="button"
                    style={{ background: '#adb5bd' }}
                    onClick={() => {
                      resetPurchaseForm();
                    }}
                  >
                    Annulla
                  </button>
                </div>
              </form>
            </div>
          )}
          {purchaseLoading ? (
            <p>Caricamento acquisti...</p>
          ) : filteredPurchases.length ? (
            <div className="card-list">
              {filteredPurchases.map((purchase) => {
                const member = membersById.get(String(purchase.member_id));
                return (
                  <article className="card" key={purchase.id}>
                    <header style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <div>
                        <h3 style={{ margin: 0 }}>{member?.full_name ?? 'Socio non trovato'}</h3>
                        <p style={{ margin: '0.25rem 0', color: 'var(--color-muted)' }}>
                          {purchase.item_type} · Taglia {purchase.size ?? 'N/D'} · Quantita {purchase.quantity ?? 1}
                        </p>
                      </div>
                      {canEditMembers && (
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button type="button" onClick={() => handlePurchaseEdit(purchase)}>
                            Modifica
                          </button>
                          <button type="button" style={{ background: '#e03131' }} onClick={() => handlePurchaseDelete(purchase.id)}>
                            Elimina
                          </button>
                        </div>
                      )}
                    </header>
                    <p style={{ margin: '0.25rem 0', color: 'var(--color-muted)' }}>
                      Prezzo: {formatPurchasePrice(purchase.price)} · Anno {purchase.purchase_year ?? 'N/D'}
                    </p>
                    <p style={{ margin: '0.25rem 0', color: 'var(--color-muted)' }}>
                      Pagamento: {PAYMENT_STATUS.find((status) => status.value === purchase.payment_status)?.label ?? 'N/D'} ·
                      Stato ordine: {ORDER_STATUS.find((status) => status.value === purchase.status)?.label ?? 'N/D'}
                    </p>
                    {purchase.notes && (
                      <p style={{ margin: '0.25rem 0', color: 'var(--color-muted)' }}>Note: {purchase.notes}</p>
                    )}
                    {canEditMembers && (
                      <div style={{ marginTop: '0.5rem' }}>
                        <button
                          type="button"
                          onClick={() => togglePurchasePayment(purchase)}
                          style={{
                            width: '100%',
                            borderRadius: '999px',
                            border: 'none',
                            padding: '0.4rem',
                            background: purchase.payment_status === 'paid' ? 'rgba(34,197,94,0.2)' : 'rgba(250,176,5,0.2)',
                            color: purchase.payment_status === 'paid' ? '#2b8a3e' : '#d9480f',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          {purchase.payment_status === 'paid' ? 'Pagato' : 'Da saldare'}
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="card">
              <p style={{ margin: 0, color: 'var(--color-muted)' }}>
                Nessun acquisto registrato per i filtri selezionati.
              </p>
            </div>
          )}
        </>
      )}

      {membersTab === 'anagrafica' && (
        <>
          {showForm && canEditMembers && (
            <div className="card" ref={formRef}>
              <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '0.75rem' }}>
                <h2>{editingId ? 'Modifica socio' : 'Nuovo socio'}</h2>
                <input
                  type="number"
                  min={0}
                  placeholder="Numero tessera"
                  value={form.membership_number}
                  onChange={(event) => handleChange('membership_number', event.target.value)}
                  required
                />
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  Anno di riferimento
                  <select
                    value={form.membership_year}
                    onChange={(event) => handleChange('membership_year', Number(event.target.value))}
                  >
                    {yearOptions.map((yearOption) => (
                      <option key={yearOption} value={yearOption}>
                        {yearOption}
                      </option>
                    ))}
                  </select>
                </label>
                <input
                  placeholder="Nome e cognome"
                  value={form.full_name}
                  onChange={(event) => handleChange('full_name', event.target.value)}
                  required
                />
                {supportsEmail && (
                  <input placeholder="Email" value={form.email} onChange={(event) => handleChange('email', event.target.value)} />
                )}
                {supportsPhone && (
                  <input placeholder="Telefono" value={form.phone} onChange={(event) => handleChange('phone', event.target.value)} />
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={Boolean(form.membership_paid)}
                    onChange={(event) => handleChange('membership_paid', event.target.checked)}
                  />
                  <span>Quota annuale pagata</span>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="submit" disabled={submitting}>
                    {submitting ? 'Salvataggio...' : editingId ? 'Aggiorna' : 'Aggiungi'}
                  </button>
                  <button type="button" style={{ background: '#adb5bd' }} onClick={() => { resetForm(); setShowForm(false); }}>
                    Annulla
                  </button>
                </div>
                {error && <p style={{ color: 'var(--color-accent)' }}>{error}</p>}
              </form>
            </div>
          )}

          {loading ? (
            <p>Caricamento soci...</p>
          ) : (
            <div className="card-list">
              {filteredMembers.map((member) => (
                <article className="card" key={member.id}>
                  <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 style={{ margin: 0 }}>{member.full_name}</h3>
                    <span className="chip">Tessera #{member.old_id ?? 'N/D'}</span>
                  </div>
                    {canEditMembers && (
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button type="button" onClick={() => handleEdit(member)}>
                          Modifica
                        </button>
                        <button type="button" style={{ background: '#e03131' }} onClick={() => handleDelete(member.id)}>
                          Elimina
                        </button>
                      </div>
                    )}
                  </header>
                  <p style={{ margin: '0.25rem 0', color: 'var(--color-muted)' }}>
                    Anno di riferimento: {Number(member.membership_year) || Number(member.year) || Number(member.anno) || 'N/D'}
                  </p>
                  {supportsEmail && (
                    <p style={{ color: 'var(--color-muted)' }}>{member.email ?? 'Email non disponibile'}</p>
                  )}
                  {supportsPhone && (
                    <p style={{ color: 'var(--color-muted)' }}>{member.phone ?? 'Telefono non disponibile'}</p>
                  )}
                  {canManageRoles && supportsEmail && member.email && (
                    <div style={{ marginTop: '0.5rem' }}>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                        Ruolo app
                        <select
                          value={profilesByEmail.get(member.email.toLowerCase())?.role ?? 'socio'}
                          onChange={(event) => handleRoleChange(member.email, event.target.value)}
                          disabled={rolesLoading || roleUpdating[member.email]}
                        >
                          {rolesList.map((roleOption) => (
                            <option key={roleOption} value={roleOption}>
                              {roleOption}
                            </option>
                          ))}
                        </select>
                      </label>
                      {!profilesByEmail.get(member.email.toLowerCase()) && (
                        <small style={{ color: 'var(--color-muted)' }}>
                          Nessun profilo auth per questa email.
                        </small>
                      )}
                    </div>
                  )}
                  <div style={{ marginTop: '0.75rem' }}>
                    <p style={{ margin: '0 0 0.35rem', fontWeight: 600, color: 'var(--color-muted)' }}>Quota annuale</p>
                    {canEditMembers ? (
                      <button
                        type="button"
                        onClick={() => toggleMembershipPayment(member)}
                        disabled={togglingId === member.id}
                        style={{
                          width: '100%',
                          borderRadius: '999px',
                          border: 'none',
                          padding: '0.4rem',
                          background: member.membership_paid ? 'rgba(34,197,94,0.2)' : 'rgba(250,176,5,0.2)',
                          color: member.membership_paid ? '#2b8a3e' : '#d9480f',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        {togglingId === member.id
                          ? 'Aggiornamento...'
                          : member.membership_paid
                          ? 'Pagato'
                          : 'Da saldare'}
                      </button>
                    ) : (
                      <div
                        style={{
                          width: '100%',
                          borderRadius: '999px',
                          padding: '0.4rem',
                          background: member.membership_paid ? 'rgba(34,197,94,0.15)' : 'rgba(250,176,5,0.15)',
                          color: member.membership_paid ? '#2b8a3e' : '#d9480f',
                          textAlign: 'center',
                          fontWeight: 600,
                        }}
                      >
                        {member.membership_paid ? 'Pagato' : 'Da saldare'}
                      </div>
                    )}
                  </div>
                </article>
              ))}
              {!filteredMembers.length && <p>Nessun socio trovato.</p>}
            </div>
          )}

          {canEditMembers && (
            <button
              className="floating-button"
              type="button"
              onClick={() => {
                setShowForm((prev) => !prev);
                resetForm();
              }}
            >
              {showForm ? 'Chiudi modulo' : 'Aggiungi socio'}
            </button>
          )}
        </>
      )}
    </section>
  );
}
