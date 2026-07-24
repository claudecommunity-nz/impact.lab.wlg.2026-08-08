"use client";

import { useState } from "react";
import { KeyRound, LoaderCircle, LogOut, ShieldCheck } from "lucide-react";
import { Badge, Button, Card, CardContent, cn } from "@wcc-impact/ui";
import { getSupabase } from "@wcc-impact/plugin-sdk/client";
import {
  DEMO_ACCOUNTS,
  DEMO_AUTH_ENABLED,
  DEMO_PASSWORD,
  type DemoAccount,
} from "../lib/demo-accounts";
import type { ResponseRole } from "../lib/spatial-triage";

export function DemoRoleLogin({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const [pendingRole, setPendingRole] = useState<ResponseRole | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!DEMO_AUTH_ENABLED) return null;

  async function signIn(account: DemoAccount) {
    setPendingRole(account.role);
    setError(null);
    const { error: signInError } = await getSupabase().auth.signInWithPassword({
      email: account.email,
      password: DEMO_PASSWORD,
    });
    if (signInError) setError(signInError.message);
    setPendingRole(null);
  }

  return (
    <Card className={cn("gap-0 overflow-hidden py-0", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/45 px-4 py-3">
        <div className="flex items-center gap-2">
          <KeyRound className="size-4 text-muted-foreground" aria-hidden />
          <div>
            <h3 className="text-xs font-semibold">Hackathon demo accounts</h3>
            <p className="text-[10px] text-muted-foreground">
              Public credentials for scenario demonstration only
            </p>
          </div>
        </div>
        <div className="text-right text-[10px] text-muted-foreground">
          <span>Password</span>
          <code className="ml-2 rounded bg-background px-1.5 py-1 font-semibold text-foreground">
            {DEMO_PASSWORD}
          </code>
        </div>
      </div>
      <CardContent
        className={cn("grid gap-2 p-3", !compact && "md:grid-cols-3")}
      >
        {DEMO_ACCOUNTS.map((account) => {
          const pending = pendingRole === account.role;
          return (
            <div
              key={account.role}
              className="flex min-w-0 flex-col rounded-md border border-border bg-card p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <Badge variant="outline" className="capitalize">
                  {account.label}
                </Badge>
                <ShieldCheck className="size-3.5 text-muted-foreground" aria-hidden />
              </div>
              <code className="mt-2 truncate text-[10px] text-foreground">
                {account.email}
              </code>
              <p className="mt-1 min-h-8 text-[10px] leading-relaxed text-muted-foreground">
                {account.description}
              </p>
              <Button
                type="button"
                size="sm"
                className="mt-2 h-7 text-[10px]"
                disabled={pendingRole !== null}
                onClick={() => void signIn(account)}
              >
                {pending ? (
                  <>
                    <LoaderCircle className="size-3 motion-safe:animate-spin" />
                    Signing in…
                  </>
                ) : (
                  `Use ${account.label}`
                )}
              </Button>
            </div>
          );
        })}
        {error && (
          <p role="alert" className="text-xs text-destructive md:col-span-3">
            Demo sign-in failed: {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function OperationsSession({
  email,
  role,
}: {
  email: string | null;
  role: ResponseRole | null;
}) {
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    await getSupabase().auth.signOut();
    setSigningOut(false);
  }

  return (
    <div className="flex h-9 items-center gap-2 rounded-md border border-border bg-card px-2 text-[10px] shadow-sm">
      <div className="hidden min-w-0 sm:block">
        <p className="max-w-40 truncate font-medium text-foreground">{email}</p>
        <p className="capitalize text-muted-foreground">
          {role ? `${role} access` : "Signed in"}
        </p>
      </div>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        title="Sign out"
        aria-label="Sign out"
        disabled={signingOut}
        onClick={() => void signOut()}
      >
        {signingOut ? (
          <LoaderCircle className="size-3.5 motion-safe:animate-spin" />
        ) : (
          <LogOut className="size-3.5" />
        )}
      </Button>
    </div>
  );
}
