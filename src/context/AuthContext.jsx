import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import AuthContext from './authContext';
import { safeLogActivity } from '../services/activityLogs.js';
import { ruoliDelProfilo } from '../utils/permissions.js';

/** Registrazione dal modulo «Registrati»: password già scelta, dati copiati nel profilo. */
async function completaRegistrazione(utente, profilo) {
  const meta = utente.user_metadata ?? {};
  if (!meta.self_signup) return profilo;
  const aggiornato = { ...profilo };
  const mancanti = {};
  for (const campo of ['first_name', 'last_name', 'phone']) {
    if (!profilo[campo] && meta[campo]) mancanti[campo] = String(meta[campo]).trim();
  }
  if (Object.keys(mancanti).length) {
    const { error } = await supabase.from('profiles').update(mancanti).eq('id', utente.id);
    if (!error) Object.assign(aggiornato, mancanti);
  }
  if (!profilo.password_initialized) {
    const { error } = await supabase.rpc('mark_password_initialized');
    if (!error) aggiornato.password_initialized = true;
  }
  return aggiornato;
}

export default function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [role, setRole] = useState('socio');
  // Ruolo principale più quelli in più (doppio ruolo, migrazione 14).
  const [roles, setRoles] = useState(['socio']);
  const [loading, setLoading] = useState(true);
  const [profileNeedsPasswordReset, setProfileNeedsPasswordReset] = useState(false);
  const [approvalStatus, setApprovalStatus] = useState(null);
  const [profileLoadedFor, setProfileLoadedFor] = useState(null);

  const currentUserIdRef = useRef(null);

  // Il ruolo arriva solo dalla tabella profiles (protetta lato database).
  // user_metadata non è affidabile: l'utente può modificarlo da solo.
  const resolveRole = useCallback(() => 'socio', []);

  const applySession = useCallback(
    (nextSession) => {
      setSession(nextSession);
      const nextUser = nextSession?.user ?? null;
      setUser(nextUser);
      // Al rinnovo del token lo stesso utente mantiene il ruolo già letto dal profilo.
      if ((nextUser?.id ?? null) !== currentUserIdRef.current) {
        currentUserIdRef.current = nextUser?.id ?? null;
        setRole(resolveRole(nextUser));
        setRoles([resolveRole(nextUser)]);
      }
    },
    [resolveRole],
  );

  const login = useCallback(
    async (email, password) => {
      setLoading(true);
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setLoading(false);
        throw new Error(error.message ?? 'Credenziali non valide');
      }
      applySession(data.session ?? null);
      if (data.user) {
        safeLogActivity(
          {
            action: 'login',
            entity: 'auth',
            entityId: data.user.id,
            message: `Login utente ${data.user.email ?? ''}`.trim(),
          },
          data.user,
        );
      }
      setLoading(false);
      return { user: data.user ?? null, role: resolveRole(data.user ?? null) };
    },
    [applySession, resolveRole],
  );

  const logout = useCallback(async () => {
    setLoading(true);
    await supabase.auth.setSession({ access_token: null, refresh_token: null });
    const { error } = await supabase.auth.signOut();
    if (error) {
      setLoading(false);
      throw error;
    }
    applySession(null);
    setLoading(false);
  }, [applySession]);

  useEffect(() => {
    let ignore = false;

    async function bootstrap() {
      setLoading(true);
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        console.error('[AuthContext] Errore recupero sessione:', error.message);
      }
      if (!ignore) {
        applySession(data?.session ?? null);
        setLoading(false);
      }
    }

    bootstrap();

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      applySession(nextSession);
      setLoading(false);
    });

    return () => {
      ignore = true;
      subscription?.subscription?.unsubscribe?.();
    };
  }, [applySession]);

  const refreshProfileFlags = useCallback(
    async (targetUser = user) => {
      if (!targetUser) {
        setProfileNeedsPasswordReset(false);
        setApprovalStatus(null);
        setProfileLoadedFor(null);
        return null;
      }
      const provider =
        targetUser.app_metadata?.provider ??
        targetUser.identities?.[0]?.provider ??
        null;
      if (provider && provider !== 'email') {
        setProfileNeedsPasswordReset(false);
      }
      const { data: letto, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', targetUser.id)
        .maybeSingle();
      // Chi si è registrato da solo ha già scelto la password e lasciato i suoi dati:
      // non serve chiedergli di nuovo la password al primo accesso.
      const data = letto ? await completaRegistrazione(targetUser, letto) : letto;
      if (error) {
        console.warn('[AuthContext] impossibile leggere profilo:', error.message);
        setRole('socio');
        setRoles(['socio']);
        setProfileNeedsPasswordReset(false);
        setApprovalStatus(null);
        setProfileLoadedFor(targetUser.id);
        return null;
      }
      setRole(data?.role ?? 'socio');
      setRoles(ruoliDelProfilo(data?.role, data?.ruoli_extra));
      setApprovalStatus(data?.approval_status ?? 'pending');
      if (provider && provider !== 'email') {
        setProfileNeedsPasswordReset(false);
      } else {
        setProfileNeedsPasswordReset(data ? !data.password_initialized : false);
      }
      setProfileLoadedFor(targetUser.id);
      return data ?? null;
    },
    [user],
  );

  useEffect(() => {
    let ignore = false;
    async function syncProfileFlags() {
      const data = await refreshProfileFlags(user);
      if (ignore) return;
      return data;
    }
    syncProfileFlags();
    return () => {
      ignore = true;
    };
  }, [refreshProfileFlags, user]);

  const markPasswordInitialized = useCallback(() => setProfileNeedsPasswordReset(false), []);

  const value = useMemo(
    () => ({
      session,
      user,
      role,
      roles,
      // Finché il profilo non è letto il ruolo non è noto: le rotte protette attendono.
      loading: loading || Boolean(user && profileLoadedFor !== user.id),
      isAuthenticated: Boolean(user),
      needsPasswordReset: profileNeedsPasswordReset,
      approvalStatus,
      login,
      logout,
      markPasswordInitialized,
      refreshProfileFlags,
    }),
    [
      session,
      user,
      role,
      roles,
      loading,
      profileLoadedFor,
      login,
      logout,
      profileNeedsPasswordReset,
      approvalStatus,
      markPasswordInitialized,
      refreshProfileFlags,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
