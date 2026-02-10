# OptiBalancer Test Suite

This directory contains comprehensive tests for the OptiBalancer traffic distribution algorithm.

## Overview

The OptiBalancer uses a weight-based algorithm to distribute traffic across nodes based on four factors:

1. **P95 Response Time** - Primary factor; nodes with high response times get penalized (lower is better)
2. **Latency** - Network latency between nodes (lower is better)
3. **Load** - CPU/Memory utilization (lower is better)
4. **Replica Count** - Number of pods on each node (more = more capacity)

**Formula:**

```
weight = (1 - responseTimePenalty) * (1 - normalizedLatency) * normalizedPodsLength * (1 - normalizedLoad)
```

**Response Time Penalty** (logarithmic curve):

```
if responseTime <= threshold: penalty = 0
else: penalty = min(0.9, 1 - 1/(1 + ln(responseTime/threshold)))
```

**Constraints:**

- 35% minimum local share (only when local replicas >= max replicas of other nodes)
- **Adaptive step size**: 5-20% per cycle (scales with urgency/delta)
- 5% delta threshold (ignores small changes)

---

## Running the Tests

### Run All Tests

```bash
cd scheduler
npm test -- tests/optiBalancer/engine.test.ts
```

### Run Specific Test Suite

```bash
# Run only scenario tests
npm test -- tests/optiBalancer/engine.test.ts -t "Scenario"

# Run a specific scenario
npm test -- tests/optiBalancer/engine.test.ts -t "Single node cluster"
```

### Run Visualization Script

To see the actual traffic distributions for all 35 use cases:

```bash
cd scheduler
npx tsx tests/optiBalancer/visualize.ts
```

This outputs a formatted table showing how traffic is distributed for each scenario.

---

## Test File Structure

```
tests/optiBalancer/
├── engine.test.ts         # Main test file with all unit and scenario tests
├── visualize.ts           # Interactive visualization script
├── data/
│   └── testBuilders.ts    # Test data builders and pre-defined scenarios
├── README.md              # This file
```

---

## Use Cases (35 Scenarios)

### Basic Scenarios (UC-01 to UC-07)

| ID    | Name                     | Description                                      | Expected Behavior                             |
| ----- | ------------------------ | ------------------------------------------------ | --------------------------------------------- |
| UC-01 | Two Nodes Equal          | Two nodes with identical load (50%) and replicas | Even distribution (~67% local, ~33% cross)    |
| UC-02 | One Node Overloaded      | Node-A at 90% load, Node-B at 30%                | Traffic shifts toward lighter node            |
| UC-03 | One Node High Latency    | Node-B has 100ms latency                         | Prefer local over slow remote                 |
| UC-04 | Three Nodes Varying Load | 80%/50%/20% load distribution                    | Prefer lightest-loaded node                   |
| UC-05 | All Nodes Overloaded     | All nodes at 90% load                            | Fall back to replica-based distribution       |
| UC-06 | Uneven Replicas          | 4/2/1 replicas per node                          | Send more traffic to nodes with more replicas |
| UC-07 | Cross-AZ Latency         | 3 zones with varying latencies                   | Prefer lower-latency destinations             |

### Edge Cases (UC-08 to UC-10)

| ID    | Name               | Description                | Expected Behavior              |
| ----- | ------------------ | -------------------------- | ------------------------------ |
| UC-08 | Single Node        | Only one node exists       | 100% local traffic             |
| UC-09 | Single Replica     | Only one pod total         | All traffic goes to single pod |
| UC-10 | Five Nodes Cluster | 5 nodes with varying loads | Distribute across all 5 nodes  |

### Load Distribution (UC-11 to UC-14)

| ID    | Name                    | Description             | Expected Behavior                   |
| ----- | ----------------------- | ----------------------- | ----------------------------------- |
| UC-11 | Extreme Load Difference | 95% vs 5% load          | Heavy redirection to light node     |
| UC-12 | All Nodes Idle          | All nodes at 0% load    | Even distribution based on replicas |
| UC-13 | Load Gradient           | 10%/30%/50%/70%/90%     | Prefer lighter nodes in order       |
| UC-14 | One Node At Threshold   | One node exactly at 70% | Moderate redirection                |

