import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { adminApi } from '../api/admin';
import { useAuth } from './AuthContext';
import type { UserRole } from '../types';

interface PortalAccessContextValue {
  permissions: Record<string, boolean> | null;
  role: UserRole | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const PortalAccessContext = createContext<PortalAccessContextValue | undefined>(undefined);

export function PortalAccessProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [permissions, setPermissions] = useState<Record<string, boolean> | null>(null);
  const [role, setRole] = useState<UserRole | null>(user?.role ?? null);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    if (!user) {
      setPermissions(null);
      setRole(null);
      return;
    }
    setLoading(true);
    try {
      const response = await adminApi.getMyPermissions();
      setPermissions(response.permissions || {});
      setRole((response.role as UserRole) || user.role);
    } catch {
      setPermissions(null);
      setRole(user.role);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, [user?.id, user?.role]);

  const value = useMemo(
    () => ({ permissions, role, loading, refresh }),
    [permissions, role, loading]
  );

  return <PortalAccessContext.Provider value={value}>{children}</PortalAccessContext.Provider>;
}

export function usePortalAccess() {
  const context = useContext(PortalAccessContext);
  if (!context) {
    throw new Error('usePortalAccess must be used within PortalAccessProvider');
  }
  return context;
}
