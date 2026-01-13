import { Request, Response } from 'express';
import { Timestamp } from 'firebase-admin/firestore';
import { RawEventPayload, NormalizedEventPayload, Event } from '../types';
import { validatePayload } from '../utils/validator';
import { normalizePayload } from '../utils/normalizer';
import {
  checkIdempotency,
  markProcessing,
  cacheResponse,
  markFailed,
} from '../helpers/idempotencyHelper';
import { upsertEventAndUpdateSession } from '../helpers/transactionHelper';
import { validateEventOrder } from '../helpers/dedupeHelper';
import { logger } from '../utils/logger';
import { metrics } from '../utils/metrics';

export interface IngestRequest extends Request {
  body: RawEventPayload;
}

export interface IngestResponse {
  success: boolean;
  session?: {
    sessionId: string;
    aggregates: {
      totalDuration: number;
      totalDistance: number;
      totalCalories: number;
      totalSteps: number;
      eventCount: number;
    };
  };
  error?: string;
  errors?: string[];
}

/**
 * Main ingest handler for exercise session events
 */
export async function ingestSessionEvent(
  req: IngestRequest,
  res: Response<IngestResponse>
): Promise<void> {
  const startTime = Date.now();
  let idempotencyKey: string | null = null;
  let sessionId: string | null = null;
  let userId: string | null = null;

  try {
    // 1. Extract idempotency key from headers or body
    idempotencyKey =
      (req.headers['idempotency-key'] as string) ||
      req.body.idempotencyKey ||
      req.body.eventId;

    if (!idempotencyKey) {
      res.status(400).json({
        success: false,
        error: 'Idempotency key is required (header: idempotency-key or body: idempotencyKey/eventId)',
      });
      return;
    }

    // 2. Check idempotency cache
    const idempotencyResult = await checkIdempotency(idempotencyKey);
    if (idempotencyResult.isDuplicate && idempotencyResult.cachedResponse) {
      metrics.recordDuplicate(
        (idempotencyResult.cachedResponse as any).sessionId || 'unknown',
        idempotencyKey,
        'idempotency_cache'
      );

      logger.info('ingest_request_duplicate', {
        idempotencyKey,
        source: 'idempotency_cache',
      });

      // Use cached response directly (it already has success: true)
      const cachedResponse = idempotencyResult.cachedResponse as IngestResponse;
      res.status(200).json(cachedResponse);
      return;
    }

    // 3. Validate payload
    const validationResult = validatePayload(req.body);
    if (!validationResult.isValid) {
      metrics.recordValidationFailure(
        req.body.sessionId || 'unknown',
        validationResult.errors.join(', ')
      );

      logger.warn('ingest_request_validation_failed', {
        idempotencyKey,
        errors: validationResult.errors.join(', '),
      });

      res.status(400).json({
        success: false,
        errors: validationResult.errors,
      });
      return;
    }

    // 4. Normalize payload
    const normalized = normalizePayload(req.body);
    sessionId = normalized.sessionId;
    userId = normalized.userId;

    // 5. Mark as processing
    await markProcessing(idempotencyKey, sessionId);

    // 6. Create event object
    const now = Timestamp.now();
    const event: Event = {
      eventId: normalized.eventId,
      timestamp: normalized.timestamp,
      duration: normalized.duration,
      distance: normalized.distance,
      calories: normalized.calories,
      steps: normalized.steps,
      sequenceNumber: normalized.sequenceNumber,
      ingestedAt: now,
      version: 1,
    };

    // 7. Execute transaction to upsert event and update session
    const result = await upsertEventAndUpdateSession(
      sessionId,
      userId,
      event
    );

    // 8. Check if duplicate (event already existed)
    if (result.status === 'duplicate') {
      metrics.recordDuplicate(sessionId, idempotencyKey, 'event_exists');

      logger.info('ingest_request_duplicate', {
        idempotencyKey,
        sessionId,
        eventId: event.eventId,
        source: 'event_exists',
      });

      // Cache the response
      const response: IngestResponse = {
        success: true,
        session: result.session
          ? {
              sessionId,
              aggregates: {
                totalDuration: result.session.totalDuration,
                totalDistance: result.session.totalDistance,
                totalCalories: result.session.totalCalories,
                totalSteps: result.session.totalSteps,
                eventCount: result.session.eventCount,
              },
            }
          : undefined,
      };

      await cacheResponse(idempotencyKey, sessionId, response);

      res.status(200).json(response);
      return;
    }

    // 9. Log out-of-order detection (would need to fetch events to check)
    // For now, we'll log the event creation
    logger.info('ingest_request', {
      idempotencyKey,
      sessionId,
      eventId: event.eventId,
      timestamp: event.timestamp.toMillis(),
      isDuplicate: false,
      processingTimeMs: Date.now() - startTime,
    });

    // 10. Cache successful response
    const response: IngestResponse = {
      success: true,
      session: result.session
        ? {
            sessionId,
            aggregates: {
              totalDuration: result.session.totalDuration,
              totalDistance: result.session.totalDistance,
              totalCalories: result.session.totalCalories,
              totalSteps: result.session.totalSteps,
              eventCount: result.session.eventCount,
            },
          }
        : undefined,
    };

    await cacheResponse(idempotencyKey, sessionId, response);

    // 11. Record metrics
    metrics.recordDuration(sessionId, Date.now() - startTime);

    res.status(200).json(response);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    logger.error('ingest_request_error', {
      idempotencyKey: idempotencyKey || 'unknown',
      sessionId: sessionId || 'unknown',
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Mark as failed in idempotency cache
    if (idempotencyKey && sessionId) {
      await markFailed(idempotencyKey, sessionId, { error: errorMessage });
    }

    res.status(500).json({
      success: false,
      error: errorMessage,
    });
  }
}
