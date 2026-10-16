import { spawnSync } from 'node:child_process';

const command = process.platform === 'win32' ? 'cmd.exe' : 'yarn';

const args =
  process.platform === 'win32'
    ? ['/d', '/s', '/c', 'yarn.cmd audit --groups dependencies --json']
    : ['audit', '--groups', 'dependencies', '--json'];

const result = spawnSync(command, args, {
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024,
});

if (result.error) {
  throw result.error;
}

let complete = false;

let failed = false;

const seen = new Set();

for (const line of result.stdout.split('\n')) {
  let entry;

  try {
    entry = JSON.parse(line);
  } catch {
    continue;
  }

  if (entry.type === 'error') {
    throw new Error(entry.data);
  }

  if (entry.type === 'auditSummary') {
    complete = true;
    console.log(JSON.stringify(entry.data.vulnerabilities));
  }

  if (entry.type === 'auditAdvisory') {
    const advisory = entry.data.advisory;
    const key = `${advisory.module_name}:${advisory.id}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);

    if (['high', 'critical'].includes(advisory.severity)) {
      failed = true;
      console.error(
        `${advisory.severity}: ${advisory.module_name}: ${advisory.title}; patched ${advisory.patched_versions}`,
      );
    }
  }
}

if (!complete) {
  throw new Error('Dependency audit did not complete: ' + result.stderr.slice(0, 500));
}

process.exitCode = failed ? 1 : 0;