### Latency Scenarios (UC-15 to UC-18)

| ID    | Name               | Description                         | Expected Behavior                     |
| ----- | ------------------ | ----------------------------------- | ------------------------------------- |
| UC-15 | Extreme Latency    | 500ms cross-node latency            | Heavily favor local traffic           |
| UC-16 | Asymmetric Latency | A→B fast (5ms), B→A slow (100ms)    | Different distributions per direction |
| UC-17 | Uniform Latency    | All cross-node at 10ms              | Distribution based on load only       |
| UC-18 | Multi-Region       | EU/US/Asia with realistic latencies | Prefer closer regions                 |

### Replica Distribution (UC-19 to UC-20)

| ID    | Name                   | Description          | Expected Behavior                         |
| ----- | ---------------------- | -------------------- | ----------------------------------------- |
| UC-19 | Highly Uneven Replicas | 10:1 replica ratio   | Heavy preference for more replicas        |
| UC-20 | Partial Deployment     | One node has no pods | Source with no pods sends all traffic out |

### Combined Factors (UC-21 to UC-24)

| ID    | Name                          | Description                                    | Expected Behavior                        |
| ----- | ----------------------------- | ---------------------------------------------- | ---------------------------------------- |
| UC-21 | Worst Node                    | High load + high latency                       | Minimize traffic to this node            |
| UC-22 | Load vs Latency Tradeoff      | High-load/low-latency vs low-load/high-latency | Algorithm balances both factors          |
| UC-23 | More Replicas On Overloaded   | 5 replicas at 80% vs 1 replica at 20%          | Tests if replicas compensate for load    |
| UC-24 | More Replicas On High Latency | 5 replicas at high latency                     | Tests if replicas compensate for latency |

### Real-World Simulations (UC-25 to UC-30)

| ID    | Name                | Description                          | Expected Behavior                         |
| ----- | ------------------- | ------------------------------------ | ----------------------------------------- |
| UC-25 | AWS 3-AZ Deployment | Realistic AWS latencies (0.1-0.7ms)  | Primarily load-based (latency is minimal) |
| UC-26 | Hot Spot            | One node at 95%, others at 20%       | Redirect away from hot spot               |
| UC-27 | Cold Start          | New node at 5% load                  | Attract traffic to new node               |
| UC-28 | Scale-Up            | New node added to overloaded cluster | Direct traffic to new node                |
| UC-29 | Degraded Node       | High load + high latency (degraded)  | Minimize traffic to degraded node         |
| UC-30 | Micro-Burst         | Temporary spike to 98%               | Redirect during burst                     |

### Response Time Scenarios (UC-31 to UC-35)

| ID    | Name                           | Description                                        | Expected Behavior                         |
| ----- | ------------------------------ | -------------------------------------------------- | ----------------------------------------- |
| UC-31 | One Node High Response Time    | Node-C at 300ms P95 (3x threshold)                 | Heavy redirect away from slow node        |
| UC-32 | All Nodes High Response Time   | All nodes at 250ms P95 (system stress)             | Even distribution (all equally penalized) |
| UC-33 | Low Load High Response Time    | Low CPU but slow (DB issues, GC)                   | Redirect based on response time, not load |
| UC-34 | Load vs Response Time Tradeoff | High load + fast (60ms) vs low load + slow (400ms) | Prefer fast node despite higher load      |
| UC-35 | Response Time Gradient         | 50/100/200/400ms across 4 nodes                    | Prefer fastest responding nodes in order  |

---

## Test Builders

### Helper Functions

