import * as React from 'react';
import { cn } from '../../lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', onFocus, ...props }, ref) => {
    const handleFocus: React.FocusEventHandler<HTMLInputElement> = (event) => {
      // Mirror React version's placeholder logging hook where we could
      // later send a WebviewFocusChanged command if desired.
      // eslint-disable-next-line no-console
      console.log(
        'Input focused - Ready to send WebviewFocusChangedCommand if needed'
      );

      onFocus?.(event);
    };

    return (
      <input
        ref={ref}
        type={type}
        className={cn(
          'vscode-input',
          'text-[13px] leading-[1.4] rounded-[2px] border border-[color:var(--vscode-input-border,transparent)]',
          'px-2 py-[6px] font-sans outline-none transition-colors',
          'text-[color:var(--vscode-input-foreground)]',
          'bg-[color:var(--vscode-input-background)]',
          'placeholder:text-[color:var(--vscode-input-placeholderForeground)]',
          'focus:border-[color:var(--vscode-focusBorder)]',
          'focus:outline focus:outline-[1px] focus:outline-[color:var(--vscode-focusBorder)] focus:outline-offset-[-1px]',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          className
        )}
        onFocus={handleFocus}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';

export { Input };