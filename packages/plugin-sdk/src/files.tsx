"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type ReactElement,
} from "react";
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label, cn } from "@wcc-impact/ui";
import { getSupabase } from "./client";

const BUCKET = "media";
const MAX_BYTES = 10 * 1024 * 1024; // bucket-enforced 10 MiB cap
const IMAGE_RE = /\.(png|jpe?g|gif|webp|avif|svg)$/i;

/**
 * Programmatic upload to media/<moduleId>/<filename> → public URL (put it in
 * publish_signal's media_urls). The signed-in user's organiser-controlled
 * module claim must equal moduleId; no module token is exposed to the browser.
 * Throws a readable Error on RLS rejection.
 * The bucket is PUBLIC-READ: no real faces, names, or addresses in test uploads.
 *
 * @example
 * const url = await uploadFile(file, "team-x");
 */
export async function uploadFile(file: File, moduleId: string): Promise<string> {
  if (file.size > MAX_BYTES) {
    throw new Error(
      `uploadFile: "${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)} MB — ` +
        "the media bucket caps files at 10 MB.",
    );
  }
  const supabase = getSupabase();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  const assignedModule =
    typeof user?.app_metadata?.module_id === "string"
      ? user.app_metadata.module_id
      : null;
  if (authError || assignedModule !== moduleId) {
    throw new Error(
      `uploadFile: sign in with an organiser-assigned ${moduleId} account. ` +
        `Current assignment: ${assignedModule ?? "none"}.`,
    );
  }
  const safeName = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
  // Timestamp prefix: unique keys, and the gallery's newest-first order is stable.
  const path = `${moduleId}/${Date.now()}-${safeName}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type || undefined });
  if (error) {
    throw new Error(
      `uploadFile to ${BUCKET}/${path} failed: ${error.message}. Common causes: ` +
        `module "${moduleId}" is disabled or its access was revoked/rotated. ` +
        "Ask an organiser to verify your account assignment.",
    );
  }
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/**
 * Upload UI scoped to media/<moduleId>/ automatically — file picker, progress
 * state, and the public URL handed to `onUploaded` (typically stored into a
 * signal's media_urls).
 *
 * @example
 * <FileUpload moduleId="team-x" accept="image/*"
 *             onUploaded={(url) => setPhotoUrl(url)} />
 */
export function FileUpload({
  moduleId,
  onUploaded,
  accept = "image/*",
  className,
}: {
  moduleId: string;
  onUploaded?: (publicUrl: string) => void;
  accept?: string;
  className?: string;
}): ReactElement {
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const inputId = useId();

  async function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus("uploading");
    setMessage(null);
    try {
      const url = await uploadFile(file, moduleId);
      setStatus("done");
      setMessage(`Uploaded ${file.name}`);
      onUploaded?.(url);
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      // Allow re-selecting the same file.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <Card className={cn("gap-3 py-4", className)}>
      <CardHeader className="px-4">
        <CardTitle className="text-sm font-medium">Upload to media/{moduleId}/</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 px-4">
        <Label htmlFor={inputId} className="sr-only">
          Upload to media/{moduleId}/
        </Label>
        <Input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={accept}
          onChange={handleChange}
          disabled={status === "uploading"}
          className="sr-only"
        />
        <Button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={status === "uploading"}
          className="w-fit"
        >
          {status === "uploading" ? "Uploading…" : "Choose file"}
        </Button>
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
      </CardContent>
    </Card>
  );
}

/**
 * Grid of everything under media/<moduleId>/ (public bucket). Images render
 * as thumbnails; other files as links. Fetches on mount / moduleId change.
 *
 * @example <FileGallery moduleId="team-x" />
 */
export function FileGallery({
  moduleId,
  className,
}: {
  moduleId: string;
  className?: string;
}): ReactElement {
  const [files, setFiles] = useState<{ name: string; url: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = getSupabase();
    supabase.storage
      .from(BUCKET)
      .list(moduleId, { limit: 100, sortBy: { column: "created_at", order: "desc" } })
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) {
          setError(err.message);
          return;
        }
        setFiles(
          (data ?? [])
            .filter((f) => f.name && !f.name.startsWith(".")) // skip placeholder objects
            .map((f) => ({
              name: f.name,
              url: supabase.storage.from(BUCKET).getPublicUrl(`${moduleId}/${f.name}`).data
                .publicUrl,
            })),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [moduleId]);

  if (error) return <p className={cn("text-sm text-destructive", className)}>{error}</p>;
  if (files === null)
    return <p className={cn("text-sm text-muted-foreground", className)}>Loading files…</p>;
  if (files.length === 0)
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>
        Nothing in media/{moduleId}/ yet.
      </p>
    );

  return (
    <div
      className={cn(
        "grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2",
        className,
      )}
    >
      {files.map((f) =>
        IMAGE_RE.test(f.name) ? (
          <a key={f.name} href={f.url} target="_blank" rel="noreferrer">
            <img
              src={f.url}
              alt={f.name}
              loading="lazy"
              className="h-28 w-full rounded-md border border-border object-cover"
            />
          </a>
        ) : (
          <a
            key={f.name}
            href={f.url}
            target="_blank"
            rel="noreferrer"
            className="flex h-28 items-center justify-center rounded-md border border-border bg-card p-2 text-center text-xs font-medium text-foreground underline underline-offset-2 hover:decoration-2 break-all"
          >
            {f.name}
          </a>
        ),
      )}
    </div>
  );
}
