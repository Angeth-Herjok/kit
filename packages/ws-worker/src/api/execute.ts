// TODO not crazy about this file name
// This is the module responsible for interfacing between the Lightning websocket
// and the rutnime engine
// It's the actual meat and potatoes of the implementation
// You can almost read this as a binding function and a bunch of handlers
// it isn't an actual worker, but a BRIDGE between a worker and lightning
import crypto from 'node:crypto';
import { JSONLog } from '@openfn/logger';

// this managers the worker
//i would like functions to be testable, and I'd like the logic to be readable

import {
  ATTEMPT_COMPLETE,
  ATTEMPT_COMPLETE_PAYLOAD,
  ATTEMPT_LOG,
  ATTEMPT_LOG_PAYLOAD,
  ATTEMPT_START,
  ATTEMPT_START_PAYLOAD,
  GET_CREDENTIAL,
  GET_DATACLIP,
  RUN_COMPLETE,
  RUN_COMPLETE_PAYLOAD,
  RUN_START,
  RUN_START_PAYLOAD,
} from '../events';
import { Channel } from '../types';
import { ExecutionPlan } from '@openfn/runtime';
import { getWithReply } from '../util';

const enc = new TextDecoder('utf-8');

export type AttemptState = {
  activeRun?: string;
  activeJob?: string;
  plan: ExecutionPlan;
  // final state/dataclip
  result?: any;

  // TODO status?
};

// pass a web socket connected to the attempt channel
// this thing will do all the work
export function execute(channel: Channel, engine, plan: ExecutionPlan) {
  return new Promise((resolve) => {
    // TODO add proper logger (maybe channel, rtm and logger comprise a context object)
    // tracking state for this attempt
    const state: AttemptState = {
      plan,
    };

    // TODO
    // const context = { channel, state, logger }

    engine.listen(plan.id, {
      // TODO load event types from runtime-manager
      'workflow-start': (evt: any) => onWorkflowStart(channel),
      'job-start': (evt: any) => onJobStart(channel, state, evt),
      'job-complete': (evt: any) => onJobComplete(channel, state, evt),
      log: (evt: any) => onJobLog(channel, state, evt),
      'workflow-complete': (evt: any) => {
        onWorkflowComplete(channel, state, evt);
        resolve(evt.state);
      },
    });

    const resolvers = {
      state: (id: string) => loadState(channel, id),
      credential: (id: string) => loadCredential(channel, id),
    };

    engine.execute(plan, resolvers);
  });
}

// TODO maybe move all event handlers into api/events/*

export function onJobStart(
  channel: Channel,
  state: AttemptState,
  jobId: string
) {
  // generate a run id and write it to state
  state.activeRun = crypto.randomUUID();
  state.activeJob = jobId;

  channel.push<RUN_START_PAYLOAD>(RUN_START, {
    run_id: state.activeJob,
    job_id: state.activeJob,
    // input_dataclip_id what about this guy?
  });
}

export function onJobComplete(
  channel: Channel,
  state: AttemptState,
  evt: any // TODO need to type the engine events nicely
) {
  channel.push<RUN_COMPLETE_PAYLOAD>(RUN_COMPLETE, {
    run_id: state.activeRun!,
    job_id: state.activeJob!,
    output_dataclip: JSON.stringify(evt.state),
  });

  delete state.activeRun;
  delete state.activeJob;
}

export function onWorkflowStart(channel: Channel) {
  channel.push<ATTEMPT_START_PAYLOAD>(ATTEMPT_START);
}

export function onWorkflowComplete(
  channel: Channel,
  state: AttemptState,
  evt: any
) {
  state.result = evt.state;

  channel.push<ATTEMPT_COMPLETE_PAYLOAD>(ATTEMPT_COMPLETE, {
    dataclip: evt.state,
  });
}

export function onJobLog(channel: Channel, state: AttemptState, log: JSONLog) {
  // we basically just forward the log to lightning
  // but we also need to attach the log id
  const evt: ATTEMPT_LOG_PAYLOAD = {
    ...log,
    attempt_id: state.plan.id!,
  };
  if (state.activeRun) {
    evt.run_id = state.activeRun;
  }
  channel.push<ATTEMPT_LOG_PAYLOAD>(ATTEMPT_LOG, evt);
}

export async function loadState(channel: Channel, stateId: string) {
  const result = await getWithReply<Uint8Array>(channel, GET_DATACLIP, {
    dataclip_id: stateId,
  });
  const str = enc.decode(new Uint8Array(result));
  return JSON.parse(str);
}

export async function loadCredential(channel: Channel, credentialId: string) {
  return getWithReply(channel, GET_CREDENTIAL, { credential_id: credentialId });
}
