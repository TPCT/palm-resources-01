import { Timestamp } from 'firebase-admin/firestore';

/**
 * Exercise event document structure
 */
export interface Event {
  eventId: string; // unique per event (idempotency key)
  timestamp: Timestamp;
  duration: number; // seconds since last event
  distance: number; // meters
  calories: number;
  steps: number;
  sequenceNumber?: number; // client-provided or server-assigned
  ingestedAt: Timestamp;
  version: number;
}

/**
 * Raw event payload from client
 */
export interface RawEventPayload {
  eventId: string;
  sessionId: string;
  userId: string;
  timestamp: string | number | Timestamp; // ISO string, millis, or Timestamp
  duration?: number;
  distance?: number;
  calories?: number;
  steps?: number;
  sequenceNumber?: number;
  idempotencyKey?: string; // Optional, can also come from headers
}

/**
 * Normalized event payload (after validation)
 */
export interface NormalizedEventPayload {
  eventId: string;
  sessionId: string;
  userId: string;
  timestamp: Timestamp;
  duration: number;
  distance: number;
  calories: number;
  steps: number;
  sequenceNumber?: number;
}
