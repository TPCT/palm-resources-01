# Idempotent Exercise Session Ingest

A Firebase Functions implementation for idempotent exercise session event ingestion with support for retries, out-of-order events, and data validation.

## Features

- ✅ **Idempotent Requests**: Prevents duplicate events on retries using idempotency keys
- ✅ **Out-of-Order Handling**: Correctly handles events arriving out of chronological order
- ✅ **Data Validation**: Validates timestamps and metrics before processing
- ✅ **Observability**: Comprehensive logging and metrics for production monitoring
- ✅ **Transaction Safety**: Uses Firestore transactions for atomic updates

## Architecture

### Data Model

- **Sessions**: `/sessions/{sessionId}` - Aggregated session data
- **Events**: `/sessions/{sessionId}/events/{eventId}` - Individual event records
- **Idempotency**: `/idempotency/{idempotencyKey}` - Request deduplication cache

### Key Components

1. **Ingest Handler** (`src/functions/ingestSessionEvent.ts`): Main HTTP endpoint
2. **Idempotency Helper** (`src/helpers/idempotencyHelper.ts`): Request deduplication
3. **Transaction Helper** (`src/helpers/transactionHelper.ts`): Atomic event upsert + aggregate computation
4. **Validator** (`src/utils/validator.ts`): Payload validation and normalization
5. **Aggregate Helper** (`src/helpers/aggregateHelper.ts`): Session aggregate computation

## Setup

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run tests
npm test
```

## Usage

### API Endpoint

```
POST /ingestSessionEvent
```

### Headers

- `idempotency-key` (required): Unique key for request deduplication

### Request Body

```json
{
  "eventId": "event-123",
  "sessionId": "session-456",
  "userId": "user-789",
  "timestamp": "2024-01-15T10:30:00Z",
  "distance": 100,
  "calories": 50,
  "steps": 1000,
  "duration": 60,
  "sequenceNumber": 1
}
```

### Response

```json
{
  "success": true,
  "session": {
    "sessionId": "session-456",
    "aggregates": {
      "totalDuration": 60,
      "totalDistance": 100,
      "totalCalories": 50,
      "totalSteps": 1000,
      "eventCount": 1
    }
  }
}
```

## How It Works

### Idempotency

1. Client sends request with `idempotency-key` header
2. System checks idempotency cache
3. If found, returns cached response (no duplicate processing)
4. If not found, processes request and caches response

### Out-of-Order Handling

1. New event arrives (may be out of order)
2. Transaction fetches ALL existing events for session
3. Sorts events by timestamp
4. Recomputes aggregates from sorted events
5. Updates session with correct aggregates

This ensures correctness regardless of arrival order.

### Validation

- **Timestamps**: Must be within 1 hour future / 30 days past
- **Distance**: Non-negative, max 100km
- **Calories**: Non-negative, max 10,000
- **Steps**: Non-negative integer, max 100,000
- **Duration**: Non-negative, max 24 hours

## Tests

### Automated Tests

Three core test scenarios:

1. **Retry Duplicate**: Same request sent twice → second returns cached response
2. **Out-of-Order Arrival**: Events arrive A, C, B → aggregates computed correctly
3. **Partial Update**: Partial event followed by full event → handled correctly

Run tests:
```bash
npm test
```

### Manual Testing

For manual testing, see:
- **[QUICK_START_TESTING.md](./QUICK_START_TESTING.md)** - Quick 5-minute guide
- **[MANUAL_TESTING_GUIDE.md](./MANUAL_TESTING_GUIDE.md)** - Comprehensive testing guide

Quick start:
```bash
# 1. Start emulators
firebase emulators:start --only firestore,functions

# 2. In another terminal, run test script
./test-manual.sh

# 3. Or test manually with curl (see QUICK_START_TESTING.md)
```

## Observability

### Metrics

- `exercise_session.ingest.duplicate_detected`: Duplicate requests detected
- `exercise_session.ingest.out_of_order_count`: Out-of-order events
- `exercise_session.ingest.validation_failed`: Validation failures
- `exercise_session.ingest.transaction_retry`: Transaction retries
- `exercise_session.ingest.duration_ms`: Processing latency

### Logging

All requests are logged with:
- Idempotency key
- Session ID
- Event ID
- Processing time
- Duplicate status
- Errors (if any)

## Project Structure

```
src/
├── types/              # TypeScript interfaces
├── config/             # Firebase configuration
├── helpers/            # Business logic helpers
├── utils/              # Utility functions
├── functions/          # Firebase Functions
└── __tests__/          # Test files
```

## Commit History

The implementation follows a logical commit sequence:

1. **Add Firestore data model and types** - Establish data contracts
2. **Implement payload validation and normalization** - Input safety
3. **Add idempotency helper with Firestore caching** - Retry handling
4. **Implement transaction-based event upsert with aggregate recomputation** - Core logic
5. **Add observability hooks and error handling** - Production readiness

## License

MIT
