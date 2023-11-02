import { WebSocketServer } from 'ws';
import createLogger, { Logger } from '@openfn/logger';

import type { ServerState } from './server';

import { extractAttemptId } from './util';

import createPheonixMockSocketServer, {
  DevSocket,
  PhoenixEvent,
} from './socket-server';
import {
  ATTEMPT_COMPLETE,
  AttemptCompletePayload,
  AttemptCompleteReply,
  ATTEMPT_LOG,
  AttemptLogPayload,
  AttemptLogReply,
  CLAIM,
  ClaimPayload,
  ClaimReply,
  ClaimAttempt,
  GET_ATTEMPT,
  GetAttemptPayload,
  GetAttemptReply,
  GET_CREDENTIAL,
  GetCredentialPayload,
  GetCredentialReply,
  GET_DATACLIP,
  GetDataclipPayload,
  GetDataClipReply,
  RUN_COMPLETE,
  RunCompletePayload,
  RUN_START,
  RunStart,
  RunStartReply,
  RunCompleteReply,
} from './events';

import type { Server } from 'http';
import { stringify } from './util';

// dumb cloning id
// just an idea for unit tests
const clone = (state: ServerState) => {
  const { events, ...rest } = state;
  return JSON.parse(JSON.stringify(rest));
};

const enc = new TextEncoder();

