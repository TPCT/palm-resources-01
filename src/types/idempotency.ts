import { Timestamp } from 'firebase-admin/firestore';

/**
 * Idempotency tracking document
 */
export interface IdempotencyRecord {
  sessionId: string;
  status: 'processing' | 'completed' | 'failed';
  response: object; // cached response
  createdAt: Timestamp;
  expiresAt: Timestamp; // TTL for cleanup
}

/**
 * Idempotency check result
 */
export interface IdempotencyResult {
  isDuplicate: boolean;
  cachedResponse?: object;
}
