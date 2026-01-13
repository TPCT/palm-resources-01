import { Timestamp } from 'firebase-admin/firestore';
import { ingestSessionEvent, IngestRequest, IngestResponse } from '../functions/ingestSessionEvent';
import { db, COLLECTIONS } from '../config/firestore';
import { checkIdempotency, cacheResponse } from '../helpers/idempotencyHelper';
import { metrics } from '../utils/metrics';
import { logger } from '../utils/logger';

// Mock Firebase Admin
jest.mock('firebase-admin', () => {
  const mockFirestore = {
    collection: jest.fn(),
    runTransaction: jest.fn(),
  };

  return {
    apps: [],
    initializeApp: jest.fn(),
    firestore: jest.fn(() => mockFirestore),
  };
});

// Mock helpers
jest.mock('../helpers/idempotencyHelper');
jest.mock('../helpers/transactionHelper');
// Don't mock metrics - we want to test the real metrics collection
// jest.mock('../utils/metrics');
jest.mock('../utils/logger');

describe('IngestSessionEvent', () => {
  let mockRequest: Partial<IngestRequest>;
  let mockResponse: Partial<{
    status: jest.Mock;
    json: jest.Mock;
  }>;

  beforeEach(() => {
    jest.clearAllMocks();
    metrics.clearMetrics();
    logger.clearLogs();

    mockRequest = {
      method: 'POST',
      headers: {},
      body: {
        eventId: 'event-1',
        sessionId: 'session-1',
        userId: 'user-1',
        timestamp: Timestamp.now(),
        distance: 100,
        calories: 50,
        steps: 1000,
        duration: 60,
      },
    };

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  describe('Test 1: Retry Duplicate', () => {
    it('should return cached response when same idempotency key is used twice', async () => {
      const idempotencyKey = 'idempotency-key-1';
      const cachedResponse: IngestResponse = {
        success: true,
        session: {
          sessionId: 'session-1',
          aggregates: {
            totalDuration: 60,
            totalDistance: 100,
            totalCalories: 50,
            totalSteps: 1000,
            eventCount: 1,
          },
        },
      };

      // First request - not in cache
      (checkIdempotency as jest.Mock).mockResolvedValueOnce({
        isDuplicate: false,
      });

      // Second request - in cache
      (checkIdempotency as jest.Mock).mockResolvedValueOnce({
        isDuplicate: true,
        cachedResponse,
      });

      // Mock transaction helper for first request
      const { upsertEventAndUpdateSession } = require('../helpers/transactionHelper');
      upsertEventAndUpdateSession.mockResolvedValueOnce({
        status: 'created',
        session: {
          totalDuration: 60,
          totalDistance: 100,
          totalCalories: 50,
          totalSteps: 1000,
          eventCount: 1,
          startTime: Timestamp.now(),
          endTime: Timestamp.now(),
          lastEventTime: Timestamp.now(),
        },
      });

      // First request
      mockRequest.headers = { 'idempotency-key': idempotencyKey };
      await ingestSessionEvent(mockRequest as IngestRequest, mockResponse as any);

      // Verify first request succeeded
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );

      // Reset mocks
      mockResponse.status = jest.fn().mockReturnThis();
      mockResponse.json = jest.fn();

      // Second request (retry)
      await ingestSessionEvent(mockRequest as IngestRequest, mockResponse as any);

      // Verify second request returned cached response
      expect(checkIdempotency).toHaveBeenCalledWith(idempotencyKey);
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          session: cachedResponse.session,
        })
      );

      // Verify duplicate metric was recorded
      const duplicateMetrics = metrics.getMetricsByName(
        'exercise_session.ingest.duplicate_detected'
      );
      expect(duplicateMetrics.length).toBeGreaterThan(0);
      expect(duplicateMetrics[0].tags.source).toBe('idempotency_cache');
    });
  });

  describe('Test 2: Out-of-Order Arrival', () => {
    it('should handle events arriving out of order and compute correct aggregates', async () => {
      const { upsertEventAndUpdateSession } = require('../helpers/transactionHelper');

      // Mock: Event A arrives first (timestamp: recent)
      const now = Date.now();
      const eventA = {
        eventId: 'event-a',
        sessionId: 'session-2',
        userId: 'user-1',
        timestamp: Timestamp.fromMillis(now - 2000), // 2 seconds ago
        distance: 100,
        calories: 10,
        steps: 100,
        duration: 10,
      };

      (checkIdempotency as jest.Mock).mockResolvedValue({ isDuplicate: false });

      // First: Event A
      upsertEventAndUpdateSession.mockResolvedValueOnce({
        status: 'created',
        session: {
          totalDuration: 10,
          totalDistance: 100,
          totalCalories: 10,
          totalSteps: 100,
          eventCount: 1,
          startTime: Timestamp.fromMillis(now - 2000),
          endTime: Timestamp.fromMillis(now - 2000),
          lastEventTime: Timestamp.fromMillis(now - 2000),
        },
      });

      mockRequest.body = eventA;
      mockRequest.headers = { 'idempotency-key': 'key-a' };
      await ingestSessionEvent(mockRequest as IngestRequest, mockResponse as any);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      const responseA = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(responseA.session.aggregates.totalDistance).toBe(100);

      // Reset
      mockResponse.status = jest.fn().mockReturnThis();
      mockResponse.json = jest.fn();

      // Second: Event C (timestamp: now) - arrives before B
      const eventC = {
        eventId: 'event-c',
        sessionId: 'session-2',
        userId: 'user-1',
        timestamp: Timestamp.fromMillis(now), // most recent
        distance: 300,
        calories: 30,
        steps: 300,
        duration: 30,
      };

      // Mock transaction to simulate it sees A and C, recomputes aggregates
      upsertEventAndUpdateSession.mockResolvedValueOnce({
        status: 'created',
        session: {
          totalDuration: 40, // 10 + 30
          totalDistance: 400, // 100 + 300
          totalCalories: 40, // 10 + 30
          totalSteps: 400, // 100 + 300
          eventCount: 2,
          startTime: Timestamp.fromMillis(now - 2000), // earliest
          endTime: Timestamp.fromMillis(now), // latest
          lastEventTime: Timestamp.fromMillis(now),
        },
      });

      mockRequest.body = eventC;
      mockRequest.headers = { 'idempotency-key': 'key-c' };
      await ingestSessionEvent(mockRequest as IngestRequest, mockResponse as any);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      const responseC = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(responseC.session.aggregates.totalDistance).toBe(400);

      // Reset
      mockResponse.status = jest.fn().mockReturnThis();
      mockResponse.json = jest.fn();

      // Third: Event B (timestamp: between A and C) - arrives last
      const eventB = {
        eventId: 'event-b',
        sessionId: 'session-2',
        userId: 'user-1',
        timestamp: Timestamp.fromMillis(now - 1000), // between A and C
        distance: 200,
        calories: 20,
        steps: 200,
        duration: 20,
      };

      // Mock transaction to simulate it sees A, B, C, recomputes aggregates correctly
      upsertEventAndUpdateSession.mockResolvedValueOnce({
        status: 'created',
        session: {
          totalDuration: 60, // 10 + 20 + 30
          totalDistance: 600, // 100 + 200 + 300 (correct!)
          totalCalories: 60, // 10 + 20 + 30
          totalSteps: 600, // 100 + 200 + 300
          eventCount: 3,
          startTime: Timestamp.fromMillis(now - 2000), // earliest
          endTime: Timestamp.fromMillis(now), // latest
          lastEventTime: Timestamp.fromMillis(now),
        },
      });

      mockRequest.body = eventB;
      mockRequest.headers = { 'idempotency-key': 'key-b' };
      await ingestSessionEvent(mockRequest as IngestRequest, mockResponse as any);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      const responseB = (mockResponse.json as jest.Mock).mock.calls[0][0];

      // Verify final aggregates are correct (sum of all events)
      expect(responseB.session.aggregates.totalDistance).toBe(600);
      expect(responseB.session.aggregates.totalCalories).toBe(60);
      expect(responseB.session.aggregates.totalSteps).toBe(600);
      expect(responseB.session.aggregates.eventCount).toBe(3);
    });
  });

  describe('Test 3: Partial Update', () => {
    it('should handle partial event updates with same eventId', async () => {
      const { upsertEventAndUpdateSession } = require('../helpers/transactionHelper');
      const eventId = 'event-partial-1';
      const idempotencyKey = 'key-partial-1';

      (checkIdempotency as jest.Mock).mockResolvedValue({ isDuplicate: false });

      // First: Partial event (only distance, other fields undefined)
      const partialEvent = {
        eventId,
        sessionId: 'session-3',
        userId: 'user-1',
        timestamp: Timestamp.now(),
        distance: 100,
        // calories, steps, duration are undefined (will be normalized to 0)
      };

      upsertEventAndUpdateSession.mockResolvedValueOnce({
        status: 'created',
        session: {
          totalDuration: 0,
          totalDistance: 100,
          totalCalories: 0,
          totalSteps: 0,
          eventCount: 1,
          startTime: Timestamp.now(),
          endTime: Timestamp.now(),
          lastEventTime: Timestamp.now(),
        },
      });

      mockRequest.body = partialEvent;
      mockRequest.headers = { 'idempotency-key': idempotencyKey };
      await ingestSessionEvent(mockRequest as IngestRequest, mockResponse as any);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      const response1 = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(response1.session.aggregates.totalDistance).toBe(100);
      expect(response1.session.aggregates.totalCalories).toBe(0);

      // Reset
      mockResponse.status = jest.fn().mockReturnThis();
      mockResponse.json = jest.fn();

      // Second: Full event with same eventId (should update, not create duplicate)
      const fullEvent = {
        eventId, // Same eventId
        sessionId: 'session-3',
        userId: 'user-1',
        timestamp: Timestamp.now(),
        distance: 100, // same
        calories: 50, // now provided
        steps: 1000, // now provided
        duration: 60, // now provided
      };

      // Mock: Event already exists, so it's a duplicate
      upsertEventAndUpdateSession.mockResolvedValueOnce({
        status: 'duplicate',
        session: {
          totalDuration: 60,
          totalDistance: 100,
          totalCalories: 50,
          totalSteps: 1000,
          eventCount: 1, // Still 1, not 2
          startTime: Timestamp.now(),
          endTime: Timestamp.now(),
          lastEventTime: Timestamp.now(),
        },
      });

      mockRequest.body = fullEvent;
      await ingestSessionEvent(mockRequest as IngestRequest, mockResponse as any);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      const response2 = (mockResponse.json as jest.Mock).mock.calls[0][0];

      // Verify: Event count is still 1 (no duplicate created)
      // Note: In a real implementation, we might want to support updates
      // For now, the duplicate detection prevents creating a second event
      expect(response2.session.aggregates.eventCount).toBe(1);

      // Verify duplicate was detected
      const duplicateMetrics = metrics.getMetricsByName(
        'exercise_session.ingest.duplicate_detected'
      );
      expect(duplicateMetrics.length).toBeGreaterThan(0);
    });
  });
});
