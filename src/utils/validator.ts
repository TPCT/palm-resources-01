import { Timestamp } from 'firebase-admin/firestore';
import { RawEventPayload } from '../types';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export interface ValidationConstraints {
  maxDistance: number; // meters
  maxCalories: number;
  maxSteps: number;
  maxDuration: number; // seconds
  maxFutureOffset: number; // seconds (allow some clock drift)
  maxPastOffset: number; // seconds (30 days)
}

const DEFAULT_CONSTRAINTS: ValidationConstraints = {
  maxDistance: 100000, // 100km
  maxCalories: 10000,
  maxSteps: 100000,
  maxDuration: 86400, // 24 hours
  maxFutureOffset: 3600, // 1 hour
  maxPastOffset: 2592000, // 30 days
};

/**
 * Validates timestamp is within reasonable bounds
 */
export function validateTimestamp(
  timestamp: Timestamp,
  constraints: ValidationConstraints = DEFAULT_CONSTRAINTS
): ValidationResult {
  const errors: string[] = [];
  const now = Timestamp.now();
  const timestampMillis = timestamp.toMillis();
  const nowMillis = now.toMillis();

  // Check if timestamp is too far in the future
  const futureOffset = (timestampMillis - nowMillis) / 1000;
  if (futureOffset > constraints.maxFutureOffset) {
    errors.push(
      `Timestamp is too far in the future: ${futureOffset}s ahead (max: ${constraints.maxFutureOffset}s)`
    );
  }

  // Check if timestamp is too far in the past
  const pastOffset = (nowMillis - timestampMillis) / 1000;
  if (pastOffset > constraints.maxPastOffset) {
    errors.push(
      `Timestamp is too far in the past: ${pastOffset}s ago (max: ${constraints.maxPastOffset}s)`
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validates metrics are within reasonable bounds
 */
export function validateMetrics(
  payload: RawEventPayload,
  constraints: ValidationConstraints = DEFAULT_CONSTRAINTS
): ValidationResult {
  const errors: string[] = [];

  // Validate distance
  if (payload.distance !== undefined) {
    if (payload.distance < 0) {
      errors.push('Distance cannot be negative');
    } else if (payload.distance > constraints.maxDistance) {
      errors.push(
        `Distance exceeds maximum: ${payload.distance}m (max: ${constraints.maxDistance}m)`
      );
    }
  }

  // Validate calories
  if (payload.calories !== undefined) {
    if (payload.calories < 0) {
      errors.push('Calories cannot be negative');
    } else if (payload.calories > constraints.maxCalories) {
      errors.push(
        `Calories exceeds maximum: ${payload.calories} (max: ${constraints.maxCalories})`
      );
    }
  }

  // Validate steps
  if (payload.steps !== undefined) {
    if (payload.steps < 0) {
      errors.push('Steps cannot be negative');
    } else if (!Number.isInteger(payload.steps)) {
      errors.push('Steps must be an integer');
    } else if (payload.steps > constraints.maxSteps) {
      errors.push(
        `Steps exceeds maximum: ${payload.steps} (max: ${constraints.maxSteps})`
      );
    }
  }

  // Validate duration
  if (payload.duration !== undefined) {
    if (payload.duration < 0) {
      errors.push('Duration cannot be negative');
    } else if (payload.duration > constraints.maxDuration) {
      errors.push(
        `Duration exceeds maximum: ${payload.duration}s (max: ${constraints.maxDuration}s)`
      );
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validates entire payload
 */
export function validatePayload(
  payload: RawEventPayload,
  constraints: ValidationConstraints = DEFAULT_CONSTRAINTS
): ValidationResult {
  const errors: string[] = [];

  // Required fields
  if (!payload.eventId || typeof payload.eventId !== 'string') {
    errors.push('eventId is required and must be a string');
  }

  if (!payload.sessionId || typeof payload.sessionId !== 'string') {
    errors.push('sessionId is required and must be a string');
  }

  if (!payload.userId || typeof payload.userId !== 'string') {
    errors.push('userId is required and must be a string');
  }

  if (!payload.timestamp) {
    errors.push('timestamp is required');
  }

  // Validate timestamp format and bounds
  if (payload.timestamp) {
    try {
      const timestamp = normalizeTimestamp(payload.timestamp);
      const timestampValidation = validateTimestamp(timestamp, constraints);
      if (!timestampValidation.isValid) {
        errors.push(...timestampValidation.errors);
      }
    } catch (error) {
      errors.push(`Invalid timestamp format: ${error}`);
    }
  }

  // Validate metrics
  const metricsValidation = validateMetrics(payload, constraints);
  if (!metricsValidation.isValid) {
    errors.push(...metricsValidation.errors);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Normalizes timestamp from various formats to Firestore Timestamp
 */
export function normalizeTimestamp(
  timestamp: string | number | Timestamp
): Timestamp {
  if (timestamp instanceof Timestamp) {
    return timestamp;
  }

  if (typeof timestamp === 'number') {
    // Assume milliseconds
    return Timestamp.fromMillis(timestamp);
  }

  if (typeof timestamp === 'string') {
    // Try ISO string first
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) {
      throw new Error(`Invalid timestamp string: ${timestamp}`);
    }
    return Timestamp.fromDate(date);
  }

  throw new Error(`Unsupported timestamp type: ${typeof timestamp}`);
}
