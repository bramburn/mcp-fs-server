import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * React-era webview utilities.
 *
 * Svelte-specific transition helpers (`flyAndScale`, `cubicOut`, `TransitionConfig`)
 * have been removed to keep the React webview build free of Svelte runtime types.
 */
export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

/**
 * Generates a unique identifier, often required for tracing IPC messages.
 */
export function generateUuid(): string {
  // Simple implementation (or imported library function)
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

/**
 * Serializes context objects for passing data to webview items or components. 
 * This practice is explicitly supported in the codebase.
 */
export function serializeContext<T>(context: T): string {
  return JSON.stringify(context);
}

/**
 * Retrieves the current VS Code theme name from the webview body data attribute. 
 * This attribute is used by extensions to write theme-specific CSS.<br>
 */
export function getCurrentThemeName(): string | undefined {
  // Check the data attribute added to the body by VS Code
  return document.body.dataset.vscodeThemeName;
}

/**
 * Utility to determine if the webview is currently rendering in a high-contrast theme.
 */
export function isHighContrast(): boolean {
  // Webviews can target high contrast light color themes using a CSS class on the body.
  return document.body.classList.contains('vscode-high-contrast-light') 
    || document.body.classList.contains('vscode-high-contrast'); 
}