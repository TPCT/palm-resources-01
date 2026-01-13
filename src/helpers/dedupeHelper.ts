import { Timestamp } from 'firebase-admin/firestore';
import { db, COLLECTIONS } from '../config/firestore';
import { Event } from '../types';

/**
 * Checks if an event with the given eventId already exists
 */
export async function isEventDuplicate(
  sessionId: string,
  eventId: string
): Promise<boolean> {
  const eventRef = db
    .collection(COLLECTIONS.SESSIONS)
    .doc(sessionId)
    .collection(COLLECTIONS.EVENTS)
    .doc(eventId);

  const doc = await eventRef.get();
  return doc.exists;
}

/**
 * Merges event data (for partial updates)
 * Incoming event takes precedence for non-null values
 */
export function mergeEventData(
  existing: Event,
  incoming: Partial<Event>
): Event {
  return {
    ...existing,
    ...incoming,
    // Preserve original ingestedAt and version unless explicitly updating
    ingestedAt: incoming.ingestedAt ?? existing.ingestedAt,
    version: existing.version + 1, // Increment version on update
  };
}

/**
 * Validates if an event is out of order relative to existing events
 */
export interface OrderValidationResult {
  isOutOfOrder: boolean;
  expectedSequence?: number;
  actualSequence?: number;
}

export function validateEventOrder(
  existingEvents: Event[],
  newEvent: Event
): OrderValidationResult {
  if (existingEvents.length === 0) {
    return { isOutOfOrder: false };
  }

  const sorted = [...existingEvents].sort(
    (a, b) => a.timestamp.toMillis() - b.timestamp.toMillis()
  );

  const lastEvent = sorted[sorted.length - 1];
  const isOutOfOrder = newEvent.timestamp.toMillis() < lastEvent.timestamp.toMillis();

  return {
    isOutOfOrder,
    expectedSequence: sorted.length + 1,
    actualSequence: sorted.findIndex(
      (e) => e.timestamp.toMillis() > newEvent.timestamp.toMillis()
    ) + 1,
  };
}
