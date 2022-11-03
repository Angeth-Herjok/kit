import { exec } from 'node:child_process';
import { install as rtInstall } from '@openfn/runtime';
import type { Opts, SafeOpts } from '../commands';
import createLogger, { defaultLogger, Logger } from '../util/logger';

// Bit wierd
// I want to declare what install COULD use
// maybe packages and modulesHome are actually required?
type InstallOpts = Partial<Pick<Opts, 'packages' | 'adaptor' | 'modulesHome'>>;

export const install = async (
  opts: InstallOpts,
  log: Logger = defaultLogger
) => {
  let { packages, adaptor, modulesHome } = opts;
  if (packages) {
    log.debug('modulesHome is set to:', modulesHome);
    if (adaptor) {
      packages = packages.map((name) => {
        const expanded = `@openfn/language-${name}`;
        log.info(`Expanded adaptor ${name} to ${expanded}`);
        return expanded;
      });
    }
    // TODO modulesHome becomes something like repoHome
    await rtInstall(packages[0], modulesHome, log);
  }
  log.success('Installation complete');
};

export const clean = async (options: SafeOpts, logger: Logger) => {
  // TODO should we prompt confirm first? What if modulesHome is something bad?
  if (options.modulesHome) {
    return new Promise<void>((resolve) => {
      logger.info(`Cleaning repo at ${options.modulesHome} `);
      exec(`npm exec rimraf ${options.modulesHome}`, () => {
        logger.success('Repo cleaned');
        resolve();
      });
    });
  } else {
    logger.error('Clean failed');
    logger.error('No modulesHome path detected');
  }
};

export const pwd = async (options: SafeOpts, logger: Logger) => {
  // TODO should we report if modules home is set?
  logger.info(
    `OPENFN_MODULES_HOME is set to ${process.env.OPENFN_MODULES_HOME}`
  );
  logger.success(`Repo working directory is: ${options.modulesHome}`);
};
