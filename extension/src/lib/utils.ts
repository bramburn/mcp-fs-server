import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Tailwind-aware class name merger used across the extension backend.
 * Svelte-specific transition helpers have been removed from this shared
 * module to avoid pulling Svelte runtime types into the extension build.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

