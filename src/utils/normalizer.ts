import { Timestamp } from 'firebase-admin/firestore';
import { RawEventPayload, NormalizedEventPayload } from '../types';
import { normalizeTimestamp } from './validator';

/**
 * Normalizes raw payload to standardized format
 */
export function normalizePayload(
  payload: RawEventPayload
): NormalizedEventPayload {
  const timestamp = normalizeTimestamp(payload.timestamp);

  return {
    eventId: payload.eventId,
    sessionId: payload.sessionId,
    userId: payload.userId,
    timestamp,
    duration: payload.duration ?? 0,
    distance: payload.distance ?? 0,
    calories: payload.calories ?? 0,
    steps: payload.steps ?? 0,
    sequenceNumber: payload.sequenceNumber,
  };
}
