import yargs from 'yargs';
import * as o from '../options';
import { build, ensure } from '../util/command-builders';

const options = [
  o.adaptors,
  o.expandAdaptors,
  o.jobPath,
  o.outputPath,
  o.outputStdout,
  //o.skipAdaptorValidation,
  o.useAdaptorsMonorepo,
];

const compileCommand = {
  command: 'compile [path]',
  desc: 'Compile an openfn job and print or save the resulting JavaScript.',
  handler: ensure('compile', options), 
  builder: (yargs) => build(options, yargs)
    .positional('path', {
      describe:
        'The path to load the job from (a .js file or a dir containing a job.js file)',
      demandOption: true,
    })
    .example(
      'compile foo/job.js -O',
      'Compiles foo/job.js and prints the result to stdout'
    )
    .example(
      'compile foo/job.js -o foo/job-compiled.js',
      'Compiles foo/job.js and saves the result to foo/job-compiled.js'
    )
} as yargs.CommandModule<{}>;

export default compileCommand;
