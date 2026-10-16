import { Config as observations } from '@stornx/platform/config/config.js';

export const Config = {
  ...observations,
  faultTolerance: { maxZones: Number(process.env.FT_MAX_ZONES ?? 3) },
};