```typescript
// Create pods for a cluster configuration
buildCluster([
  { node: 'node-a', podCount: 2, loadPercent: 50 },
  { node: 'node-b', podCount: 3, loadPercent: 30 },
]);

// Create upstream graph (traffic sources)
buildUpstream(['node-a', 'node-b']);

// Create latency matrix (default: 0 local, 5ms cross-node)
buildNodesLatency(['node-a', 'node-b']);

// Create custom latency matrix
const latencyMatrix = {
  'node-a': { 'node-a': 0, 'node-b': 100 },
  'node-b': { 'node-a': 100, 'node-b': 0 },
};
buildNodesLatency(['node-a', 'node-b'], latencyMatrix);
```

### Using Pre-built Scenarios

```typescript
import { Scenarios } from './data/testBuilders';

// Get scenario data
const { pods, upstream, nodesLatency } = Scenarios.twoNodesEqual();

// Run algorithm
const result = engine.calculateTraffic(pods, upstream, nodesLatency);
```

### Analyzing Results

```typescript
import { getTrafficPercent, printTrafficDistribution } from './data/testBuilders';

// Get specific traffic percentage
const fromAtoB = getTrafficPercent(result, 'node-a', 'node-b');

// Print formatted table
printTrafficDistribution(result, 'My Scenario');
```

---

## Adding New Scenarios

1. Add to `Scenarios` object in `testBuilders.ts`:

```typescript
myNewScenario(): {
  pods: PodMetrics[];
  upstream: GraphDataRps[];
  nodesLatency: NodesLatency[];
} {
  const nodes = ['node-a', 'node-b'];
  return {
    pods: buildCluster([
      { node: 'node-a', podCount: 2, loadPercent: 60 },
      { node: 'node-b', podCount: 2, loadPercent: 40 },
    ]),
    upstream: buildUpstream(nodes),
    nodesLatency: buildNodesLatency(nodes),
  };
},
```

2. Add test in `engine.test.ts`:

```typescript
describe('Scenario: My new scenario', () => {
  it('should behave as expected', () => {
    const { pods, upstream, nodesLatency } = Scenarios.myNewScenario();
    const result = engine.calculateTraffic(pods, upstream, nodesLatency);

    expect(getTrafficPercent(result, 'node-a', 'node-b')).toBeGreaterThan(0);
  });
});
```

3. Add to `visualize.ts` scenarios array:

```typescript
{ name: 'UC-XX: My New Scenario', data: Scenarios.myNewScenario() },
```

---

## Interpreting Results

### Sample Output

```
┌────────────────────────────────────────────────────┐
│ UC-26: Hot Spot (one node at 95%)                  │
├──────────────────┬─────────────────────────────────┤
│ From             │ Distribution                    │
├──────────────────┼─────────────────────────────────┤
│ node-a           │ node-a: 35%, node-b: 32%, node-c: 33% │
│ node-b           │ node-a: 10%, node-b: 55%, node-c: 35% │
│ node-c           │ node-a: 10%, node-c: 55%, node-b: 35% │
└──────────────────┴─────────────────────────────────┘
```

### Key Observations

1. **35% Minimum Local Share**: Only enforced when local node has >= replicas than other nodes. If local has fewer replicas, traffic can freely flow to nodes with more capacity.
2. **Load-Based Preference**: Lower-loaded nodes receive more cross-node traffic
3. **Latency Impact**: High latency destinations receive less traffic
4. **Replica Weighting**: Nodes with more replicas are considered to have more capacity

---

## Debugging Algorithm Behavior

To understand why the algorithm produces a specific distribution:

1. Run visualization: `npx tsx tests/optiBalancer/visualize.ts`
2. Check the weight calculation in `src/core/optiBalancer/engine.ts`
3. Add logging in your test:

```typescript
const result = engine.calculateTraffic(pods, upstream, nodesLatency);
console.log(JSON.stringify(result, null, 2));
```

---

## Related Files

- Algorithm implementation: `src/core/optiBalancer/engine.ts`
- Types: `src/core/optiBalancer/types.ts`
- Mapper: `src/core/optiBalancer/mapper.ts`
- Main OptiBalancer: `src/core/optiBalancer/index.ts`
