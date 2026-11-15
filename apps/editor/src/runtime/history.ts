// The screens a running app has shown, for the *Go back* block.

/** How many earlier screens *Go back* can return through. */
export const MAX_HISTORY = 50;

/** The history after going from `from` to `to`. Going to the screen already shown adds nothing. */
export function pushScreen(history: string[], from: string | null, to: string): string[] {
  if (!from || from === to) return history;
  return [...history, from].slice(-MAX_HISTORY);
}

/**
 * The screen to go back to and the history left after it, skipping screens
 * that no longer exist. `screenId` is undefined when there's nowhere to go back to.
 */
export function popScreen(history: string[], exists: (screenId: string) => boolean) {
  const rest = [...history];
  while (rest.length) {
    const screenId = rest.pop()!;
    if (exists(screenId)) return { screenId, history: rest };
  }
  return { screenId: undefined, history: rest };
}
