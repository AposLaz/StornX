/**
 * Test the prometheus mappers
 */

import { DummyPromMetrics } from './data/data';
import { PrometheusMapper } from '../../src/adapters/prometheus/mapper';

describe('prometheus mappers', () => {
  it('nodesLatency', () => {
    const results = DummyPromMetrics.latency;
    const latency = PrometheusMapper.toNodesLatency(results);

    expect(latency).toEqual([
      {
        from: 'node1',
        to: 'node2',
        latency: 0.9160250000000001,
      },
      {
        from: 'node2',
        to: 'node1',
        latency: 0.88663,
      },
      {
        from: 'node1',
        to: 'node3',
        latency: 0.8242775,
      },
      {
        from: 'node3',
        to: 'node1',
        latency: 0.8736125,
      },
      {
        from: 'node3',
        to: 'node2',
        latency: 0.79895,
      },
      {
        from: 'node2',
        to: 'node3',
        latency: 0.7874425,
      },
      {
        from: 'node1',
        to: 'node1',
        latency: 0,
      },
      {
        from: 'node2',
        to: 'node2',
        latency: 0,
      },
      {
        from: 'node3',
        to: 'node3',
        latency: 0,
      },
    ]);
  });
});
