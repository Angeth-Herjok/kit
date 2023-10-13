import test from 'ava';
import { fn } from '@openfn/language-common';
import type { State, Operation } from '../../src/types';
import { createMockLogger } from '@openfn/logger';
import execute from '../../src/execute/expression';

type TestState = State & {
  data: {
    x: number;
  };
};

const createState = (data = {}) => ({
  data: data,
  configuration: {},
});

const logger = createMockLogger(undefined, { level: 'debug' });

const executeExpression = (
  job: string | Operation[],
  state: State,
  opts = {}
) => execute(job, state, logger, opts);

test.afterEach(() => {
  logger._reset();
});

// Most of these unit tests pass in live JS code into the job pipeline
// This is convenient in testing as it's easier to catch errors
// Note that the linker and module loader do heavier testing of strings

test('run a live no-op job with one operation', async (t) => {
  const job = [(s: State) => s];
  const state = createState();
  const result = await executeExpression(job, state);

  t.deepEqual(state, result);
});

test('run a stringified no-op job with one operation', async (t) => {
  const job = 'export default [(s) => s]';
  const state = createState();
  const result = await executeExpression(job, state);

  t.deepEqual(state, result);
});

test('run a live no-op job with @openfn/language-common.fn', async (t) => {
  // @ts-ignore
  const job = [fn((s) => s)];
  const state = createState();
  const result = await executeExpression(job, state);

  t.deepEqual(state, result);
});

// TODO all these need implementing
// do they happen in expression.ts or elsewhere?
// I think this is fine

// on-start is called before things are resolved
// it means "i'm about to start processing this job"
// does duration include state loading?
// it's tricky, from the user's point of view it should just be execution time
// ok, fine, we're gonna say that start is literally just execution
// but we'll add like a job-initialise event, with a duration
test('call the on-intialise callback', async (t) => {
  let didCallCallback = false;

  const job = [(s: State) => s];
  const state = createState();

  const callbacks = {
    onInitStart: () => {
      didCallCallback = true;
    },
  };

  await executeExpression(job, state, { callbacks });
  t.true(didCallCallback);
});

test('call the on-intialise-complete callback', async (t) => {
  let didCallCallback = false;

  const job = [(s: State) => s];
  const state = createState();

  const callbacks = {
    onInitComplete: ({ duration }: any) => {
      t.assert(!isNaN(duration));
      didCallCallback = true;
    },
  };

  await executeExpression(job, state, { callbacks });
  t.true(didCallCallback);
});

test('call the on-start callback', async (t) => {
  let didCallCallback = false;

  const job = [(s: State) => s];
  const state = createState();

  const callbacks = {
    onStart: () => {
      didCallCallback = true;
    },
  };

  await executeExpression(job, state, { callbacks });
  t.true(didCallCallback);
});

test('call the on-complete callback', async (t) => {
  let didCallCallback = false;

  const job = [(s: State) => s];
  const state = createState();

  const callbacks = {
    onComplete: ({ duration, state }: any) => {
      t.assert(!isNaN(duration));
      t.truthy(state);
      didCallCallback = true;
    },
  };

  await executeExpression(job, state, { callbacks });
  t.true(didCallCallback);
});

test.todo('resolve a credential');
test.todo('resolve starting state');

test('jobs can handle a promise', async (t) => {
  const job = [async (s: State) => s];
  const state = createState();
  const result = await executeExpression(job, state);

  t.deepEqual(state, result);
});

test('output state should be serializable', async (t) => {
  const job = [async (s: State) => s];

  const circular = {};
  circular.self = circular;

  const state = createState({
    circular,
    fn: () => {},
  });
  const result = await executeExpression(job, state);

  t.notThrows(() => JSON.stringify(result));

  t.is(result.data.circular.self, '[Circular]');
  t.falsy(result.data.fn);
});

test('config is removed from the result (strict)', async (t) => {
  const job = [(s) => s];

  const result = await executeExpression(
    job,
    { configuration: {} },
    { strict: true }
  );
  t.deepEqual(result, {});
});

test('config is removed from the result (non-strict)', async (t) => {
  const job = [(s) => s];

  const result = await executeExpression(
    job,
    { configuration: {} },
    { strict: false }
  );
  t.deepEqual(result, {});
});

test('output state is cleaned in strict mode', async (t) => {
  const job = [
    async () => ({
      data: {},
      references: [],
      configuration: {},
      x: true,
    }),
  ];

  const result = await executeExpression(job, {}, { strict: true });
  t.deepEqual(result, {
    data: {},
    references: [],
  });
});

