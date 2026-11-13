// List cards: what an element inside a List's card shows for its item.

import { findField, toRecord } from '../engine/convert';

/**
 * The item a List card is showing. In the designer the card is drawn once,
 * as a `sample`, using the list's first starting item if it has one.
 */
export interface CardItem {
  item: unknown;
  index: number;
  sample: boolean;
}

/** The value an `item` binding shows on a card. */
export function cardValue(card: CardItem | null, field: string): unknown {
  if (!card) return undefined;
  const name = field.trim();
  let value: unknown;
  if (name === '') value = card.item;
  else {
    const rec = toRecord(card.item);
    const key = findField(rec, name);
    value = key === undefined ? undefined : rec[key];
  }
  // With no real data to show, the designer names the field instead.
  if (card.sample && (value === undefined || value === '')) return `‹${name || 'item'}›`;
  return value;
}
