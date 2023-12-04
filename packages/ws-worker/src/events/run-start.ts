import crypto from 'node:crypto';
import { JobStartPayload } from '@openfn/engine-multi';
import { timestamp } from '@openfn/logger';

import pkg from '../../package.json' assert { type: 'json' };
import { RUN_START, RunStartPayload } from '../events';
import { sendEvent, Context, onJobLog } from '../api/execute';
import calculateVersionString from '../util/versions';

export default async function onRunStart(
  context: Context,
  event: JobStartPayload
) {
  // Cheat on the timestamp time to make sure this is the first thing in the log
  // this doesn't work in streaming
  const time = (timestamp() - BigInt(1e6)).toString();

  const { channel, state } = context;

  // generate a run id and write it to state
  state.activeRun = crypto.randomUUID();
  state.activeJob = event.jobId;

  const input_dataclip_id = state.inputDataclips[event.jobId];

  const versions = {
    worker: pkg.version,
    ...event.versions,
  };

  await sendEvent<RunStartPayload>(channel, RUN_START, {
    run_id: state.activeRun!,
    job_id: state.activeJob!,
    input_dataclip_id,

    versions,
  });

  const versionMessage = calculateVersionString(versions);

  return onJobLog(context, {
    time,
    message: [versionMessage],
    level: 'info',
    name: 'VER',
  });
}
