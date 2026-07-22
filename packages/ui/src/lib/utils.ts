import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge class names with Tailwind-aware conflict resolution (shadcn's `cn`).
 * Later classes win over earlier conflicting ones.
 *
 * @example cn("px-2 py-1", condition && "px-4") // -> "py-1 px-4"
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
