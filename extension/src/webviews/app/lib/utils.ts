import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { cubicOut } from "svelte/easing";
import type { TransitionConfig } from "svelte/transition";



export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

type FlyAndScaleParams = {
	y?: number;
	x?: number;
	start?: number;
	duration?: number;
};

export const flyAndScale = (
	node: Element,
	params: FlyAndScaleParams = { y: -8, x: 0, start: 0.95, duration: 150 }
): TransitionConfig => {
	const style = getComputedStyle(node);
	const transform = style.transform === "none" ? "" : style.transform;

	const scaleConversion = (
		valueA: number,
		scaleA: [number, number],
		scaleB: [number, number]
	) => {
		const [minA, maxA] = scaleA;
		const [minB, maxB] = scaleB;

		const percentage = (valueA - minA) / (maxA - minA);
		const valueB = percentage * (maxB - minB) + minB;

		return valueB;
	};

	const styleToString = (
		style: Record<string, number | string | undefined>
	): string => {
		return Object.keys(style).reduce((str, key) => {
			if (style[key] === undefined) return str;
			return str + `${key}:${style[key]};`;
		}, "");
	};

	return {
		duration: params.duration ?? 200,
		delay: 0,
		css: (t) => {
			const y = scaleConversion(t, [0, 1], [params.y ?? 5, 0]);
			const x = scaleConversion(t, [0, 1], [params.x ?? 0, 0]);
			const scale = scaleConversion(t, [0, 1], [params.start ?? 0.95, 1]);

			return styleToString({
				transform: `${transform} translate3d(${x}px, ${y}px, 0) scale(${scale})`,
				opacity: t
			});
		},
		easing: cubicOut
	};
};

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