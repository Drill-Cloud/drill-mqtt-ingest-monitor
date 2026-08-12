import mqtt, { type MqttClient } from 'mqtt';
import type { MonitorSnapshot } from '../shared/types.js';
import type { AppConfig } from './config.js';
import { TopicTracker } from './topic-tracker.js';

type SnapshotListener = (snapshot: MonitorSnapshot) => void;

function publicAddress(mqttUrl: string): string {
  try {
    const url = new URL(mqttUrl);
    return `${url.protocol}//${url.host}`;
  } catch {
    return mqttUrl.replace(/\/\/[^@/]+@/, '//');
  }
}

export class MqttMonitor {
  private readonly tracker: TopicTracker;
  private readonly listeners = new Set<SnapshotListener>();
  private client: MqttClient | null = null;
  private timer: NodeJS.Timeout | null = null;
  private connected = false;
  private error: string | null = null;

  constructor(private readonly config: AppConfig) {
    this.tracker = new TopicTracker(
      config.importantTopics,
      config.importantCameras,
      config.silenceMs,
    );
  }

  start(): void {
    if (this.client) return;

    console.log(JSON.stringify({ event: 'mqtt.connecting', broker: publicAddress(this.config.mqtt.url) }));
    this.client = mqtt.connect(this.config.mqtt.url, {
      username: this.config.mqtt.username,
      password: this.config.mqtt.password,
      clean: true,
      clientId: `mqtt-monitor-${process.pid}-${Math.random().toString(16).slice(2, 10)}`,
      reconnectPeriod: 5_000,
    });

    this.client.on('connect', () => {
      this.connected = true;
      this.error = null;
      this.client?.subscribe('#', { qos: 0 }, (error) => {
        if (error) {
          this.error = error.message;
          console.error(JSON.stringify({ event: 'mqtt.subscribe_failed', error: error.message }));
          return;
        }
        console.log(JSON.stringify({ event: 'mqtt.connected', subscription: '#' }));
      });
    });

    this.client.on('message', (topic, payload) => {
      // Полезная нагрузка намеренно не декодируется и не сохраняется: монитор только измеряет поток.
      this.tracker.record(topic, payload.length);
    });

    this.client.on('close', () => {
      this.connected = false;
    });

    this.client.on('error', (error) => {
      this.connected = false;
      const changed = this.error !== error.message;
      this.error = error.message;
      if (changed) console.error(JSON.stringify({ event: 'mqtt.error', error: error.message }));
    });

    // Интерфейс обновляется раз в секунду независимо от частоты MQTT-сообщений.
    this.timer = setInterval(() => this.publishSnapshot(), 1_000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.client?.end(true);
    this.client = null;
  }

  subscribe(listener: SnapshotListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(now = Date.now()): MonitorSnapshot {
    return {
      timestamp: new Date(now).toISOString(),
      broker: {
        address: publicAddress(this.config.mqtt.url),
        connected: this.connected,
        error: this.error,
      },
      ...this.tracker.snapshot(now),
      silenceMs: this.config.silenceMs,
    };
  }

  private publishSnapshot(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}
