import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { Database } from '@stornx/platform/database.js';
import { clients } from '@stornx/platform/kube.js';
import { settings } from '@stornx/platform/settings.js';
import { BalancerJournal } from '../services/optibalancer/dist/journal.js';

if (!process.argv.includes('--legacy-stopped')) {
  throw new Error('Stop legacy writers first, then pass --legacy-stopped');
}

const file = process.argv[2];

if (!file || file.startsWith('--')) {
  throw new Error('Provide deploys.json path');
}

const data = JSON.parse(await readFile(file, 'utf8'));

if (!Array.isArray(data)) {
  throw new Error('Expected deployment array');
}

const config = settings('optibalancer');

const api = clients(config.production);

const db = new Database(config);

const journal = new BalancerJournal(db);

try {
  await journal.verify();

  const seen = new Set();

  for (const row of data) {
    if (
      typeof row.namespace !== 'string' ||
      typeof row.deployment !== 'string' ||
      !config.namespaces.includes(row.namespace)
    ) {
      throw new Error('Invalid or out-of-scope legacy record');
    }

    const key = JSON.stringify([row.namespace, row.deployment]);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);

    const deployment = await api.apps.readNamespacedDeployment({
      namespace: row.namespace,
      name: row.deployment,
    });

    await journal.accept({
      type: 'workload.changed.v1',
      schemaVersion: 1,
      id: randomUUID(),
      occurredAt: new Date().toISOString(),
      producer: 'legacy-import',
      correlationId: randomUUID(),
      clusterId: config.clusterId,
      namespace: row.namespace,
      workload: {
        kind: 'Deployment',
        name: row.deployment,
        uid: deployment.metadata.uid,
      },
      reason: 'migration',
    });
  }

  console.log(`Imported ${seen.size} current workloads; source file was preserved`);
} finally {
  await db.pool.end();
}
