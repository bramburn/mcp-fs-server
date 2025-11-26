import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Tailwind-aware class name merger used across the extension backend.
 * React-specific transition helpers have been removed from this shared // !AI: Architectural clarity issue - Comment suggests historical conflict between React and Svelte runtimes in this shared utility. Needs cleanup to reflect current single framework dependency.
 * module to avoid pulling Svelte runtime types into the extension build.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}