test('output state is left alone in non-strict mode', async (t) => {
  const state = {
    data: {},
    references: [],
    configuration: {},
    x: true,
  };
  const job = [async () => ({ ...state })];

  const result = await executeExpression(job, {}, { strict: false });
  t.deepEqual(result, {
    data: {},
    references: [],
    x: true,
  });
});

test('operations run in series', async (t) => {
  const job = [
    (s: TestState) => {
      s.data.x = 2;
      return s;
    },
    (s: TestState) => {
      s.data.x += 2;
      return s;
    },
    (s: TestState) => {
      s.data.x *= 3;
      return s;
    },
  ] as Operation[];

  const state = createState();
  // @ts-ignore
  t.falsy(state.data.x);

  const result = (await executeExpression(job, state)) as TestState;

  t.is(result.data.x, 12);
});

test('async operations run in series', async (t) => {
  const job = [
    (s: TestState) => {
      s.data.x = 2;
      return s;
    },
    (s: TestState) =>
      new Promise((resolve) => {
        setTimeout(() => {
          s.data.x += 2;
          resolve(s);
        }, 10);
      }),
    (s: TestState) => {
      s.data.x *= 3;
      return s;
    },
  ] as Operation[];

  const state = createState();
  // @ts-ignore
  t.falsy(state.data.x);

  const result = (await executeExpression(job, state)) as TestState;

  t.is(result.data.x, 12);
});

test('jobs can return undefined', async (t) => {
  // @ts-ignore violating the operation contract here
  const job = [() => undefined] as Operation[];

  const state = createState() as TestState;
  const result = (await executeExpression(job, state, {})) as TestState;

  t.assert(result === undefined);
});

test('jobs can mutate the original state', async (t) => {
  const job = [
    (s: TestState) => {
      s.data.x = 2;
      return s;
    },
  ] as Operation[];

  const state = createState({ x: 1 }) as TestState;
  const result = (await executeExpression(job, state, {
    immutableState: false,
  })) as TestState;

  t.is(state.data.x, 2);
  t.is(result.data.x, 2);
});

test('jobs do not mutate the original state', async (t) => {
  const job = [
    (s: TestState) => {
      s.data.x = 2;
      return s;
    },
  ] as Operation[];

  const state = createState({ x: 1 }) as TestState;
  const result = (await executeExpression(job, state, {
    immutableState: true,
  })) as TestState;

  t.is(state.data.x, 1);
  t.is(result.data.x, 2);
});

test('forwards a logger to the console object inside a job', async (t) => {
  const logger = createMockLogger(undefined, { level: 'info' });

  // We must define this job as a module so that it binds to the sandboxed context
  const job = `
export default [
  (s) => { console.log("x"); return s; }
];`;

  const state = createState();
  await executeExpression(job, state, { jobLogger: logger });

  const output = logger._parse(logger._last);
  t.is(output.level, 'info');
  t.is(output.message, 'x');
});

test('calls execute if exported from a job', async (t) => {
  const logger = createMockLogger(undefined, { level: 'info' });

  // The execute function, if called by the runtime, will send a specific
  // message to console.log, which we can pick up here in the test
  const source = `
    export const execute = () => { console.log('x'); return () => ({}) };
    export default [];
  `;

  await executeExpression(
    source,
    { configuration: {}, data: {} },
    { jobLogger: logger }
  );

  t.is(logger._history.length, 1);
});

// Skipping for now as the default timeout is quite long
test.skip('Throws after default timeout', async (t) => {
  const logger = createMockLogger(undefined, { level: 'info' });

  const job = `export default [() => new Promise(() => {})];`;

  const state = createState();
  await t.throwsAsync(
    async () => executeExpression(job, state, { jobLogger: logger }),
    {
      message: 'timeout',
    }
  );
});

test('Throws after custom timeout', async (t) => {
  const logger = createMockLogger(undefined, { level: 'info' });

  const job = `export default [() => new Promise((resolve) => setTimeout(resolve, 100))];`;

  const state = createState();
  await t.throwsAsync(
    async () =>
      executeExpression(job, state, { jobLogger: logger, timeout: 10 }),
    {
      message: 'timeout',
    }
  );
});

test('Operations log on start and end', async (t) => {
  const job = [(s: State) => s];
  const state = createState();
  await executeExpression(job, state);

  const start = logger._find('debug', /starting operation /i);
  t.truthy(start);

  const end = logger._find('info', /operation 1 complete in \dms/i);
  t.truthy(end);
});
