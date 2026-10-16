import { randomUUID } from 'node:crypto';
import type { WorkloadChanged } from '@stornx/event-contracts';
import type { Database, Transaction } from '@stornx/platform/database.js';

/**
 * A coalesced workload reconciliation request; revisions protect work arriving during execution.
 */
export interface Job {
  cluster_id: string;
  namespace: string;
  name: string;
  uid: string;
  revision: number;
  attempts: number;
  status: string;
}

/** A persisted routing intent used to recognize successful writes after a lost API response. */
export interface RoutingDecision {
  id: string;
  resource_key: string;
  cluster_id: string;
  namespace: string;
  name: string;
  workload_name: string;
  workload_uid: string;
  resource_uid: string | null;
  resource_version: string | null;
  fingerprint: string;
  desired: Distribution[];
  status: string;
  created_at: Date;
}

export type Distribution = { from: string; to: Record<string, number> };

/** Initial balancer schema, applied explicitly before starting the controller. */
export const migration = `
  CREATE SCHEMA IF NOT EXISTS optibalancer;

  CREATE TABLE IF NOT EXISTS optibalancer.schema_version (
    version integer PRIMARY KEY
  );

  INSERT INTO optibalancer.schema_version
  VALUES (1)
  ON CONFLICT DO NOTHING;

  CREATE TABLE IF NOT EXISTS optibalancer.inbox (
    id text PRIMARY KEY,
    payload jsonb NOT NULL,
    received_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS optibalancer.jobs (
    cluster_id text NOT NULL,
    namespace text NOT NULL,
    name text NOT NULL,
    uid text NOT NULL,
    revision integer NOT NULL DEFAULT 1,
    attempts integer NOT NULL DEFAULT 0,
    status text NOT NULL DEFAULT 'pending',
    next_attempt_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    error text,
    PRIMARY KEY (cluster_id, namespace, uid),
    CHECK (status IN ('pending', 'done', 'dead-letter'))
  );

  CREATE TABLE IF NOT EXISTS optibalancer.routing_state (
    resource_key text PRIMARY KEY,
    next_eligible_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS optibalancer.decisions (
    id uuid PRIMARY KEY,
    resource_key text NOT NULL,
    cluster_id text NOT NULL,
    namespace text NOT NULL,
    name text NOT NULL,
    workload_name text NOT NULL,
    workload_uid text NOT NULL,
    resource_uid text,
    resource_version text,
    fingerprint text NOT NULL,
    desired jsonb NOT NULL,
    input jsonb NOT NULL,
    policy_version text NOT NULL DEFAULT '1.0.0',
    status text NOT NULL DEFAULT 'pending',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    error text,
    CHECK (status IN ('pending', 'applied', 'superseded', 'dry-run'))
  );

  CREATE UNIQUE INDEX IF NOT EXISTS one_pending_route
    ON optibalancer.decisions (resource_key)
    WHERE status = 'pending';
`;

/** Own the inbox, reconciliation queue and routing audit without reading scaler tables. */
export class BalancerJournal {
  constructor(readonly db: Database) {}

  /** Refuse startup against an unsupported schema instead of silently changing it. */
  async verify() {
    const result = await this.db.pool.query('SELECT version FROM optibalancer.schema_version');

    if (result.rows.length !== 1 || result.rows[0].version !== 1) {
      throw new Error('Unsupported balancer journal schema; run migrations');
    }
  }

  /** Coalesce work by workload identity and advance the revision when a newer request arrives. */
  private async enqueue(
    tx: Transaction,
    job: Pick<Job, 'cluster_id' | 'namespace' | 'name' | 'uid'>,
  ) {
    await tx.query(
      `
        INSERT INTO optibalancer.jobs (
          cluster_id,
          namespace,
          name,
          uid
        )
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (cluster_id, namespace, uid) DO UPDATE
        SET name = excluded.name,
            revision = optibalancer.jobs.revision + 1,
            status = 'pending',
            attempts = 0,
            next_attempt_at = LEAST(optibalancer.jobs.next_attempt_at, now()),
            updated_at = now()
      `,
      [job.cluster_id, job.namespace, job.name, job.uid],
    );
  }

  /**
   * Commit deduplication and job creation together before the broker delivery can be
   * acknowledged.
   */
  async accept(event: WorkloadChanged): Promise<void> {
    await this.db.transaction(async (tx) => {
      const inserted = await tx.query(
        `
          INSERT INTO optibalancer.inbox (
            id,
            payload
          )
          VALUES ($1, $2)
          ON CONFLICT DO NOTHING
          RETURNING id
        `,
        [event.id, JSON.stringify(event)],
      );

      if (inserted.rowCount) {
        await this.enqueue(tx, {
          cluster_id: event.clusterId,
          namespace: event.namespace,
          name: event.workload.name,
          uid: event.workload.uid,
        });
      } else {
        const existing = await tx.query(
          'SELECT payload=$2::jsonb AS same FROM optibalancer.inbox WHERE id=$1',
          [event.id, JSON.stringify(event)],
        );

        if (!existing.rows[0]?.same) {
          throw new Error('Event ID reused with a different payload');
        }
      }
    });
  }

