"use client";

import { useAuth } from "@/lib/auth";
import Link from "next/link";

export function Navbar() {
  const { user, logout } = useAuth();

  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link href="/agents" className="text-lg font-semibold tracking-tight">
            agentx
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link
              href="/agents"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Agents
            </Link>
          </nav>
        </div>
        {user && (
          <div className="flex items-center gap-4 text-sm">
            <span className="text-muted-foreground">{user.email}</span>
            <button
              onClick={logout}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
