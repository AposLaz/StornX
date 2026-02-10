# OptiScaler

OptiScaler is the intelligent pod autoscaling component of TrafficScheduler. It determines optimal placement for new replicas during scale-up operations and identifies candidates for removal during scale-down, while respecting fault tolerance constraints.

## Overview

OptiScaler makes scaling decisions based on:

1. **Fault Tolerance Rules** - Ensures replicas are distributed across availability zones
2. **Service Graph Analysis** - Uses upstream/downstream relationships for optimal placement
3. **Resource Metrics** - Considers CPU, memory, and custom metrics for node selection
4. **Safety Guards** - Cooldown periods, HPA coordination, and PDB awareness

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              OptiScaler                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐    ┌──────────────────┐    ┌─────────────────────┐    │
│  │  Safety Checks  │───▶│  Fault Tolerance │───▶│  Node Selection    │    │
│  │                 │    │                  │    │                     │    │
│  │  • Cooldown     │    │  • Zone spread   │    │  • Upstream (Um)    │    │
│  │  • HPA check    │    │  • Resource fit  │    │  • Downstream (Dm)  │    │
│  │  • PDB check    │    │  • Skew balance  │    │  • LFU fallback     │    │
│  └─────────────────┘    └──────────────────┘    └─────────────────────┘    │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        CooldownManager                               │   │
│  │  • Tracks last scaling time per deployment                          │   │
│  │  • Prevents rapid scaling thrashing                                 │   │
│  │  • Configurable period (default 60s)                                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Decision Flow

### Scale Up Decision Tree

```
                    ┌──────────────────────┐
                    │   Trigger Scale Up   │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │  Check Cooldown      │
                    │  In cooldown period? │
                    └──────────┬───────────┘
                               │
              ┌────────────────┼────────────────┐
              │ Yes            │                │ No
              ▼                │                ▼
     ┌────────────────┐        │       ┌────────────────┐
     │ Skip Scaling   │        │       │  Check HPA     │
     │ (log remaining │        │       │  HPA exists?   │
     │  time)         │        │       └────────┬───────┘
     └────────────────┘        │                │
                               │   ┌────────────┼────────────┐
                               │   │ Yes        │            │ No
                               │   ▼            │            ▼
                               │  ┌─────────────┴──┐  ┌──────────────┐
                               │  │ Skip Scaling   │  │ Fault        │
                               │  │ (let HPA       │  │ Tolerance    │
                               │  │  manage it)    │  │ Check        │
                               │  └────────────────┘  └──────┬───────┘
                                                             │
                                                    ┌────────▼───────┐
                                                    │ Get candidate  │
                                                    │ zones with     │
                                                    │ capacity       │
                                                    └────────┬───────┘
                                                             │
                                            ┌────────────────┼────────────────┐
                                            │                │                │
                                            ▼                ▼                ▼
                                   ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
                                   │ 1 candidate  │ │ >1 candidates│ │ 0 candidates │
                                   │ Use directly │ │ Graph-based  │ │ No scaling   │
                                   └──────────────┘ │ selection    │ └──────────────┘
                                                    └──────┬───────┘
                                                           │
                                          ┌────────────────┼────────────────┐
                                          │                │                │
                                          ▼                ▼                ▼
                                   ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
                                   │ Has Upstream │ │Has Downstream│ │  No Graph    │
                                   │ Use Um       │ │ Use Dm       │ │  Use LFU     │
                                   └──────────────┘ └──────────────┘ └──────────────┘
```

### Scale Down Decision Tree

```
                    ┌──────────────────────┐
                    │  Trigger Scale Down  │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │  Check Cooldown      │
                    └──────────┬───────────┘
                               │
              ┌────────────────┼────────────────┐
              │ Yes            │                │ No
              ▼                │                ▼
     ┌────────────────┐        │       ┌────────────────┐
     │ Skip Scaling   │        │       │  Check HPA     │
     └────────────────┘        │       └────────┬───────┘
                               │                │
                               │   ┌────────────┼────────────┐
                               │   │ Yes        │            │ No
                               │   ▼            │            ▼
                               │  ┌─────────────┴──┐  ┌──────────────┐
                               │  │ Skip Scaling   │  │  Check PDB   │
                               │  └────────────────┘  └──────┬───────┘
                                                             │
                                            ┌────────────────┼────────────────┐
                                            │ Violates PDB   │                │
                                            ▼                ▼                │
                                   ┌──────────────┐  ┌──────────────┐         │
                                   │ Skip Scaling │  │ Fault        │         │
                                   │ (protect PDB)│  │ Tolerance    │         │
                                   └──────────────┘  │ Check        │         │
                                                     └──────┬───────┘         │
                                                            │                 │
                                                   ┌────────▼───────┐         │
                                                   │ Find most      │         │
                                                   │ loaded node    │         │
                                                   │ in highest-    │         │
                                                   │ replica zone   │         │
                                                   └────────┬───────┘         │
                                                            │                 │
                                                   ┌────────▼───────┐         │
                                                   │ Remove random  │         │
                                                   │ pod from node  │         │
                                                   └────────────────┘         │
```

## Node Selection Algorithms

### 1. Upstream Method (Um)

When the deployment has upstream services sending traffic to it:

```
Weight(node) = Σ (latency_from_upstream × upstream_rps_share)
```

- Lower weight = better candidate
- Prioritizes nodes closer to high-traffic upstream services
- Minimizes network latency for incoming requests

### 2. Downstream Method (Dm)

When the deployment sends traffic to downstream services:

