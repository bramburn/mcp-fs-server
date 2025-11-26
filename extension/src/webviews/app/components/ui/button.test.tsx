import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from './button';

describe('Button (ui/button)', () => {
  it('renders children', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('forwards onClick handler', () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click</Button>);

    fireEvent.click(screen.getByText('Click'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('applies variant and size classes', () => {
    render(
      <Button variant="secondary" size="sm">
        Small secondary
      </Button>
    );

    const btn = screen.getByText('Small secondary');
    expect(btn.className).toMatch(/bg-secondary/);
    expect(btn.className).toMatch(/h-8/);
  });

  it('can render as child component via asChild', () => {
    render(
      <Button asChild>
        <a href="#test">Link button</a>
      </Button>
    );

    const link = screen.getByText('Link button');
    expect(link.tagName.toLowerCase()).toBe('a');
  });
});