import { Logger, createMockLogger } from '@openfn/logger';
import { CLAIM, ClaimPayload, ClaimReply } from '../events';

import type { ServerApp } from '../server';

const mockLogger = createMockLogger();

// TODO: this needs standalone unit tests now that it's bene moved
const claim = (app: ServerApp, logger: Logger = mockLogger, maxWorkers = 5) => {
  return new Promise<void>((resolve, reject) => {
    const activeWorkers = Object.keys(app.workflows).length;
    if (activeWorkers >= maxWorkers) {
      return reject(new Error('Server at capacity'));
    }

    if (!app.channel) {
      return reject(new Error('No websocket available'));
    }

    logger.debug('requesting attempt...');
    app.channel
      .push<ClaimPayload>(CLAIM, { demand: 1 })
      .receive('ok', ({ attempts }: ClaimReply) => {
        logger.debug(`pulled ${attempts.length} attempts`);
        // TODO what if we get here after we've been cancelled?
        // the events have already been claimed...

        if (!attempts?.length) {
          // throw to backoff and try again
          return reject(new Error('No attempts returned'));
        }

        attempts.forEach((attempt) => {
          logger.debug('starting attempt', attempt.id);
          app.execute(attempt);
          resolve();
        });
      })
      // // TODO need implementations for both of these really
      // // What do we do if we fail to join the worker channel?
      .receive('error', () => {
        logger.debug('pull err');
      })
      .receive('timeout', () => {
        logger.debug('pull timeout');
        reject(new Error('timeout'));
      });
  });
};

export default claim;
