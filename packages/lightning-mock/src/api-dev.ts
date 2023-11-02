/*
 * This module sets up a bunch of dev-only APIs
 * These are not intended to be reflected in Lightning itself
 */
import Koa from 'koa';
import Router from '@koa/router';
import { Logger } from '@openfn/logger';
import crypto from 'node:crypto';

import { Attempt } from './types';
import { ServerState } from './server';
import { ATTEMPT_COMPLETE, AttemptCompletePayload } from './events';

type LightningEvents = 'log' | 'attempt-complete';

type DataClip = any;

export type DevApp = Koa & {
  addCredential(id: string, cred: Credential): void;
  addDataclip(id: string, data: DataClip): void;
  enqueueAttempt(attempt: Attempt): void;
  getAttempt(id: string): Attempt;
  getCredential(id: string): Credential;
  getDataclip(id: string): DataClip;
  getQueueLength(): number;
  getResult(attemptId: string): any;
  getState(): ServerState;
  on(event: LightningEvents, fn: (evt: any) => void): void;
  once(event: LightningEvents, fn: (evt: any) => void): void;
  onSocketEvent(
    event: LightningEvents,
    attemptId: string,
    fn: (evt: any) => void
  ): void;
  registerAttempt(attempt: Attempt): void;
  reset(): void;
  startAttempt(id: string): any;
  waitForResult(attemptId: string): Promise<any>;
};

type Api = {
  startAttempt(attemptId: string): void;
};

const setupDevAPI = (
  app: DevApp,
  state: ServerState,
  logger: Logger,
  api: Api
) => {
  // Dev APIs for unit testing
  app.addCredential = (id: string, cred: Credential) => {
    logger.info(`Add credential ${id}`);
    state.credentials[id] = cred;
  };

  app.getCredential = (id: string) => state.credentials[id];

  app.addDataclip = (id: string, data: any) => {
    logger.info(`Add dataclip ${id}`);
    state.dataclips[id] = data;
  };

  app.getDataclip = (id: string) => state.dataclips[id];

  app.enqueueAttempt = (attempt: Attempt, workerId = 'rte') => {
    state.attempts[attempt.id] = attempt;
    state.results[attempt.id] = {
      workerId, // TODO
      state: null,
    };
    state.pending[attempt.id] = {
      status: 'queued',
      logs: [],
    };
    state.queue.push(attempt.id);
  };

  app.getAttempt = (id: string) => state.attempts[id];

  app.getState = () => state;

  // Promise which returns when a workflow is complete
  app.waitForResult = (attemptId: string) => {
    return new Promise((resolve) => {
      const handler = (evt: {
        payload: AttemptCompletePayload;
        attemptId: string;
        _state: ServerState;
        dataclip: any;
      }) => {
        if (evt.attemptId === attemptId) {
          state.events.removeListener(ATTEMPT_COMPLETE, handler);
          const result = state.dataclips[evt.payload.final_dataclip_id];
          resolve(result);
        }
      };
      state.events.addListener(ATTEMPT_COMPLETE, handler);
    });
  };

  app.reset = () => {
    state.queue = [];
    state.results = {};
  };

  app.getQueueLength = () => state.queue.length;

  app.getResult = (attemptId: string) => state.results[attemptId]?.state;

  app.startAttempt = (attemptId: string) => api.startAttempt(attemptId);

  // TODO probably remove?
  app.registerAttempt = (attempt: any) => {
    state.attempts[attempt.id] = attempt;
  };

  // TODO these are overriding koa's event handler - should I be doing something different?

  // @ts-ignore
  app.on = (event: LightningEvents, fn: (evt: any) => void) => {
    state.events.addListener(event, fn);
  };

  // @ts-ignore
  app.once = (event: LightningEvents, fn: (evt: any) => void) => {
    state.events.once(event, fn);
  };

  app.onSocketEvent = (
    event: LightningEvents,
    attemptId: string,
    fn: (evt: any) => void
  ) => {
    function handler(e: any) {
      if (e.attemptId && e.attemptId === attemptId) {
        state.events.removeListener(event, handler);
        fn(e);
      }
    }
    state.events.addListener(event, handler);
  };
};

// Set up some rest endpoints
// Note that these are NOT prefixed
const setupRestAPI = (app: DevApp, state: ServerState, logger: Logger) => {
  const router = new Router();

  router.post('/attempt', (ctx) => {
    const attempt = ctx.request.body as Attempt;

    if (!attempt) {
      ctx.response.status = 400;
      return;
    }

    logger.info('Adding new attempt to queue:', attempt.id);
    logger.debug(attempt);

    if (!attempt.id) {
      attempt.id = crypto.randomUUID();
      logger.info('Generating new id for incoming attempt:', attempt.id);
    }

    // convert credentials and dataclips
    attempt.jobs.forEach((job) => {
      if (job.credential) {
        const cid = crypto.randomUUID();
        state.credentials[cid] = job.credential;
        job.credential = cid;
      }
    });

    app.enqueueAttempt(attempt);

    ctx.response.status = 200;
  });

  return router.routes();
};

export default (app: DevApp, state: ServerState, logger: Logger, api: Api) => {
  setupDevAPI(app, state, logger, api);
  return setupRestAPI(app, state, logger);
};