import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import yaml from 'js-yaml';
function render(name, ...args) {
  const r = spawnSync(
    'helm',
    [
      'template',
      name,
      `deploy/${name}`,
      '--namespace',
      'stornx',
      '--set',
      'config.clusterId=validation',
      '--set',
      'existingSecret=validation',
      ...args,
    ],
    { encoding: 'utf8' },
  );
  if (r.error) throw r.error;
  assert.equal(r.status, 0, r.stderr);
  return yaml.loadAll(r.stdout).filter(Boolean);
}
for (const service of ['optiscaler', 'optibalancer']) {
  test(`${service} chart isolates credentials, runtime, and workload permissions`, () => {
    const docs = render(service, '--set', 'config.namespaces[0]=shop', '--set', 'replicaCount=2');
    const deployment = docs.find((d) => d.kind === 'Deployment'),
      container = deployment.spec.template.spec.containers[0];
    assert.equal(deployment.spec.template.spec.containers.length, 1);
    assert.equal(deployment.spec.replicas, 2);
    assert.equal(container.securityContext.readOnlyRootFilesystem, true);
    assert.ok(docs.some((d) => d.kind === 'PodDisruptionBudget'));
    assert.ok(!docs.some((d) => d.kind === 'PersistentVolumeClaim'));
    const rules = docs
      .filter((d) => ['Role', 'ClusterRole'].includes(d.kind))
      .flatMap((d) => d.rules);
    if (service === 'optibalancer') {
      assert.ok(
        !rules.some(
          (r) =>
            r.resources.some((x) => ['deployments/scale', 'pods', 'nodes'].includes(x)) &&
            r.verbs.some((v) => ['patch', 'update', 'delete', 'create'].includes(v)),
        ),
      );
    } else assert.ok(!rules.some((r) => r.resources.includes('destinationrules')));
    assert.equal(container.env.find((e) => e.name === 'DRY_RUN').value, 'true');
    assert.equal(container.env.find((e) => e.name === 'MUTATIONS_ENABLED').value, 'false');
    assert.ok(docs.some((d) => d.kind === 'Role' && d.metadata.namespace === 'shop'));
    assert.ok(docs.some((d) => d.kind === 'NetworkPolicy'));
  });
  test(`${service} can be disabled independently`, () =>
    assert.deepEqual(render(service, '--set', 'enabled=false'), []));
}
