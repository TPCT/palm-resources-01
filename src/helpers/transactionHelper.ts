import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { db, COLLECTIONS } from '../config/firestore';
import { Event, Session, SessionAggregates } from '../types';
import { isEventDuplicate } from './dedupeHelper';
import { computeAggregates, defaultAggregates } from './aggregateHelper';

export interface UpsertResult {
  status: 'created' | 'duplicate' | 'updated';
  session: SessionAggregates | null;
}

const MAX_TRANSACTION_RETRIES = 3;

/**
 * Upserts an event and updates session aggregates in a transaction
 * Handles out-of-order events by recomputing aggregates from all events
 */
export async function upsertEventAndUpdateSession(
  sessionId: string,
  userId: string,
  event: Event
): Promise<UpsertResult> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_TRANSACTION_RETRIES; attempt++) {
    try {
      return await db.runTransaction(async (transaction) => {
        // 1. Check if event already exists
        const eventRef = db
          .collection(COLLECTIONS.SESSIONS)
          .doc(sessionId)
          .collection(COLLECTIONS.EVENTS)
          .doc(event.eventId);

        const eventDoc = await transaction.get(eventRef);

        if (eventDoc.exists) {
          // Event already processed - idempotent return
          const existingEvent = eventDoc.data() as Event;
          // Still need to return session state
          const sessionRef = db.collection(COLLECTIONS.SESSIONS).doc(sessionId);
          const sessionDoc = await transaction.get(sessionRef);

          if (sessionDoc.exists) {
            const session = sessionDoc.data() as Session;
            return {
              status: 'duplicate',
              session: {
                startTime: session.startTime,
                endTime: session.endTime ?? session.startTime,
                totalDuration: session.totalDuration,
                totalDistance: session.totalDistance,
                totalCalories: session.totalCalories,
                totalSteps: session.totalSteps,
                eventCount: session.eventCount,
                lastEventTime: session.lastEventTime,
              },
            };
          }

          return { status: 'duplicate', session: null };
        }

        // 2. Get or create session
        const sessionRef = db.collection(COLLECTIONS.SESSIONS).doc(sessionId);
        const sessionDoc = await transaction.get(sessionRef);

        // 3. Get all existing events to recompute aggregates
        // Note: Can't use orderBy in transaction, so we get all and sort in memory
        const eventsSnapshot = await transaction.get(
          sessionRef.collection(COLLECTIONS.EVENTS)
        );

        const existingEvents = eventsSnapshot.docs
          .map((doc) => doc.data() as Event)
          .sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis());

        // 4. Insert new event
        transaction.set(eventRef, event);

        // 5. Recompute aggregates from all events (including new one)
        const allEvents = [...existingEvents, event];
        const aggregates = computeAggregates(allEvents);

        // 6. Update or create session
        const now = Timestamp.now();
        const currentVersion = sessionDoc.exists
          ? (sessionDoc.data() as Session).version || 0
          : 0;

        if (sessionDoc.exists) {
          transaction.update(sessionRef, {
            ...aggregates,
            version: currentVersion + 1,
            updatedAt: FieldValue.serverTimestamp(),
          });
        } else {
          transaction.set(sessionRef, {
            userId,
            ...aggregates,
            version: 1,
            createdAt: now,
            updatedAt: now,
          } as Session);
        }

        return { status: 'created', session: aggregates };
      });
    } catch (error) {
      lastError = error as Error;
      // If it's a transaction conflict, retry with exponential backoff
      if (
        attempt < MAX_TRANSACTION_RETRIES - 1 &&
        (error as Error).message.includes('transaction')
      ) {
        await new Promise((resolve) =>
          setTimeout(resolve, Math.pow(2, attempt) * 100)
        );
        continue;
      }
      throw error;
    }
  }

  throw lastError || new Error('Transaction failed after retries');
}
