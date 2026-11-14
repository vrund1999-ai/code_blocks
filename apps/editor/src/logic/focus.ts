// Asks the logic graph to zoom to a block, such as from the error pill's
// "show me" or the Inspector's "add logic". Kept apart from React Flow, so the
// rest of the editor can ask before the Logic tab (loaded on its own) is open.

import { create } from 'zustand';

interface FocusState {
  /** The block to zoom to once the graph is shown, or null. */
  blockId: string | null;
}

export const useFocusStore = create<FocusState>()(() => ({ blockId: null }));

/** Zooms the logic graph to `blockId` when it's next shown, or right away if it is. */
export const focusBlock = (blockId: string) => useFocusStore.setState({ blockId });
