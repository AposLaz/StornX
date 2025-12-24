import { FileSystemHandler } from '../adapters/filesystem/index.js';

const fileHandler = new FileSystemHandler();

export const setup = async () => {
  // create the base folder path
  await fileHandler.createMountPath();
  await fileHandler.createFile();
};
