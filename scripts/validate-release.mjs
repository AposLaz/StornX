import { readFileSync } from 'node:fs';

// Workflow inputs arrive through environment variables, rather than shell interpolation.
const service = process.env.SERVICE;

const requestedVersion = process.env.VERSION;

const manifestPath = new URL(`../services/${service}/package.json`, import.meta.url);

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

// Only publish an explicit version that matches the selected workspace package.
const isReleaseVersion = /^\d+\.\d+\.\d+$/.test(requestedVersion ?? '');

const matchesPackageVersion = manifest.version === requestedVersion;

if (!isReleaseVersion || !matchesPackageVersion) {
  console.error('Release version must be an exact major.minor.patch matching the service package.');
  process.exitCode = 1;
}
