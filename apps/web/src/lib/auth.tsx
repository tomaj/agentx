"use client";

import { getMe } from "@/lib/api";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

interface User {
  id: string;
  email: string;
  name: string;
}

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const savedToken = localStorage.getItem("agentx_token");
    if (!savedToken) {
      setIsLoading(false);
      return;
    }

    setToken(savedToken);

    getMe(savedToken)
      .then((data) => {
        setUser({ id: data.id, email: data.email, name: data.name });
      })
      .catch(() => {
        localStorage.removeItem("agentx_token");
        setToken(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const loginFn = useCallback((newToken: string) => {
    setToken(newToken);
    localStorage.setItem("agentx_token", newToken);

    getMe(newToken)
      .then((data) => {
        setUser({ id: data.id, email: data.email, name: data.name });
      })
      .catch(() => {
        localStorage.removeItem("agentx_token");
        setToken(null);
      });
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    localStorage.removeItem("agentx_token");
    router.push("/login");
  }, [router]);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login: loginFn, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}

export function useRequireAuth() {
  const auth = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!auth.isLoading && !auth.token) {
      router.push("/login");
    }
  }, [auth.isLoading, auth.token, router]);

  return auth;
}