```
Weight(node) = Σ (latency_to_downstream × downstream_rps_share)
```

- Lower weight = better candidate
- Prioritizes nodes closer to heavily-used downstream dependencies
- Reduces latency for outgoing calls

### 3. LFU (Least Frequently Used) Fallback

When no service graph data is available:

```
Score(node) = (cpu_weight × cpu_utilization) +
              (memory_weight × memory_utilization) +
              (bandwidth_weight × bandwidth_utilization)
```

- Lower score = better candidate (more available resources)
- Uses configurable metric weights
- Falls back to simple resource-based selection

## Fault Tolerance

OptiScaler ensures high availability through zone-aware scheduling:

### Zone Distribution Rules

1. **Minimum zones** - Spread replicas across `faultTolerance.maxZones` zones
2. **Skew limit** - Maximum difference in replica count between zones
3. **Resource filtering** - Only consider nodes with sufficient resources

### Example Distribution

For a deployment with 5 replicas and 3 zones:

```
Zone A: 2 replicas  ✓ (balanced)
Zone B: 2 replicas  ✓ (balanced)
Zone C: 1 replica   ✓ (balanced, skew = 1)

Zone A: 3 replicas  ✗ (skew = 2, would add to B or C instead)
```

## Safety Guards

### 1. Cooldown Period

Prevents rapid scaling thrashing by enforcing a minimum time between scaling operations.

```yaml
# Environment variable
SCALER_COOLDOWN_SECONDS=60  # Default: 60 seconds
```

**How it works:**
- After any scale up/down, the deployment enters cooldown
- Subsequent scaling requests are skipped until cooldown expires
- Each deployment has its own independent cooldown timer

**Example log output:**
```
Skipping scaling for "frontend" - cooldown active (45s remaining)
```

### 2. HPA Coordination

Avoids conflicts with Kubernetes Horizontal Pod Autoscaler.

```yaml
# Environment variable
SCALER_RESPECT_HPA=true  # Default: true
```

**When enabled:**
- Checks if an HPA targets the deployment before scaling
- Skips scaling if HPA exists (lets HPA manage replica count)
- OptiScaler still handles traffic distribution (OptiBalancer)

**Example log output:**
```
Skipping scaling for "frontend" - HPA is managing this deployment
```

### 3. PDB Awareness

Respects Pod Disruption Budget constraints during scale-down.

```yaml
# Environment variable
SCALER_RESPECT_PDB=true  # Default: true
```

**When enabled:**
- Checks PDB before removing pods
- Prevents scale-down if it would violate `minAvailable`
- Blocks scale-down if `maxUnavailable` is 0

**Example log output:**
```
Skipping scale down for "frontend" - would violate Pod Disruption Budget
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SCALER_COOLDOWN_SECONDS` | `60` | Minimum seconds between scaling operations |
| `SCALER_RESPECT_HPA` | `true` | Skip scaling if HPA exists for deployment |
| `SCALER_RESPECT_PDB` | `true` | Check PDB before scale-down operations |
| `FAULT_TOLERANCE_MAX_ZONES` | `3` | Maximum zones to spread replicas across |

### Metric Weights

Configure the importance of different metrics in node selection:

```typescript
const weights: MetricWeights = {
  cpu: 0.4,
  memory: 0.3,
  bandwidth: 0.3,
};
```

## Integration with OptiBalancer

After scaling, OptiScaler writes to a file to trigger OptiBalancer in the next cycle:

```
Scale Up → OptiScaler adds replica → OptiBalancer redistributes traffic weights
```

This ensures traffic is properly distributed to the new replica.

## Monitoring

### Key Metrics to Watch

1. **Scaling frequency** - How often deployments scale
2. **Cooldown skips** - How many scaling requests were blocked by cooldown
3. **HPA conflicts** - How often OptiScaler defers to HPA
4. **PDB blocks** - How often scale-down was prevented by PDB

### Log Messages

| Level | Message | Meaning |
|-------|---------|---------|
| INFO | `Add replica pod of deployment X to node Y` | Scale up successful |
| INFO | `Skipping scaling - cooldown active` | Cooldown protection |
| INFO | `Skipping scaling - HPA is managing` | HPA deference |
| WARN | `Skipping scale down - would violate PDB` | PDB protection |
| WARN | `No zones have sufficient resources` | Cluster capacity issue |

## Testing

Run the OptiScaler test suite:

```bash
npm test -- --testPathPattern=optiScaler
```

Test files:
- `cooldown.test.ts` - CooldownManager unit tests
- `autoscaling.service.test.ts` - HPA/PDB service tests
- `OptiScaler.test.ts` - Integration tests
- `getFaultToleranceNodes.test.ts` - Fault tolerance logic
- `getCandidateNodeBy*.test.ts` - Node selection algorithms

## Troubleshooting

### Common Issues

**1. Pods not scaling**
- Check if cooldown is active
- Verify HPA doesn't exist for the deployment
- Ensure nodes have available resources

**2. Replicas not spreading across zones**
- Check `faultTolerance.maxZones` configuration
- Verify nodes have correct zone labels
- Ensure resource requests fit on nodes

**3. PDB blocking all scale-downs**
- Review PDB `minAvailable` settings
- Consider temporary PDB updates during maintenance
- Use `SCALER_RESPECT_PDB=false` for testing (not production)

## Future Improvements

- [ ] Support percentage-based PDB values
- [ ] Custom cooldown per deployment annotations
- [ ] Predictive scaling based on historical patterns
- [ ] Integration with cluster autoscaler for node provisioning
