import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import amqp from 'amqplib';
import type { ChannelModel, ConfirmChannel, ConsumeMessage } from 'amqplib';
import { parseWorkloadChanged, eventType } from '@stornx/event-contracts';
import type { WorkloadChanged } from '@stornx/event-contracts';
import type { Settings } from './settings.js';
import { logger } from './config/logger.js';

/**
 * Deliver workload notifications with publisher confirms, durable acceptance and bounded
 * retries.
 */
export class Broker {
  private connection?: ChannelModel;
  private channel?: ConfirmChannel;
  private consumer?: string;
  private connecting?: Promise<void>;
  private readonly returns = new Set<string>();
  private readonly inFlight = new Set<string>();
  private readonly deliveries = new Set<Promise<void>>();
  readonly counters = {
    events_published_total: 0,
    events_received_total: 0,
    events_rejected_total: 0,
    events_retried_total: 0,
  };
  readonly exchange = 'stornx.workloads';
  readonly queue: string;
  readonly route: string;

  constructor(private readonly config: Settings) {
    this.queue = `stornx.${config.clusterId}.optibalancer`;
    this.route = `${config.clusterId}.${eventType}`;
  }

  get ready(): boolean {
    return this.channel !== undefined;
  }

  /** Reuse a healthy channel and share a single reconnect attempt across callers. */
  async ensure(): Promise<void> {
    if (this.channel) {
      return;
    }

    if (this.connecting) {
      return this.connecting;
    }

    this.connecting = this.connect().finally(() => {
      this.connecting = undefined;
    });

    return this.connecting;
  }

  /**
   * Open a confirmed channel. Operator tooling, rather than application credentials, owns
   * topology.
   */
  private async connect(): Promise<void> {
    const conn = await amqp.connect(this.config.rabbitmqUrl, {
      timeout: 5000,
      heartbeat: 15,
      ...(this.config.brokerCa
        ? { ca: [readFileSync(this.config.brokerCa)], rejectUnauthorized: true }
        : {}),
    });

    conn.on('error', () => {});
    conn.on('close', () => {
      if (this.connection === conn) {
        this.channel = undefined;
        this.consumer = undefined;
        this.connection = undefined;
      }
    });

    try {
      const ch = await conn.createConfirmChannel();

      ch.on('error', () => {});
      ch.on('close', () => {
        if (this.channel === ch) {
          this.channel = undefined;
          this.consumer = undefined;
        }

        void conn.close().catch(() => {});
      });
      ch.on('return', (msg) => {
        if (this.inFlight.has(msg.properties.messageId)) {
          this.returns.add(msg.properties.messageId);
        }
      });
      // No topology declarations: application identities need no configure permission.
      await ch.prefetch(8);
      this.connection = conn;
      this.channel = ch;
    } catch (error) {
      await conn.close().catch(() => {});

      throw error;
    }
  }

  /** Wait for broker confirmation and reject unroutable messages or ambiguous timeouts. */
  async send(
    body: Buffer,
    route = this.route,
    headers: Record<string, unknown> = {},
  ): Promise<void> {
    await this.ensure();

    const ch = this.channel!;
    const id = randomUUID();
    let timer: ReturnType<typeof setTimeout> | undefined;

    this.inFlight.add(id);

    try {
      await new Promise<void>((resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error('Publisher confirmation timeout'));
          void ch.close().catch(() => {});
        }, 10000);

        ch.publish(
          this.exchange,
          route,
          body,
          {
            persistent: true,
            mandatory: true,
            contentType: 'application/json',
            messageId: id,
            headers,
          },
          (error) => {
            if (error) {
              reject(error);
            } else if (this.returns.has(id)) {
              reject(new Error('Broker returned unroutable message'));
            } else {
              resolve();
            }
          },
        );
      });
      this.counters.events_published_total++;
    } finally {
      if (timer) {
        clearTimeout(timer);
      }

      this.returns.delete(id);
      this.inFlight.delete(id);
    }
  }

  /** Validate the event contract before publishing a persistent workload notification. */
  async publish(event: WorkloadChanged): Promise<void> {
    await this.send(Buffer.from(JSON.stringify(parseWorkloadChanged(event))));
  }

  /**
   * Start one consumer for the active leader; cancel consumption while this process is a
   * standby.
   */
  async consume(
    accept: (event: WorkloadChanged) => Promise<void>,
    active: () => boolean,
  ): Promise<void> {
    await this.ensure();

    if (!active()) {
      await this.cancel();

      return;
    }

    if (this.consumer) {
      return;
    }

    const ch = this.channel!;
    const result = await ch.consume(
      this.queue,
      (msg) => {
        if (!msg) {
          this.consumer = undefined;

          return;
        }

        const delivery = this.receive(ch, msg, accept, active)
          .catch((error) => logger.error('Delivery failed', { error: String(error) }))
          .then(() => undefined)
          .finally(() => {
            this.deliveries.delete(delivery);
          });

        this.deliveries.add(delivery);
      },
      { noAck: false },
    );

    this.consumer = result.consumerTag;
  }

  /** Acknowledge only after durable acceptance or confirmed retry publication succeeds. */
  private async receive(
    ch: ConfirmChannel,
    msg: ConsumeMessage,
    accept: (event: WorkloadChanged) => Promise<void>,
    active: () => boolean,
  ): Promise<void> {
    if (!active()) {
      ch.nack(msg, false, true);

      return;
    }

    this.counters.events_received_total++;

    let event: WorkloadChanged;

    try {
      if (msg.content.length > 65536) {
        throw new Error('Oversized event');
      }

      event = parseWorkloadChanged(JSON.parse(msg.content.toString('utf8')));

      if (
        event.clusterId !== this.config.clusterId ||
        !this.config.namespaces.includes(event.namespace)
      ) {
        throw new Error('Event outside configured scope');
      }
    } catch (error) {
      this.counters.events_rejected_total++;
      logger.warn('Reject invalid workload event', { error: String(error) });
      ch.reject(msg, false);

      return;
    }

    try {
      await accept(event);
      ch.ack(msg);
    } catch (error) {
      const previous = Number(msg.properties.headers?.['stornx-attempt'] ?? 0);

      if (!Number.isSafeInteger(previous) || previous < 0) {
        this.counters.events_rejected_total++;
        ch.reject(msg, false);

        return;
      }

      const attempt = previous + 1;

      logger.error('Could not durably accept event', {
        eventId: event.id,
        attempt,
        error: String(error),
      });

      if (attempt >= this.config.maxAttempts) {
        this.counters.events_rejected_total++;
        ch.reject(msg, false);

        return;
      }

      try {
        await this.send(
          msg.content,
          `${this.route}.retry.${attempt < 3 ? 5 : attempt < 6 ? 30 : 120}`,
          {
            'stornx-attempt': attempt,
          },
        );
        this.counters.events_retried_total++;
        ch.ack(msg);
      } catch {
        await ch.close().catch(() => {});
      } // Unacknowledged deliveries return to the broker.
    }
  }

  /** Stop new deliveries while allowing already accepted work to finish. */
  async cancel(): Promise<void> {
    const tag = this.consumer;

    this.consumer = undefined;

    if (tag && this.channel) {
      await this.channel.cancel(tag).catch(() => {});
    }
  }

  /**
   * Drain in-flight handlers before closing the connection and returning any unacknowledged
   * work.
   */
  async close(): Promise<void> {
    await this.cancel();
    await Promise.allSettled([...this.deliveries]);
    await this.connection?.close().catch(() => {});
    this.channel = undefined;
  }
}
