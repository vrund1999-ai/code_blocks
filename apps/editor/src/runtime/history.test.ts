import { describe, expect, it } from 'vitest';
import { MAX_HISTORY, popScreen, pushScreen } from './history';

describe('screen history', () => {
  it('remembers the screen being left', () => {
    expect(pushScreen([], 'home', 'details')).toEqual(['home']);
    expect(pushScreen(['home'], 'details', 'settings')).toEqual(['home', 'details']);
  });

  it('adds nothing when going to the screen already shown, or before any screen', () => {
    expect(pushScreen(['home'], 'details', 'details')).toEqual(['home']);
    expect(pushScreen([], null, 'home')).toEqual([]);
  });

  it('keeps only the latest screens', () => {
    let history: string[] = [];
    for (let i = 0; i < MAX_HISTORY + 10; i++) history = pushScreen(history, `s${i}`, `s${i + 1}`);
    expect(history).toHaveLength(MAX_HISTORY);
    expect(history.at(-1)).toBe(`s${MAX_HISTORY + 9}`);
    expect(history[0]).toBe('s10');
  });

  it('goes back to the latest screen', () => {
    expect(popScreen(['home', 'details'], () => true)).toEqual({ screenId: 'details', history: ['home'] });
  });

  it('skips screens that were deleted, and has nowhere to go when none are left', () => {
    const exists = (id: string) => id !== 'gone';
    expect(popScreen(['home', 'gone'], exists)).toEqual({ screenId: 'home', history: [] });
    expect(popScreen(['gone'], exists)).toEqual({ screenId: undefined, history: [] });
    expect(popScreen([], exists)).toEqual({ screenId: undefined, history: [] });
  });
});
