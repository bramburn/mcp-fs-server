import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import App from './App';

// App uses the Zustand store and hostIpc; we keep those real but
// spy on window message listeners to ensure they are wired correctly.

describe('App root (React)', () => {
  const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
  const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the Search view by default', () => {
    render(<App />);

    expect(
      screen.getByText('Semantic Code Search')
    ).toBeInTheDocument();
  });

  it('registers and cleans up window message event listener', () => {
    const { unmount } = render(<App />);

    expect(addEventListenerSpy).toHaveBeenCalledWith(
      'message',
      expect.any(Function)
    );

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      'message',
      expect.any(Function)
    );
  });
});