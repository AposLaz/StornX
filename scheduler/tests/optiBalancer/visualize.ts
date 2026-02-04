/**
 * Traffic Distribution Visualization Script













































































































































































































































































- Main OptiBalancer: `src/core/optiBalancer/index.ts`- Mapper: `src/core/optiBalancer/mapper.ts`- Types: `src/core/optiBalancer/types.ts`- Algorithm implementation: `src/core/optiBalancer/engine.ts`## Related Files---```console.log(JSON.stringify(result, null, 2));const result = engine.calculateTraffic(pods, upstream, nodesLatency);```typescript3. Add logging in your test:2. Check the weight calculation in `src/core/optiBalancer/engine.ts`1. Run visualization: `npx tsx tests/optiBalancer/visualize.ts`To understand why the algorithm produces a specific distribution:## Debugging Algorithm Behavior---4. **Replica Weighting**: Nodes with more replicas are considered to have more capacity3. **Latency Impact**: High latency destinations receive less traffic2. **Load-Based Preference**: Lower-loaded nodes receive more cross-node traffic1. **35% Minimum Local Share**: Even heavily overloaded nodes keep at least 35% of their own traffic### Key Observations```└──────────────────┴─────────────────────────────────┘│ node-c           │ node-a: 10%, node-c: 55%, node-b: 35% ││ node-b           │ node-a: 10%, node-b: 55%, node-c: 35% ││ node-a           │ node-a: 35%, node-b: 32%, node-c: 33% │├──────────────────┼─────────────────────────────────┤│ From             │ Distribution                    │├──────────────────┬─────────────────────────────────┤│ UC-26: Hot Spot (one node at 95%)                  │┌────────────────────────────────────────────────────┐```### Sample Output## Interpreting Results---```{ name: 'UC-XX: My New Scenario', data: Scenarios.myNewScenario() },```typescript3. Add to `visualize.ts` scenarios array:```});  });    expect(getTrafficPercent(result, 'node-a', 'node-b')).toBeGreaterThan(0);        const result = engine.calculateTraffic(pods, upstream, nodesLatency);    const { pods, upstream, nodesLatency } = Scenarios.myNewScenario();  it('should behave as expected', () => {describe('Scenario: My new scenario', () => {```typescript2. Add test in `engine.test.ts`:```},  };    nodesLatency: buildNodesLatency(nodes),    upstream: buildUpstream(nodes),    ]),      { node: 'node-b', podCount: 2, loadPercent: 40 },      { node: 'node-a', podCount: 2, loadPercent: 60 },    pods: buildCluster([  return {  const nodes = ['node-a', 'node-b'];} {  nodesLatency: NodesLatency[];  upstream: GraphDataRps[];  pods: PodMetrics[];myNewScenario(): {```typescript1. Add to `Scenarios` object in `testBuilders.ts`:## Adding New Scenarios---```printTrafficDistribution(result, 'My Scenario');// Print formatted tableconst fromAtoB = getTrafficPercent(result, 'node-a', 'node-b');// Get specific traffic percentageimport { getTrafficPercent, printTrafficDistribution } from './data/testBuilders';```typescript### Analyzing Results```const result = engine.calculateTraffic(pods, upstream, nodesLatency);// Run algorithmconst { pods, upstream, nodesLatency } = Scenarios.twoNodesEqual();// Get scenario dataimport { Scenarios } from './data/testBuilders';```typescript### Using Pre-built Scenarios```buildNodesLatency(['node-a', 'node-b'], latencyMatrix);};  'node-b': { 'node-a': 100, 'node-b': 0 },  'node-a': { 'node-a': 0, 'node-b': 100 },const latencyMatrix = {// Create custom latency matrixbuildNodesLatency(['node-a', 'node-b']);// Create latency matrix (default: 0 local, 5ms cross-node)buildUpstream(['node-a', 'node-b']);// Create upstream graph (traffic sources)]);  { node: 'node-b', podCount: 3, loadPercent: 30 },  { node: 'node-a', podCount: 2, loadPercent: 50 },buildCluster([// Create pods for a cluster configuration```typescript### Helper Functions## Test Builders---| UC-30 | Micro-Burst | Temporary spike to 98% | Redirect during burst || UC-29 | Degraded Node | High load + high latency (degraded) | Minimize traffic to degraded node || UC-28 | Scale-Up | New node added to overloaded cluster | Direct traffic to new node || UC-27 | Cold Start | New node at 5% load | Attract traffic to new node || UC-26 | Hot Spot | One node at 95%, others at 20% | Redirect away from hot spot || UC-25 | AWS 3-AZ Deployment | Realistic AWS latencies (0.1-0.7ms) | Primarily load-based (latency is minimal) ||----|------|-------------|-------------------|| ID | Name | Description | Expected Behavior |### Real-World Simulations (UC-25 to UC-30)| UC-24 | More Replicas On High Latency | 5 replicas at high latency | Tests if replicas compensate for latency || UC-23 | More Replicas On Overloaded | 5 replicas at 80% vs 1 replica at 20% | Tests if replicas compensate for load || UC-22 | Load vs Latency Tradeoff | High-load/low-latency vs low-load/high-latency | Algorithm balances both factors || UC-21 | Worst Node | High load + high latency | Minimize traffic to this node ||----|------|-------------|-------------------|| ID | Name | Description | Expected Behavior |### Combined Factors (UC-21 to UC-24)| UC-20 | Partial Deployment | One node has no pods | Source with no pods sends all traffic out || UC-19 | Highly Uneven Replicas | 10:1 replica ratio | Heavy preference for more replicas ||----|------|-------------|-------------------|| ID | Name | Description | Expected Behavior |### Replica Distribution (UC-19 to UC-20)| UC-18 | Multi-Region | EU/US/Asia with realistic latencies | Prefer closer regions || UC-17 | Uniform Latency | All cross-node at 10ms | Distribution based on load only || UC-16 | Asymmetric Latency | A→B fast (5ms), B→A slow (100ms) | Different distributions per direction || UC-15 | Extreme Latency | 500ms cross-node latency | Heavily favor local traffic ||----|------|-------------|-------------------|| ID | Name | Description | Expected Behavior |### Latency Scenarios (UC-15 to UC-18)| UC-14 | One Node At Threshold | One node exactly at 70% | Moderate redirection || UC-13 | Load Gradient | 10%/30%/50%/70%/90% | Prefer lighter nodes in order || UC-12 | All Nodes Idle | All nodes at 0% load | Even distribution based on replicas || UC-11 | Extreme Load Difference | 95% vs 5% load | Heavy redirection to light node ||----|------|-------------|-------------------|| ID | Name | Description | Expected Behavior |### Load Distribution (UC-11 to UC-14)| UC-10 | Five Nodes Cluster | 5 nodes with varying loads | Distribute across all 5 nodes || UC-09 | Single Replica | Only one pod total | All traffic goes to single pod || UC-08 | Single Node | Only one node exists | 100% local traffic ||----|------|-------------|-------------------|| ID | Name | Description | Expected Behavior |### Edge Cases (UC-08 to UC-10)| UC-07 | Cross-AZ Latency | 3 zones with varying latencies | Prefer lower-latency destinations || UC-06 | Uneven Replicas | 4/2/1 replicas per node | Send more traffic to nodes with more replicas || UC-05 | All Nodes Overloaded | All nodes at 90% load | Fall back to replica-based distribution || UC-04 | Three Nodes Varying Load | 80%/50%/20% load distribution | Prefer lightest-loaded node || UC-03 | One Node High Latency | Node-B has 100ms latency | Prefer local over slow remote || UC-02 | One Node Overloaded | Node-A at 90% load, Node-B at 30% | Traffic shifts toward lighter node || UC-01 | Two Nodes Equal | Two nodes with identical load (50%) and replicas | Even distribution (~67% local, ~33% cross) ||----|------|-------------|-------------------|| ID | Name | Description | Expected Behavior |### Basic Scenarios (UC-01 to UC-07)## Use Cases (30 Scenarios)---```├── README.md              # This file│   └── testBuilders.ts    # Test data builders and pre-defined scenarios├── data/├── visualize.ts           # Interactive visualization script├── engine.test.ts         # Main test file with all unit and scenario teststests/optiBalancer/```## Test File Structure---This outputs a formatted table showing how traffic is distributed for each scenario.```npx tsx tests/optiBalancer/visualize.tscd scheduler```bashTo see the actual traffic distributions for all 30 use cases:### Run Visualization Script```npm test -- tests/optiBalancer/engine.test.ts -t "Single node cluster"# Run a specific scenarionpm test -- tests/optiBalancer/engine.test.ts -t "Scenario"# Run only scenario tests```bash### Run Specific Test Suite```npm test -- tests/optiBalancer/engine.test.tscd scheduler```bash### Run All Tests## Running the Tests---- 10% delta threshold (ignores small changes)- 5% maximum shift per apply cycle (gradual redistribution)- 35% minimum local share (traffic stays on its origin node)**Constraints:**```weight = (1 - normalizedLatency) * normalizedPodsLength * (1 - normalizedLoad)```**Formula:**3. **Replica Count** - Number of pods on each node (more = more capacity)2. **Load** - CPU/Memory utilization (lower is better)1. **Latency** - Network latency between nodes (lower is better)The OptiBalancer uses a weight-based algorithm to distribute traffic across nodes based on three factors:## OverviewThis directory contains comprehensive tests for the OptiBalancer traffic distribution algorithm. *
 * Run with: npx tsx tests/optiBalancer/visualize.ts
 *
 * This script helps you understand how the TrafficEngine algorithm behaves
 * under different scenarios. Use it to experiment with algorithm improvements.
 */

