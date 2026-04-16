"use client";

import { useRequireAuth } from "@/lib/auth";
import type { ReactNode } from "react";
import { Sidebar } from "./sidebar";

export function AppShell({ children }: { children: ReactNode }) {
  const auth = useRequireAuth();

  if (auth.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!auth.token) return null;

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="pl-56">{children}</main>
    </div>
  );
}
