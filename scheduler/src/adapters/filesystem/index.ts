import fs from 'node:fs/promises';
import path from 'node:path';

import { Mutex } from 'async-mutex';

import { logger } from '../../config/logger.js';
import { SetupFolderFiles } from '../../enums.js';

import type { WriteDataType } from './types.js';

const deployPath = path.join(SetupFolderFiles.DEFAULT_PATH, SetupFolderFiles.DEPLOYS_PATH);
const deployFile = path.join(deployPath, SetupFolderFiles.DEPLOYS_FILE);

// Create a global mutex for safe file operations
const fileMutex = new Mutex();

export class FileSystemHandler {
  async createMountPath(): Promise<void> {
    try {
      await fs.mkdir(deployPath, { recursive: true });
      logger.info(`Created required directories [${deployPath}] successfully.`);
    } catch (error: unknown) {
      const err = error as Error;
      logger.error(`Failed to create directory [${deployPath}]: ${err.message}`);
      throw new Error(`Unable to create required directories [${deployPath}], please check permissions.`);
    }
  }

  async createFile(): Promise<void> {
    try {
      await fileMutex.runExclusive(async () => {
        await fs
          .writeFile(deployFile, JSON.stringify([]), { flag: 'wx' })
          .then(() => logger.info(`Created required file [${deployFile}] successfully.`))
          .catch(() => {
            logger.info(`File [${deployFile}] already exists.`);
          });
      });
    } catch (error: unknown) {
      const err = error as Error;
      logger.error(`Failed to create file [${deployFile}]: ${err.message}`);
      throw new Error(`Unable to create required file [${deployFile}], please check permissions.`);
    }
  }

  async appendData(newData: WriteDataType): Promise<void> {
    await fileMutex.runExclusive(async () => {
      try {
        let existingData: WriteDataType[] = [];
        const fileExists = await fs
          .stat(deployFile)
          .then(() => true)
          .catch(() => false);

        if (fileExists) {
          try {
            const data = await fs.readFile(deployFile, 'utf-8');
            existingData = JSON.parse(data);
          } catch (error: unknown) {
            logger.error(error);
            logger.warn(`Could not parse existing JSON in [${deployFile}], resetting file.`);
          }
        }

        existingData.push(newData);

        await fs.writeFile(deployFile, JSON.stringify(existingData, null, 2), 'utf-8');
        logger.info(`Appended data to file [${deployFile}] successfully.`);
      } catch (error: unknown) {
        const err = error as Error;
        logger.error(`Failed to append data to file [${deployFile}]: ${err.message}`);
        throw new Error(`Unable to append data to the file [${deployFile}], please check permissions.`);
      }
    });
  }

  async deleteData(predicate: (item: WriteDataType) => boolean): Promise<void> {
    await fileMutex.runExclusive(async () => {
      try {
        const fileExists = await fs
          .stat(deployFile)
          .then(() => true)
          .catch(() => false);
        if (!fileExists) {
          logger.warn(`File [${deployFile}] does not exist. Nothing to delete.`);
          return;
        }

        let existingData: WriteDataType[] = [];
        try {
          const data = await fs.readFile(deployFile, 'utf-8');
          existingData = JSON.parse(data);
        } catch (error: unknown) {
          logger.error(error);
          logger.warn(`Could not parse existing JSON in [${deployFile}]. Resetting file.`);
          existingData = [];
        }

        const newData = existingData.filter((item) => !predicate(item));
        console.log(existingData);
        if (newData.length === existingData.length) {
          logger.warn(`No matching data found to delete in [${deployFile}].`);
          return;
        }

        await fs.writeFile(deployFile, JSON.stringify(newData, null, 2), 'utf-8');
        logger.info(`Deleted matching data from file [${deployFile}] successfully.`);
      } catch (error: unknown) {
        const err = error as Error;
        logger.error(`Failed to delete data from file [${deployFile}]: ${err.message}`);
        throw new Error(`Unable to delete data from the file [${deployFile}], please check permissions.`);
      }
    });
  }

  async readData(): Promise<WriteDataType[]> {
    return await fs.readFile(deployFile, 'utf-8').then((data) => JSON.parse(data));
  }
}
