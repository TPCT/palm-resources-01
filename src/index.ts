import * as functions from 'firebase-functions';
import { ingestSessionEvent } from './functions/ingestSessionEvent';

/**
 * Firebase Function: Ingest exercise session event
 * 
 * POST /ingestSessionEvent
 * Headers:
 *   - idempotency-key: string (required)
 * Body:
 *   - eventId: string (required)
 *   - sessionId: string (required)
 *   - userId: string (required)
 *   - timestamp: string | number | Timestamp (required)
 *   - duration?: number
 *   - distance?: number
 *   - calories?: number
 *   - steps?: number
 *   - sequenceNumber?: number
 */
export const ingestSessionEventFunction = functions.https.onRequest(
  async (req, res) => {
    // Only allow POST
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    await ingestSessionEvent(req as any, res);
  }
);
