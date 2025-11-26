/**
 * React-based command palette exports.
 *
 * This file previously re-exported Svelte components; it now re-exports the
 * React `cmdk`-based primitives from `command.tsx` so that TypeScript no
 * longer needs Svelte runtime types to build the webview.
 */
export {
  Command as Root,
  CommandInput as Input,
  CommandList as List,
  CommandItem as Item,
  CommandGroup as Group,
  CommandSeparator as Separator,
  CommandEmpty as Empty,
  CommandLoading as Loading,
} from '../command';
