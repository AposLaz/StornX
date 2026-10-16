import { createServer } from 'node:http';
import { Database } from './database.js';
import { Broker } from './broker.js';
import { clients } from './kube.js';
import { Leader } from './leader.js';
import { logger } from './config/logger.js';
import type { Settings } from './settings.js';

/** Manage controller dependencies, leadership, background tasks, probes and shutdown. */
export class Runtime {
  readonly api;
  readonly db;
  readonly broker;
  readonly leader;
  readonly counters: Record<string, number> = {
    cycles_total: 0,
    failures_total: 0,
    decisions_total: 0,
  };
  readonly gauges: Record<string, number> = {};
  private readonly jobs = new Set<Promise<unknown>>();
  private readonly timers: ReturnType<typeof setInterval>[] = [];
  private stopping = false;
  private dependenciesHealthy = false;
  private server?: ReturnType<typeof createServer>;

  constructor(readonly config: Settings) {
    this.api = clients(config.production);
    this.db = new Database(config);
    this.broker = new Broker(config);
    this.leader = new Leader(this.api, config);
  }

  /** Recheck leadership and operator switches immediately before a cluster mutation. */
  assertMutation(): void {
    this.leader.assert();

    if (this.config.dryRun || !this.config.mutationsEnabled || this.stopping) {
      throw new Error('Mutation disabled');
    }
  }

  /** Schedule non-overlapping work, optionally restricted to the active leader. */
  every(ms: number, run: () => Promise<void>, leaderOnly = true): void {
    let running = false;
    const tick = () => {
      if (this.stopping || running || (leaderOnly && !this.leader.active)) {
        return;
      }

      running = true;

      const task = run()
        .catch((error) => {
          this.counters.failures_total++;
          logger.error('Background task failed', { error: String(error) });
        })
        .finally(() => {
          running = false;
          this.jobs.delete(task);
        });

      this.jobs.add(task);
    };

    this.timers.push(setInterval(tick, ms));
    tick();
  }

  /** Check dependencies, maintain leadership and expose health and Prometheus endpoints. */
  async start(): Promise<void> {
    await this.db.pool.query('SELECT 1');
    await this.broker.ensure();
    await this.leader.tick();
    this.dependenciesHealthy = true;

    // Standbys also renew/check dependencies; only the elected instance performs controller work.
    this.every(
      3000,
      async () => {
        try {
          await this.leader.tick();

          if (!this.leader.active) {
            await this.broker.cancel();
          }

          await this.db.pool.query('SELECT 1');
          await this.broker.ensure();
          this.dependenciesHealthy = true;
        } catch (error) {
          this.dependenciesHealthy = false;
          await this.broker.cancel();

          throw error;
        }
      },
      false,
    );

    // Liveness tracks process shutdown; readiness tracks whether dependencies are usable.
    this.server = createServer((req, res) => {
      if (req.url === '/metrics') {
        res.setHeader('Content-Type', 'text/plain; version=0.0.4');

        const metrics = {
          ...this.counters,
          ...this.broker.counters,
          ...this.gauges,
          leader: this.leader.active ? 1 : 0,
          dependencies_ready: this.dependenciesHealthy ? 1 : 0,
        };

        res.end(
          Object.entries(metrics)
            .map(([key, value]) => `stornx_${key} ${value}`)
            .join('\n') + '\n',
        );

        return;
      }

      if (req.url === '/health/live') {
        res.writeHead(this.stopping ? 503 : 200);
        res.end('ok');

        return;
      }

      if (req.url === '/health/ready') {
        res.writeHead(!this.stopping && this.dependenciesHealthy ? 200 : 503);
        res.end(this.dependenciesHealthy ? 'ready' : 'unavailable');

        return;
      }

      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject);
      this.server!.listen(this.config.port, resolve);
    });

    for (const signal of ['SIGTERM', 'SIGINT'] as const) {
      process.once(signal, () => {
        void this.stop();
      });
    }
  }

  /**
   * Stop new work, drain running tasks and release resources within the pod termination
   * deadline.
   */
  async stop(): Promise<void> {
    if (this.stopping) {
      return;
    }

    this.stopping = true;

    this.leader.stop();

    for (const timer of this.timers) {
      clearInterval(timer);
    }

    const deadline = setTimeout(() => {
      logger.error('Shutdown deadline exceeded');
      process.exit(1);
    }, 25000);

    deadline.unref();
    await this.broker.cancel();
    await Promise.allSettled([...this.jobs]);
    await this.broker.close();
    await this.db.pool.end();
    this.server?.close();
    clearTimeout(deadline);
  }
}
