import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import AuthContext from './authContext';
import { safeLogActivity } from '../services/activityLogs.js';

export default function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [role, setRole] = useState('socio');
  const [loading, setLoading] = useState(true);
  const [profileNeedsPasswordReset, setProfileNeedsPasswordReset] = useState(false);
  const [approvalStatus, setApprovalStatus] = useState(null);
  const SUPER_ADMIN_EMAILS = ['stratosdiakatos@yahoo.it'];

  const resolveRole = useCallback((targetUser) => {
    if (!targetUser) return 'socio';
    return (
      targetUser.user_metadata?.role ??
      targetUser.app_metadata?.role ??
      targetUser.raw_user_meta_data?.role ??
      'socio'
    );
  }, []);

  const applySession = useCallback(
    (nextSession) => {
      setSession(nextSession);
      const nextUser = nextSession?.user ?? null;
      setUser(nextUser);
      setRole(resolveRole(nextUser));
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

  useEffect(() => {
    let ignore = false;
    async function syncProfileFlags() {
      if (!user) {
        setProfileNeedsPasswordReset(false);
        setApprovalStatus(null);
        return;
      }
      if (SUPER_ADMIN_EMAILS.includes((user.email ?? '').toLowerCase())) {
        setApprovalStatus('approved');
        setRole('admin');
        setProfileNeedsPasswordReset(false);
        return;
      }
      const provider =
        user.app_metadata?.provider ??
        user.identities?.[0]?.provider ??
        null;
      if (provider && provider !== 'email') {
        setProfileNeedsPasswordReset(false);
      }
      const { data, error } = await supabase
        .from('profiles')
        .select('password_initialized, approval_status, role')
        .eq('id', user.id)
        .maybeSingle();
      if (!ignore) {
        if (error) {
          console.warn('[AuthContext] impossibile leggere profilo:', error.message);
          setProfileNeedsPasswordReset(false);
          setApprovalStatus(null);
        } else {
          if (data?.role) setRole(data.role);
          setApprovalStatus(data?.approval_status ?? 'pending');
          if (provider && provider !== 'email') {
            setProfileNeedsPasswordReset(false);
          } else {
            setProfileNeedsPasswordReset(data ? !data.password_initialized : false);
          }
        }
      }
    }
    syncProfileFlags();
    return () => {
      ignore = true;
    };
  }, [user]);

  const markPasswordInitialized = useCallback(() => setProfileNeedsPasswordReset(false), []);

  const value = useMemo(
    () => ({
      session,
      user,
      role,
      loading,
      isAuthenticated: Boolean(user),
      needsPasswordReset: profileNeedsPasswordReset,
      approvalStatus,
      login,
      logout,
      markPasswordInitialized,
    }),
    [
      session,
      user,
      role,
      loading,
      login,
      logout,
      profileNeedsPasswordReset,
      approvalStatus,
      markPasswordInitialized,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