// this new API is websocket based
// Events map to handlers
// can I even implement this in JS? Not with pheonix anyway. hmm.
// dead at the first hurdle really.
// what if I do the server side mock in koa, can I use the pheonix client to connect?
const createSocketAPI = (
  state: ServerState,
  path: string,
  httpServer: Server,
  logger?: Logger
) => {
  // set up a websocket server to listen to connections
  const server = new WebSocketServer({
    server: httpServer,

    // Note: phoenix websocket will connect to <endpoint>/websocket
    path: path ? `${path}/websocket` : undefined,
  });

  // pass that through to the phoenix mock
  const wss = createPheonixMockSocketServer({
    // @ts-ignore server typings
    server,
    state,
    logger: logger && createLogger('PHX', { level: 'debug' }),
  });

  wss.registerEvents('worker:queue', {
    [CLAIM]: (ws, event: PhoenixEvent<ClaimPayload>) => {
      const { attempts } = pullClaim(state, ws, event);
      attempts.forEach((attempt) => {
        state.events.emit(CLAIM, {
          attemptId: attempt.id,
          payload: attempt,
          state: clone(state),
        });
      });
    },
  });

  const startAttempt = (attemptId: string) => {
    logger && logger.debug(`joining channel attempt:${attemptId}`);

    // mark the attempt as started on the server
    state.pending[attemptId] = {
      status: 'started',
      logs: [],
    };

    const wrap = <T>(
      handler: (
        state: ServerState,
        ws: DevSocket,
        evt: PhoenixEvent<T>,
        attemptId: string
      ) => void
    ) => {
      return (ws: DevSocket, event: PhoenixEvent<T>) => {
        handler(state, ws, event, attemptId);
        // emit each event and the state after to the event handler, for debug
        state.events.emit(event.event, {
          attemptId,
          payload: event.payload,
          state: clone(state),
        });
      };
    };

    const { unsubscribe } = wss.registerEvents(`attempt:${attemptId}`, {
      [GET_ATTEMPT]: wrap(getAttempt),
      [GET_CREDENTIAL]: wrap(getCredential),
      [GET_DATACLIP]: wrap(getDataclip),
      [RUN_START]: wrap(handleRunStart),
      [ATTEMPT_LOG]: wrap(handleLog),
      [RUN_COMPLETE]: wrap(handleRunComplete),
      [ATTEMPT_COMPLETE]: wrap((...args) => {
        handleAttemptComplete(...args);
        unsubscribe();
      }),
    });
  };

  return {
    startAttempt,
    close: () => {
      server.close();
      (wss as any).close();
    },
  };

  // pull claim will try and pull a claim off the queue,
  // and reply with the response
  // the reply ensures that only the calling worker will get the attempt
  function pullClaim(
    state: ServerState,
    ws: DevSocket,
    evt: PhoenixEvent<ClaimPayload>
  ) {
    const { ref, join_ref, topic } = evt;
    const { queue } = state;
    let count = 1;

    const attempts: ClaimAttempt[] = [];
    const payload = {
      status: 'ok' as const,
      response: { attempts } as ClaimReply,
    };

    while (count > 0 && queue.length) {
      // TODO assign the worker id to the attempt
      // Not needed by the mocks at the moment
      const next = queue.shift();
      // TODO the token in the mock is trivial because we're not going to do any validation on it yet
      // TODO need to save the token associated with this attempt
      attempts.push({ id: next!, token: 'x.y.z' });
      count -= 1;

      startAttempt(next!);
    }
    if (attempts.length) {
      logger?.info(`Claiming ${attempts.length} attempts`);
    } else {
      logger?.info('No claims (queue empty)');
    }

    ws.reply<ClaimReply>({ ref, join_ref, topic, payload });
    return payload.response;
  }

  function getAttempt(
    state: ServerState,
    ws: DevSocket,
    evt: PhoenixEvent<GetAttemptPayload>
  ) {
    const { ref, join_ref, topic } = evt;
    const attemptId = extractAttemptId(topic);
    const response = state.attempts[attemptId];

    ws.reply<GetAttemptReply>({
      ref,
      join_ref,
      topic,
      payload: {
        status: 'ok',
        response,
      },
    });
  }

  function getCredential(
    state: ServerState,
    ws: DevSocket,
    evt: PhoenixEvent<GetCredentialPayload>
  ) {
    const { ref, join_ref, topic, payload } = evt;
    const response = state.credentials[payload.id];
    // console.log(topic, event, response);
    ws.reply<GetCredentialReply>({
      ref,
      join_ref,
      topic,
      payload: {
        status: 'ok',
        response,
      },
    });
  }

  // TODO this mock function is broken in the phoenix package update
  // (I am not TOO worried, the actual integration works fine)
  function getDataclip(
    state: ServerState,
    ws: DevSocket,
    evt: PhoenixEvent<GetDataclipPayload>
  ) {
    const { ref, topic, join_ref } = evt;
    const dataclip = state.dataclips[evt.payload.id];

    // Send the data as an ArrayBuffer (our stringify function will do this)
    const payload = {
      status: 'ok',
      response: enc.encode(stringify(dataclip)),
    };

    ws.reply<GetDataClipReply>({
      ref,
      join_ref,
      topic,
      // @ts-ignore
      payload,
    });
  }

  function handleLog(
    state: ServerState,
    ws: DevSocket,
    evt: PhoenixEvent<AttemptLogPayload>
  ) {
    const { ref, join_ref, topic, payload } = evt;
    const { attempt_id: attemptId } = payload;

    state.pending[attemptId].logs.push(payload);

    ws.reply<AttemptLogReply>({
      ref,
      join_ref,
      topic,
      payload: {
        status: 'ok',
      },
    });
  }

  function handleAttemptComplete(
    state: ServerState,
    ws: DevSocket,
    evt: PhoenixEvent<AttemptCompletePayload>,
    attemptId: string
  ) {
    const { ref, join_ref, topic, payload } = evt;
    const { final_dataclip_id } = payload;

    logger?.info('Completed attempt ', attemptId);
    logger?.debug(final_dataclip_id);

    state.pending[attemptId].status = 'complete';
    if (!state.results[attemptId]) {
      state.results[attemptId] = { state: null, workerId: 'mock' };
    }
    state.results[attemptId].state = state.dataclips[final_dataclip_id];

    ws.reply<AttemptCompleteReply>({
      ref,
      join_ref,
      topic,
      payload: {
        status: 'ok',
      },
    });
  }

  function handleRunStart(
    state: ServerState,
    ws: DevSocket,
    evt: PhoenixEvent<RunStart>
  ) {
    const { ref, join_ref, topic } = evt;
    if (!state.dataclips) {
      state.dataclips = {};
    }
    ws.reply<RunStartReply>({
      ref,
      join_ref,
      topic,
      payload: {
        status: 'ok',
      },
    });
  }

  function handleRunComplete(
    state: ServerState,
    ws: DevSocket,
    evt: PhoenixEvent<RunCompletePayload>
  ) {
    const { ref, join_ref, topic } = evt;
    const { output_dataclip_id, output_dataclip } = evt.payload;

    if (output_dataclip_id) {
      if (!state.dataclips) {
        state.dataclips = {};
      }
      state.dataclips[output_dataclip_id] = JSON.parse(output_dataclip!);
    }

    // be polite and acknowledge the event
    ws.reply<RunCompleteReply>({
      ref,
      join_ref,
      topic,
      payload: {
        status: 'ok',
      },
    });
  }
};

export default createSocketAPI;