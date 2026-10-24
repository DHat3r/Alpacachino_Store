import { create } from "zustand";
import { persist } from "zustand/middleware";

interface User {
  id: number;
  email: string;
  username: string;
  role: string;
  is_active: boolean;
  is_verified: boolean;
  created_at?: string;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  setTokens: (access: string, refresh: string) => void;
  setUser: (user: User) => void;
  logout: () => void;
  isAuthenticated: () => boolean;
  hasRole: (roles: string[]) => boolean;
}

/** Mantiene el token también en localStorage para el interceptor de axios. */
function syncTokenStorage(access: string | null, refresh: string | null) {
  if (access && refresh) {
    localStorage.setItem("access_token", access);
    localStorage.setItem("refresh_token", refresh);
  } else {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
  }
}

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      setTokens: (access, refresh) => {
        syncTokenStorage(access, refresh);
        set({ accessToken: access, refreshToken: refresh });
      },
      setUser: (user) => set({ user }),
      logout: () => {
        syncTokenStorage(null, null);
        set({ user: null, accessToken: null, refreshToken: null });
      },
      isAuthenticated: () => !!get().accessToken,
      hasRole: (roles) => !!get().user && roles.includes(get().user!.role),
    }),
    {
      name: "alpacachino-auth",
      // Al rehidratar (recarga de página) restaura los tokens para axios.
      onRehydrateStorage: () => (state) => {
        if (state?.accessToken && state?.refreshToken) {
          syncTokenStorage(state.accessToken, state.refreshToken);
        }
      },
    }
  )
);
