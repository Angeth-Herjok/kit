// This will eventually contain all the error classes thrown by the engine

export class EngineError extends Error {
  source = 'worker';

  severity = '-'; // subclasses MUST provide this!
}

// This is thrown if a workflow takes too long to run
// It is generated by workerpool and thrown if the workerpool promise fails to resolve
export class TimeoutError extends EngineError {
  severity = 'crash';
  type = 'TimeoutError';
  duration;
  constructor(durationInMs: number) {
    super();
    this.duration = durationInMs;

    if (durationInMs) {
      this.message = `Workflow failed to return within ${durationInMs}ms`;
    } else {
      this.message = `Workflow failed to return within the specified time limit`;
    }
  }
}

// This is a catch-all error thrown during execution
export class ExecutionError extends EngineError {
  severity = 'crash';
  original: any; // this is the original error
  constructor(original: any) {
    super();
    this.original = original;
  }
}