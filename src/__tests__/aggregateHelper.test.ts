import { Timestamp } from 'firebase-admin/firestore';
import { computeAggregates, defaultAggregates } from '../helpers/aggregateHelper';
import { Event } from '../types';

describe('AggregateHelper', () => {
  describe('computeAggregates', () => {
    it('should compute correct aggregates from sorted events', () => {
      const events: Event[] = [
        {
          eventId: 'e1',
          timestamp: Timestamp.fromMillis(100),
          duration: 10,
          distance: 100,
          calories: 10,
          steps: 100,
          ingestedAt: Timestamp.now(),
          version: 1,
        },
        {
          eventId: 'e2',
          timestamp: Timestamp.fromMillis(200),
          duration: 20,
          distance: 200,
          calories: 20,
          steps: 200,
          ingestedAt: Timestamp.now(),
          version: 1,
        },
        {
          eventId: 'e3',
          timestamp: Timestamp.fromMillis(300),
          duration: 30,
          distance: 300,
          calories: 30,
          steps: 300,
          ingestedAt: Timestamp.now(),
          version: 1,
        },
      ];

      const aggregates = computeAggregates(events);

      expect(aggregates.totalDuration).toBe(60); // 10 + 20 + 30
      expect(aggregates.totalDistance).toBe(600); // 100 + 200 + 300
      expect(aggregates.totalCalories).toBe(60); // 10 + 20 + 30
      expect(aggregates.totalSteps).toBe(600); // 100 + 200 + 300
      expect(aggregates.eventCount).toBe(3);
      expect(aggregates.startTime.toMillis()).toBe(100);
      expect(aggregates.endTime.toMillis()).toBe(300);
    });

    it('should sort events by timestamp before computing', () => {
      const events: Event[] = [
        {
          eventId: 'e3',
          timestamp: Timestamp.fromMillis(300),
          duration: 30,
          distance: 300,
          calories: 30,
          steps: 300,
          ingestedAt: Timestamp.now(),
          version: 1,
        },
        {
          eventId: 'e1',
          timestamp: Timestamp.fromMillis(100),
          duration: 10,
          distance: 100,
          calories: 10,
          steps: 100,
          ingestedAt: Timestamp.now(),
          version: 1,
        },
        {
          eventId: 'e2',
          timestamp: Timestamp.fromMillis(200),
          duration: 20,
          distance: 200,
          calories: 20,
          steps: 200,
          ingestedAt: Timestamp.now(),
          version: 1,
        },
      ];

      const aggregates = computeAggregates(events);

      // Should still compute correctly despite out-of-order input
      expect(aggregates.totalDistance).toBe(600);
      expect(aggregates.startTime.toMillis()).toBe(100);
      expect(aggregates.endTime.toMillis()).toBe(300);
    });

    it('should throw error for empty events', () => {
      expect(() => computeAggregates([])).toThrow();
    });
  });

  describe('defaultAggregates', () => {
    it('should create default aggregates with zero values', () => {
      const timestamp = Timestamp.now();
      const aggregates = defaultAggregates(timestamp);

      expect(aggregates.totalDuration).toBe(0);
      expect(aggregates.totalDistance).toBe(0);
      expect(aggregates.totalCalories).toBe(0);
      expect(aggregates.totalSteps).toBe(0);
      expect(aggregates.eventCount).toBe(0);
      expect(aggregates.startTime).toEqual(timestamp);
      expect(aggregates.endTime).toEqual(timestamp);
    });
  });
});