import {
  buildCluster,
  buildNodesLatency,
  buildUpstream,
  printTrafficDistribution,
  Scenarios,
} from './data/testBuilders.js';
import { TrafficEngine } from '../../src/core/optiBalancer/engine.js';
import { MetricsType } from '../../src/enums.js';

const engine = new TrafficEngine(MetricsType.CPU_MEMORY);

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║         TRAFFIC DISTRIBUTION ALGORITHM VISUALIZATION          ║');
console.log('╚════════════════════════════════════════════════════════════════╝');
console.log('');
console.log('Formula: weight = (1 - rtPenalty) * (1 - latency) * replicas * (1 - load)');
console.log('Response Time Penalty: 1 - 1/(1 + ln(P95/threshold))');
console.log('Constraints: 35% min local share (when local replicas >= max others), 5-20% adaptive step');
console.log('');

// ============================================
// ALL PREDEFINED SCENARIOS
// ============================================

const allScenarios = [
  // Basic scenarios (UC-01 to UC-07)
  { name: 'UC-01: Two Nodes Equal Load', data: Scenarios.twoNodesEqual() },
  { name: 'UC-02: One Node Overloaded (90% vs 30%)', data: Scenarios.twoNodesOneOverloaded() },
  { name: 'UC-03: One Node High Latency (100ms)', data: Scenarios.twoNodesOneHighLatency() },
  { name: 'UC-04: Three Nodes Varying Load (80/50/20%)', data: Scenarios.threeNodesVaryingLoad() },
  { name: 'UC-05: All Nodes Overloaded (90%)', data: Scenarios.allNodesOverloaded() },
  { name: 'UC-06: Uneven Replicas (4/2/1)', data: Scenarios.unevenReplicas() },
  { name: 'UC-07: Cross-AZ Latency (5/6/8ms)', data: Scenarios.crossAzLatency() },

  // Edge cases (UC-08 to UC-10)
  { name: 'UC-08: Single Node Cluster', data: Scenarios.singleNode() },
  { name: 'UC-09: Single Replica Total', data: Scenarios.singleReplica() },
  { name: 'UC-10: Five Nodes Cluster', data: Scenarios.fiveNodesCluster() },

  // Load distribution (UC-11 to UC-14)
  { name: 'UC-11: Extreme Load Difference (95% vs 5%)', data: Scenarios.extremeLoadDifference() },
  { name: 'UC-12: All Nodes Idle (0% load)', data: Scenarios.allNodesIdle() },
  { name: 'UC-13: Load Gradient (10-90%)', data: Scenarios.loadGradient() },
  { name: 'UC-14: One Node At Threshold (70%)', data: Scenarios.oneNodeAtThreshold() },

  // Latency scenarios (UC-15 to UC-18)
  { name: 'UC-15: Extreme Latency (500ms)', data: Scenarios.extremeLatencyDifference() },
  { name: 'UC-16: Asymmetric Latency (A→B fast, B→A slow)', data: Scenarios.asymmetricLatency() },
  { name: 'UC-17: Uniform Latency (all 10ms)', data: Scenarios.uniformLatency() },
  { name: 'UC-18: Multi-Region (EU/US/Asia)', data: Scenarios.multiRegion() },

  // Replica distribution (UC-19 to UC-20)
  { name: 'UC-19: Highly Uneven Replicas (10:1)', data: Scenarios.highlyUnevenReplicas() },
  { name: 'UC-20: Partial Deployment (node without pods)', data: Scenarios.partialDeployment() },

  // Combined factors (UC-21 to UC-24)
  { name: 'UC-21: Worst Node (high load + high latency)', data: Scenarios.worstNode() },
  { name: 'UC-22: Load vs Latency Tradeoff', data: Scenarios.loadVsLatencyTradeoff() },
  { name: 'UC-23: More Replicas On Overloaded Node', data: Scenarios.moreReplicasOnOverloaded() },
  { name: 'UC-24: More Replicas On High Latency Node', data: Scenarios.moreReplicasOnHighLatency() },

  // Real-world simulations (UC-25 to UC-30)
  { name: 'UC-25: AWS 3-AZ Deployment', data: Scenarios.awsThreeAz() },
  { name: 'UC-26: Hot Spot (one node at 95%)', data: Scenarios.hotSpot() },
  { name: 'UC-27: Cold Start (new node at 5%)', data: Scenarios.coldStart() },
  { name: 'UC-28: Scale-Up (new node added)', data: Scenarios.scaleUp() },
  { name: 'UC-29: Degraded Node', data: Scenarios.degradedNode() },
  { name: 'UC-30: Micro-Burst (spike to 98%)', data: Scenarios.microBurst() },

  // Response time scenarios (UC-31 to UC-35)
  { name: 'UC-31: One Node High Response Time (300ms)', data: Scenarios.oneNodeHighResponseTime() },
  { name: 'UC-32: All Nodes High Response Time (250ms)', data: Scenarios.allNodesHighResponseTime() },
  { name: 'UC-33: Low Load But High Response Time', data: Scenarios.lowLoadHighResponseTime() },
  { name: 'UC-34: Load vs Response Time Tradeoff', data: Scenarios.loadVsResponseTimeTradeoff() },
  { name: 'UC-35: Response Time Gradient (50-400ms)', data: Scenarios.responseTimeGradient() },
];

