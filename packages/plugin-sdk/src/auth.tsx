"use client";

import { useContext, useState, type FormEvent, type ReactElement } from "react";
import type { User } from "@supabase/supabase-js";
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label, cn } from "@wcc-impact/ui";
import { getSupabase } from "./client";
import { SignalContext, requireStore } from "./context";

/**
 * Supabase Auth context provided by the core shell (SignalProvider) —
 * optional, for concepts needing identity (e.g. triage verification, which
 * needs an authenticated user to UPDATE signals.verification).
 *
 * @example
 * const { user, loading } = useUser();
 * if (!user) return <SignIn />;
 */
export function useUser(): { user: User | null; loading: boolean } {
  const store = requireStore(useContext(SignalContext), "useUser()");
  return { user: store.user, loading: store.userLoading };
}

/**
 * Email magic-link sign-in form, styled with core tokens. On submit sends a
 * Supabase OTP link; the user clicks it in their inbox and lands back here
 * signed in (useUser() updates automatically).
 *
 * @example <SignIn className="max-w-sm" />
 */
export function SignIn({ className }: { className?: string }): ReactElement {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email) return;
    setStatus("sending");
    setMessage(null);
    const { error } = await getSupabase().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: typeof window !== "undefined" ? window.location.href : undefined },
    });
    if (error) {
      setStatus("error");
      setMessage(error.message);
    } else {
      setStatus("sent");
      setMessage(`Magic link sent to ${email} — check your inbox.`);
    }
  }

  return (
    <Card className={cn("gap-3 py-4", className)}>
      <CardHeader className="px-4">
        <CardTitle className="text-sm font-medium">Sign in with email</CardTitle>
      </CardHeader>
      <CardContent className="px-4">
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <Label htmlFor="hack-signin-email" className="sr-only">
            Email address
          </Label>
          <div className="flex gap-2">
            <Input
              id="hack-signin-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.org"
              className="flex-1"
            />
            <Button type="submit" disabled={status === "sending"}>
              {status === "sending" ? "Sending…" : "Send link"}
            </Button>
          </div>
          {message && (
            <p
              className={cn(
                "text-sm",
                status === "error" ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {message}
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
