import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import useAuth from '../context/useAuth.js';

export default function ApprovalPending() {
  const navigate = useNavigate();
  const { logout, user, refreshProfileFlags } = useAuth();
  const [loading, setLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState('');
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSaved, setFormSaved] = useState(false);
  const [matching, setMatching] = useState(false);
  const [matchError, setMatchError] = useState('');
  const [matchedMember, setMatchedMember] = useState(null);
  const [matchedMemberId, setMatchedMemberId] = useState(null);
  const [refreshMessage, setRefreshMessage] = useState('');

  const normalizeName = (value) => String(value ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  const fullNameValue = useMemo(
    () => `${form.first_name ?? ''} ${form.last_name ?? ''}`.trim(),
    [form.first_name, form.last_name],
  );
  const isFormComplete = useMemo(() => {
    return Boolean(form.first_name && form.last_name && form.email && form.phone);
  }, [form]);

  async function handleLogout() {
    setLoading(true);
    try {
      await logout();
      navigate('/', { replace: true });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let ignore = false;
    async function loadProfile() {
      if (!user) {
        setProfile(null);
        setProfileLoading(false);
        return;
      }
      setProfileLoading(true);
      setProfileError('');
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id,email,first_name,last_name,phone,member_id,approval_status')
          .eq('id', user.id)
          .maybeSingle();
        if (error) throw error;
        if (ignore) return;
        setProfile(data ?? null);
        setForm({
          first_name: data?.first_name ?? '',
          last_name: data?.last_name ?? '',
          email: data?.email ?? user.email ?? '',
          phone: data?.phone ?? '',
        });
        setMatchedMemberId(data?.member_id ?? null);
        setFormSaved(Boolean(data?.first_name && data?.last_name && data?.email && data?.phone));
      } catch (loadError) {
        if (!ignore) {
          setProfileError(loadError.message ?? 'Impossibile recuperare il profilo.');
        }
      } finally {
        if (!ignore) setProfileLoading(false);
      }
    }
    loadProfile();
    return () => {
      ignore = true;
    };
  }, [user]);

  async function handleRefreshStatus() {
    if (!user) return;
    setProfileLoading(true);
    setProfileError('');
    setRefreshMessage('');
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id,email,first_name,last_name,phone,member_id,approval_status')
        .eq('id', user.id)
        .maybeSingle();
      if (error) throw error;
      setProfile(data ?? null);
      await refreshProfileFlags();
      if ((data?.approval_status ?? 'pending') === 'approved') {
        navigate('/dashboard', { replace: true });
        return;
      }
      setFormSaved(Boolean(data?.first_name && data?.last_name && data?.email && data?.phone));
      setRefreshMessage('Account ancora in attesa di approvazione.');
    } catch (refreshError) {
      setProfileError(refreshError.message ?? 'Impossibile aggiornare lo stato.');
    } finally {
      setProfileLoading(false);
    }
  }

  useEffect(() => {
    if (!form.first_name || !form.last_name) {
      setMatchedMember(null);
      setMatchedMemberId(profile?.member_id ?? null);
      return;
    }
    let ignore = false;
    const timer = setTimeout(async () => {
      setMatching(true);
      setMatchError('');
      const normalizedTarget = normalizeName(fullNameValue);
      try {
        const first = form.first_name.trim();
        const last = form.last_name.trim();
        const { data, error } = await supabase
          .from('members')
          .select('id,full_name,email,phone')
          .or(
            [
              `full_name.ilike.%${first}%${last}%`,
              `full_name.ilike.%${last}%${first}%`,
              `full_name.ilike.%${first}%`,
              `full_name.ilike.%${last}%`,
            ].join(','),
          )
          .limit(25);
        if (error) throw error;
        if (ignore) return;
        const match =
          (data ?? []).find((member) => {
            const full = normalizeName(member.full_name);
            return full && full === normalizedTarget;
          }) ?? null;
        setMatchedMember(match);
        setMatchedMemberId(match?.id ?? profile?.member_id ?? null);
        if (match) {
          setForm((prev) => ({
            ...prev,
            email: prev.email || match.email || prev.email,
            phone: prev.phone || match.phone || prev.phone,
          }));
        }
      } catch (searchError) {
        if (!ignore) {
          setMatchError(searchError.message ?? 'Errore durante la ricerca del socio.');
          setMatchedMember(null);
        }
      } finally {
        if (!ignore) setMatching(false);
      }
    }, 400);
    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [form.first_name, form.last_name, fullNameValue, normalizeName, profile?.member_id]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!user) return;
    setSaving(true);
    setFormError('');
    try {
      const payload = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        member_id: matchedMemberId ?? profile?.member_id ?? null,
        approval_status: 'pending',
      };
      const { error } = await supabase.from('profiles').update(payload).eq('id', user.id);
      if (error) throw error;
      setFormSaved(true);
      setProfile((prev) => ({ ...prev, ...payload }));
    } catch (saveError) {
      setFormError(saveError.message ?? 'Impossibile salvare i dati.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="login-card">
        <h1>{formSaved ? 'Accesso in attesa' : 'Completa i tuoi dati'}</h1>
        {profileError && <p style={{ color: '#c92a2a' }}>{profileError}</p>}
        {profileLoading ? (
          <p>Caricamento profilo...</p>
        ) : formSaved ? (
          <>
            <p style={{ color: 'var(--color-muted)' }}>
              Il tuo account è in attesa di approvazione da parte dell&apos;amministratore.
            </p>
            {refreshMessage && <p style={{ color: 'var(--color-muted)' }}>{refreshMessage}</p>}
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
              <button type="button" onClick={handleRefreshStatus} disabled={profileLoading}>
                Ricarica stato
              </button>
              <button type="button" style={{ background: '#adb5bd' }} onClick={handleLogout} disabled={loading}>
                {loading ? 'Uscita...' : 'Esci'}
              </button>
            </div>
          </>
        ) : (
          <>
            <p style={{ color: 'var(--color-muted)' }}>
              Inserisci i tuoi dati per completare la richiesta di accesso. Se troviamo un socio con lo stesso nome e
              cognome compileremo automaticamente email e telefono.
            </p>
            <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '0.75rem', marginTop: '1rem' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                Nome
                <input
                  value={form.first_name}
                  onChange={(event) => setForm((prev) => ({ ...prev, first_name: event.target.value }))}
                  placeholder="Nome"
                  required
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                Cognome
                <input
                  value={form.last_name}
                  onChange={(event) => setForm((prev) => ({ ...prev, last_name: event.target.value }))}
                  placeholder="Cognome"
                  required
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                Email
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                  placeholder="Email"
                  required
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                Telefono
                <input
                  value={form.phone}
                  onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
                  placeholder="Numero di telefono"
                  required
                />
              </label>
              {matching && <p style={{ color: 'var(--color-muted)' }}>Cerco corrispondenze...</p>}
              {matchError && <p style={{ color: '#c92a2a' }}>{matchError}</p>}
              {matchedMember ? (
                <p style={{ color: 'var(--color-muted)' }}>
                  Socio trovato: <strong>{matchedMember.full_name ?? fullNameValue}</strong>
                </p>
              ) : null}
              {formError && <p style={{ color: '#c92a2a' }}>{formError}</p>}
              <button type="submit" disabled={saving || !isFormComplete}>
                {saving ? 'Salvataggio...' : 'Invia richiesta'}
              </button>
            </form>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
              <button type="button" style={{ background: '#adb5bd' }} onClick={handleLogout} disabled={loading}>
                {loading ? 'Uscita...' : 'Esci'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
