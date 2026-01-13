import { Timestamp } from 'firebase-admin/firestore';

/**
 * Exercise session document structure
 */
export interface Session {
  userId: string;
  startTime: Timestamp;
  endTime: Timestamp | null;
  totalDuration: number; // seconds
  totalDistance: number; // meters
  totalCalories: number;
  totalSteps: number;
  eventCount: number;
  lastEventTime: Timestamp;
  version: number; // for optimistic concurrency
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Partial session for updates
 */
export type SessionUpdate = Partial<Omit<Session, 'userId' | 'createdAt'>> & {
  updatedAt: Timestamp;
};

/**
 * Session aggregates computed from events
 */
export interface SessionAggregates {
  startTime: Timestamp;
  endTime: Timestamp;
  totalDuration: number;
  totalDistance: number;
  totalCalories: number;
  totalSteps: number;
  eventCount: number;
  lastEventTime: Timestamp;
}
