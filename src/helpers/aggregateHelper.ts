import { Timestamp } from 'firebase-admin/firestore';
import { Event, SessionAggregates } from '../types';

/**
 * Computes session aggregates from a list of events
 * Events should be sorted by timestamp before calling this function
 */
export function computeAggregates(events: Event[]): SessionAggregates {
  if (events.length === 0) {
    throw new Error('Cannot compute aggregates from empty event list');
  }

  const sorted = [...events].sort(
    (a, b) => a.timestamp.toMillis() - b.timestamp.toMillis()
  );

  const totalDuration = sum(sorted.map((e) => e.duration));
  const totalDistance = sum(sorted.map((e) => e.distance));
  const totalCalories = sum(sorted.map((e) => e.calories));
  const totalSteps = sum(sorted.map((e) => e.steps));

  return {
    startTime: sorted[0].timestamp,
    endTime: sorted[sorted.length - 1].timestamp,
    totalDuration,
    totalDistance,
    totalCalories,
    totalSteps,
    eventCount: sorted.length,
    lastEventTime: sorted[sorted.length - 1].timestamp,
  };
}

/**
 * Helper function to safely sum numbers
 */
function sum(numbers: number[]): number {
  return numbers.reduce((acc, val) => acc + (val || 0), 0);
}

/**
 * Creates default session aggregates for a new session
 */
export function defaultAggregates(timestamp: Timestamp): SessionAggregates {
  return {
    startTime: timestamp,
    endTime: timestamp,
    totalDuration: 0,
    totalDistance: 0,
    totalCalories: 0,
    totalSteps: 0,
    eventCount: 0,
    lastEventTime: timestamp,
  };
}
