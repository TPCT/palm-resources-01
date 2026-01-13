import { Timestamp } from 'firebase-admin/firestore';
import { validatePayload, validateTimestamp, validateMetrics } from '../utils/validator';
import { RawEventPayload } from '../types';

describe('Validator', () => {
  describe('validateTimestamp', () => {
    it('should accept valid timestamps', () => {
      const now = Timestamp.now();
      const result = validateTimestamp(now);
      expect(result.isValid).toBe(true);
    });

    it('should reject timestamps too far in the future', () => {
      const future = Timestamp.fromMillis(Date.now() + 2 * 60 * 60 * 1000); // 2 hours
      const result = validateTimestamp(future);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject timestamps too far in the past', () => {
      const past = Timestamp.fromMillis(Date.now() - 31 * 24 * 60 * 60 * 1000); // 31 days
      const result = validateTimestamp(past);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('validateMetrics', () => {
    it('should accept valid metrics', () => {
      const payload: RawEventPayload = {
        eventId: 'test',
        sessionId: 'test',
        userId: 'test',
        timestamp: Timestamp.now(),
        distance: 100,
        calories: 50,
        steps: 1000,
        duration: 60,
      };
      const result = validateMetrics(payload);
      expect(result.isValid).toBe(true);
    });

    it('should reject negative values', () => {
      const payload: RawEventPayload = {
        eventId: 'test',
        sessionId: 'test',
        userId: 'test',
        timestamp: Timestamp.now(),
        distance: -100,
      };
      const result = validateMetrics(payload);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Distance cannot be negative');
    });

    it('should reject values exceeding maximums', () => {
      const payload: RawEventPayload = {
        eventId: 'test',
        sessionId: 'test',
        userId: 'test',
        timestamp: Timestamp.now(),
        distance: 200000, // exceeds 100km max
      };
      const result = validateMetrics(payload);
      expect(result.isValid).toBe(false);
    });
  });

  describe('validatePayload', () => {
    it('should accept valid payload', () => {
      const payload: RawEventPayload = {
        eventId: 'event-1',
        sessionId: 'session-1',
        userId: 'user-1',
        timestamp: Timestamp.now(),
        distance: 100,
        calories: 50,
        steps: 1000,
        duration: 60,
      };
      const result = validatePayload(payload);
      expect(result.isValid).toBe(true);
    });

    it('should reject payload with missing required fields', () => {
      const payload = {
        eventId: 'event-1',
        // missing sessionId, userId, timestamp
      } as RawEventPayload;
      const result = validatePayload(payload);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});
