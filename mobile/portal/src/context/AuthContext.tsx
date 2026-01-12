import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { login as loginApi, getMe } from '../api/auth';
import { clearAuth, getAuthToken, getAuthUser, saveAuth } from '../storage/auth';
import { User } from '../types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const bootstrap = async () => {
    const token = await getAuthToken();
    const cachedUser = await getAuthUser();

    if (token && cachedUser) {
      setUser(cachedUser);
      try {
        const me = await getMe();
        setUser(me);
        await saveAuth(token, me);
      } catch {
        await clearAuth();
        setUser(null);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    bootstrap();
  }, []);

  const signIn = async (email: string, password: string) => {
    setLoading(true);
    try {
      const data = await loginApi({ email, password });
      setUser(data.user);
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    await clearAuth();
    setUser(null);
  };

  const refresh = async () => {
    if (!user) return;
    try {
      const me = await getMe();
      const token = await getAuthToken();
      if (token) {
        await saveAuth(token, me);
      }
      setUser(me);
    } catch {
      await clearAuth();
      setUser(null);
    }
  };

  const value = useMemo(
    () => ({ user, loading, signIn, signOut, refresh }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
