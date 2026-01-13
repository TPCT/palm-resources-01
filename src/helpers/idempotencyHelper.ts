import { Timestamp } from 'firebase-admin/firestore';
import { db, COLLECTIONS } from '../config/firestore';
import { IdempotencyRecord, IdempotencyResult } from '../types';

const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60; // 24 hours

/**
 * Checks if a request with this idempotency key has already been processed
 */
export async function checkIdempotency(
  idempotencyKey: string
): Promise<IdempotencyResult> {
  const idempotencyRef = db
    .collection(COLLECTIONS.IDEMPOTENCY)
    .doc(idempotencyKey);

  const doc = await idempotencyRef.get();

  if (!doc.exists) {
    return { isDuplicate: false };
  }

  const data = doc.data() as IdempotencyRecord;

  // Check if expired
  if (data.expiresAt.toMillis() < Date.now()) {
    // Clean up expired record
    await idempotencyRef.delete();
    return { isDuplicate: false };
  }

  // If completed, return cached response
  if (data.status === 'completed') {
    return {
      isDuplicate: true,
      cachedResponse: data.response,
    };
  }

  // If processing, it's a duplicate request (race condition)
  // Return null to indicate we should wait or retry
  return { isDuplicate: true };
}

/**
 * Marks an idempotency key as processing
 */
export async function markProcessing(
  idempotencyKey: string,
  sessionId: string
): Promise<void> {
  const now = Timestamp.now();
  const expiresAt = Timestamp.fromMillis(
    now.toMillis() + IDEMPOTENCY_TTL_SECONDS * 1000
  );

  const idempotencyRef = db
    .collection(COLLECTIONS.IDEMPOTENCY)
    .doc(idempotencyKey);

  await idempotencyRef.set({
    sessionId,
    status: 'processing',
    response: {},
    createdAt: now,
    expiresAt,
  } as IdempotencyRecord);
}

/**
 * Caches the response for an idempotency key
 */
export async function cacheResponse(
  idempotencyKey: string,
  sessionId: string,
  response: object
): Promise<void> {
  const now = Timestamp.now();
  const expiresAt = Timestamp.fromMillis(
    now.toMillis() + IDEMPOTENCY_TTL_SECONDS * 1000
  );

  const idempotencyRef = db
    .collection(COLLECTIONS.IDEMPOTENCY)
    .doc(idempotencyKey);

  await idempotencyRef.set(
    {
      sessionId,
      status: 'completed',
      response,
      createdAt: now,
      expiresAt,
    } as IdempotencyRecord,
    { merge: true }
  );
}

/**
 * Marks an idempotency key as failed
 */
export async function markFailed(
  idempotencyKey: string,
  sessionId: string,
  error: object
): Promise<void> {
  const now = Timestamp.now();
  const expiresAt = Timestamp.fromMillis(
    now.toMillis() + IDEMPOTENCY_TTL_SECONDS * 1000
  );

  const idempotencyRef = db
    .collection(COLLECTIONS.IDEMPOTENCY)
    .doc(idempotencyKey);

  await idempotencyRef.set(
    {
      sessionId,
      status: 'failed',
      response: { error },
      createdAt: now,
      expiresAt,
    } as IdempotencyRecord,
    { merge: true }
  );
}
