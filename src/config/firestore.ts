import * as admin from 'firebase-admin';

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

export const db = admin.firestore();

// Collection names
export const COLLECTIONS = {
  SESSIONS: 'sessions',
  EVENTS: 'events',
  IDEMPOTENCY: 'idempotency',
} as const;
