import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { fly, scale } from "svelte/transition"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const flyAndScale = (
  node: Element,
  params?: any
) => {
  const scaleConversion = (
    valueA: number,
    scaleA: [number, number],
    scaleB: [number, number]
  ) => {
    const [minA, maxA] = scaleA
    const [minB, maxB] = scaleB

    const percentage = (valueA - minA) / (maxA - minA)
    const valueB = percentage * (maxB - minB) + minB

    return valueB
  }

  const styleToString = (
    style: Record<string, number | string | undefined>
  ): string => {
    return Object.keys(style).reduce((str, key) => {
      if (style[key] === undefined) return str
      return str + `${key}:${style[key]};`
    }, "")
  }

  return {
    duration: params?.duration ?? 200,
    delay: params?.delay ?? 0,
    css: (t: number) => {
      const y = scaleConversion(t, [0, 1], [20, 0])
      const x = scaleConversion(t, [0, 1], [-20, 0])
      const scale = scaleConversion(t, [0, 1], [0.9, 1])

      return styleToString({
        transform: `translate3d(${x}px, ${y}px, 0) scale(${scale})`,
        opacity: t,
      })
    },
  }
}

