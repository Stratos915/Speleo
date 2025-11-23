import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const AuthContext = createContext(null);

async function fetchUserRole(userId) {
  const { data, error } = await supabase.from('users').select('role').eq('id', userId).single();
  if (error) {
    console.error('[AuthContext] Impossibile recuperare il ruolo:', error.message);
    return 'socio';
  }
  return data?.role ?? 'socio';
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState('socio');
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      console.error('[AuthContext] Errore refresh utente:', error.message);
      setUser(null);
      setRole('socio');
      setLoading(false);
      return;
    }
    const currentUser = data?.user ?? null;
    setUser(currentUser);
    if (currentUser) {
      const fetchedRole = await fetchUserRole(currentUser.id);
      setRole(fetchedRole);
    } else {
      setRole('socio');
    }
    setLoading(false);
  }, []);

  const login = useCallback(
    async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        throw error;
      }
      await refreshUser();
    },
    [refreshUser],
  );

  const logout = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      throw error;
    }
    setUser(null);
    setRole('socio');
  }, []);

  useEffect(() => {
    let ignore = false;

    async function bootstrap() {
      setLoading(true);
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        console.error('[AuthContext] Errore caricamento sessione:', error.message);
      }

      const sessionUser = data?.session?.user ?? null;
      if (!ignore) {
        setUser(sessionUser);
        if (sessionUser) {
          const fetchedRole = await fetchUserRole(sessionUser.id);
          if (!ignore) {
            setRole(fetchedRole);
          }
        } else {
          setRole('socio');
        }
        setLoading(false);
      }
    }

    bootstrap();

    const { data: subscription } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const sessionUser = session?.user ?? null;
      setUser(sessionUser);
      if (sessionUser) {
        const fetchedRole = await fetchUserRole(sessionUser.id);
        setRole(fetchedRole);
      } else {
        setRole('socio');
      }
      setLoading(false);
    });

    return () => {
      ignore = true;
      subscription?.subscription?.unsubscribe?.();
    };
  }, []);

  const value = useMemo(
    () => ({
      user,
      role,
      loading,
      isAuthenticated: Boolean(user),
      login,
      logout,
      refreshUser,
    }),
    [user, role, loading, login, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
