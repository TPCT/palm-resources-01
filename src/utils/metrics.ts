/**
 * Metrics tracking for observability
 * In production, this would integrate with Cloud Monitoring or similar
 */

export interface Metric {
  name: string;
  value: number;
  tags: Record<string, string>;
  timestamp: number;
}

class MetricsCollector {
  private metrics: Metric[] = [];

  /**
   * Record a metric
   */
  record(name: string, value: number, tags: Record<string, string> = {}): void {
    const metric: Metric = {
      name,
      value,
      tags,
      timestamp: Date.now(),
    };

    // In production, send to Cloud Monitoring
    // For now, store for testing
    this.metrics.push(metric);
  }

  /**
   * Increment a counter
   */
  increment(name: string, tags: Record<string, string> = {}): void {
    this.record(name, 1, tags);
  }

  /**
   * Record duplicate detection
   */
  recordDuplicate(
    sessionId: string,
    idempotencyKey: string,
    source: 'idempotency_cache' | 'event_exists'
  ): void {
    this.increment('exercise_session.ingest.duplicate_detected', {
      sessionId,
      idempotencyKey,
      source,
    });
  }

  /**
   * Record out-of-order event
   */
  recordOutOfOrder(sessionId: string, eventId: string): void {
    this.increment('exercise_session.ingest.out_of_order_count', {
      sessionId,
      eventId,
    });
  }

  /**
   * Record validation failure
   */
  recordValidationFailure(sessionId: string, reason: string): void {
    this.increment('exercise_session.ingest.validation_failed', {
      sessionId,
      reason,
    });
  }

  /**
   * Record transaction retry
   */
  recordTransactionRetry(sessionId: string, attempt: number): void {
    this.increment('exercise_session.ingest.transaction_retry', {
      sessionId,
      attempt: attempt.toString(),
    });
  }

  /**
   * Record processing duration
   */
  recordDuration(sessionId: string, durationMs: number): void {
    this.record('exercise_session.ingest.duration_ms', durationMs, {
      sessionId,
    });
  }

  // For testing purposes
  getMetrics(): Metric[] {
    return [...this.metrics];
  }

  getMetricsByName(name: string): Metric[] {
    return this.metrics.filter((m) => m.name === name);
  }

  clearMetrics(): void {
    this.metrics = [];
  }
}

export const metrics = new MetricsCollector();
