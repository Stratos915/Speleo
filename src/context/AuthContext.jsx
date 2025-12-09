import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import AuthContext from './authContext';

export default function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [role, setRole] = useState('socio');
  const [loading, setLoading] = useState(true);

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
        throw new Error('Credenziali non valide');
      }
      applySession(data.session ?? null);
      setLoading(false);
      return { user: data.user ?? null, role: resolveRole(data.user ?? null) };
    },
    [applySession, resolveRole],
  );

  const logout = useCallback(async () => {
    setLoading(true);
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

  const value = useMemo(
    () => ({
      session,
      user,
      role,
      loading,
      isAuthenticated: Boolean(user),
      login,
      logout,
    }),
    [session, user, role, loading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