  /** Queue periodic reconciliation through the same durable path used by incoming events. */
  async request(job: Pick<Job, 'cluster_id' | 'namespace' | 'name' | 'uid'>): Promise<void> {
    await this.db.transaction((tx) => this.enqueue(tx, job));
  }

  /** Read a bounded batch whose retry delay has elapsed for this cluster. */
  async due(clusterId: string): Promise<Job[]> {
    return (
      await this.db.pool.query(
        `
          SELECT *
          FROM optibalancer.jobs
          WHERE cluster_id = $1
            AND status = 'pending'
            AND next_attempt_at <= now()
          ORDER BY next_attempt_at
          LIMIT 50
        `,
        [clusterId],
      )
    ).rows;
  }

  /**
   * Complete only the revision processed, preserving newer events received during
   * reconciliation.
   */
  async done(job: Job) {
    await this.db.pool.query(
      `
        UPDATE optibalancer.jobs
        SET status = 'done',
            updated_at = now(),
            error = NULL
        WHERE cluster_id = $1
          AND namespace = $2
          AND uid = $3
          AND revision = $4
      `,
      [job.cluster_id, job.namespace, job.uid, job.revision],
    );
  }

  /** Persist exponential backoff or a terminal dead-letter status after repeated failures. */
  async retry(job: Job, error: unknown, maxAttempts: number) {
    await this.db.pool.query(
      `
        UPDATE optibalancer.jobs
        SET attempts = attempts + 1,
            error = $5,
            updated_at = now(),
            status = CASE WHEN attempts + 1 >= $6 THEN 'dead-letter' ELSE 'pending' END,
            next_attempt_at = now() + (
              LEAST(120, 5 * power(2, LEAST(attempts, 5))) * interval '1 second'
            )
        WHERE cluster_id = $1
          AND namespace = $2
          AND uid = $3
          AND revision = $4
      `,
      [job.cluster_id, job.namespace, job.uid, job.revision, String(error), maxAttempts],
    );
  }

  /**
   * Find the unresolved decision that must be recovered before calculating another routing step.
   */
  async pending(key: string): Promise<RoutingDecision | undefined> {
    return (
      await this.db.pool.query(
        `
          SELECT *
          FROM optibalancer.decisions
          WHERE resource_key = $1 AND status = 'pending'
        `,
        [key],
      )
    ).rows[0];
  }

  /** Check the durable adjustment deadline so duplicate events cannot speed up traffic shifts. */
  async eligible(key: string): Promise<boolean> {
    return !(
      await this.db.pool.query(
        `
          SELECT 1
          FROM optibalancer.routing_state
          WHERE resource_key = $1
            AND next_eligible_at > now()
        `,
        [key],
      )
    ).rowCount;
  }

  /** Persist the desired weights and input snapshot before issuing a Kubernetes mutation. */
  async decision(
    data: Omit<RoutingDecision, 'id' | 'created_at'>,
    input: unknown,
  ): Promise<RoutingDecision> {
    const result = await this.db.pool.query(
      `
        INSERT INTO optibalancer.decisions (
          id,
          resource_key,
          cluster_id,
          namespace,
          name,
          workload_name,
          workload_uid,
          resource_uid,
          resource_version,
          fingerprint,
          desired,
          status,
          input
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *
      `,
      [
        randomUUID(),
        data.resource_key,
        data.cluster_id,
        data.namespace,
        data.name,
        data.workload_name,
        data.workload_uid,
        data.resource_uid,
        data.resource_version,
        data.fingerprint,
        JSON.stringify(data.desired),
        data.status,
        JSON.stringify(input),
      ],
    );

    return result.rows[0];
  }

  /** Complete the decision and start the next adjustment delay in the same transaction. */
  async finish(
    decision: RoutingDecision,
    status: 'applied' | 'superseded',
    intervalMs: number,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.query(
        `
          UPDATE optibalancer.decisions
          SET status = $2, updated_at = now()
          WHERE id = $1
        `,
        [decision.id, status],
      );

      if (status === 'applied') {
        await tx.query(
          `
            INSERT INTO optibalancer.routing_state (
              resource_key,
              next_eligible_at
            )
            VALUES ($1, now() + ($2 * interval '1 millisecond'))
            ON CONFLICT (resource_key) DO UPDATE
            SET next_eligible_at = excluded.next_eligible_at
          `,
          [decision.resource_key, intervalMs],
        );
      }
    });
  }
}