for (const scenario of allScenarios) {
  const result = engine.calculateTraffic(
    scenario.data.pods,
    scenario.data.upstream,
    scenario.data.nodesLatency,
    scenario.data.nodeResponseTimes
  );
  printTrafficDistribution(result, scenario.name);
}

// ============================================
// ANALYSIS SUMMARY
// ============================================
console.log('\n');
console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║                      OBSERVATIONS                              ║');
console.log('╚════════════════════════════════════════════════════════════════╝');
console.log(`
Key things to observe:

1. P95 RESPONSE TIME (PRIMARY FACTOR)
   - Nodes with high response time get heavily penalized
   - Logarithmic penalty: penalty = 1 - 1/(1 + ln(ratio))
   - Max penalty capped at 0.9 (never completely starve)
   - Default threshold: 100ms P95

2. LOCAL SHARE ENFORCEMENT (35% minimum)
   - Only enforced when local replicas >= max replicas of other nodes
   - If local has fewer replicas, traffic can flow freely

3. LOAD NORMALIZATION (relative, not absolute)
   - When all nodes are equally loaded, load factor becomes neutral
   - 90% vs 90% looks same as 10% vs 10%

4. ADAPTIVE STEPPING (5-20%)
   - Small deltas (5-10%): 5% step size (gentle)
   - Large deltas (50%+): 20% step size (aggressive)
   - Urgency = delta / 50 (capped at 1)

5. LATENCY IMPACT
   - High latency nodes receive less traffic
   - But 0.9 cap prevents complete starvation

6. REPLICA COUNT
   - More replicas = more traffic capacity
   - Nodes with 4 pods get more than nodes with 1 pod

Try modifying the scenarios above to test specific cases!
`);
