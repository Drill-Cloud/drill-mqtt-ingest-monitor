export type TopicState = 'alive' | 'degraded' | 'stale' | 'dead' | 'silent';

export type TopicStatus = {
  topic: string;
  important: boolean;
  matchedPattern: string | null;
  state: TopicState;
  messageCount: number;
  bytesTotal: number;
  bytesPerMinute: number;
  ratePerMinute: number;
  lastSeenAt: string | null;
  lastPayloadPreview: string;
  isExpectation: boolean;
  expectedCount: number | null;
  activeCount: number | null;
  countLabel: string | null;
};

export type TopicMessage = {
  id: string;
  topic: string;
  receivedAt: string;
  bytes: number;
  payloadPreview: string;
  payload?: string;
  payloadTruncated?: boolean;
};

export type AlertEvent = {
  id: string;
  topic: string;
  state: TopicState;
  event: 'dead' | 'recovered';
  message: string;
  createdAt: string;
  silenceSeconds: number | null;
  outageDurationSeconds: number | null;
  deliveryStatus: 'pending' | 'sent' | 'failed' | 'disabled';
  deliveryError: string | null;
};

export type TelegramStatus = {
  enabled: boolean;
  ready: boolean;
  recipient: string;
  chatConfigured: boolean;
  botTokenConfigured: boolean;
  messageThreadConfigured: boolean;
};

export type BrokerMetrics = {
  available: boolean;
  updatedAt: string | null;
  version: string | null;
  uptimeSeconds: number | null;
  clients: {
    connected: number | null;
    disconnected: number | null;
    total: number | null;
    maximum: number | null;
    expired: number | null;
  };
  messages: {
    received: number | null;
    sent: number | null;
    stored: number | null;
    publishReceived: number | null;
    publishSent: number | null;
    publishDropped: number | null;
  };
  bytes: {
    received: number | null;
    sent: number | null;
    stored: number | null;
  };
  subscriptions: number | null;
  retainedMessages: number | null;
  heap: {
    current: number | null;
    maximum: number | null;
  };
  load: {
    messagesReceivedPerSecond: number | null;
    messagesSentPerSecond: number | null;
    bytesReceivedPerSecond: number | null;
    bytesSentPerSecond: number | null;
    publishDroppedPerSecond: number | null;
    connectionsPerSecond: number | null;
    socketsPerSecond: number | null;
  };
};

export type MonitorSnapshot = {
  mqttUrl: string;
  connected: boolean;
  startedAt: string;
  now: string;
  telegram: TelegramStatus;
  brokerMetrics: BrokerMetrics;
  importantPatterns: string[];
  staleMs: number;
  deadMs: number;
  important: TopicStatus[];
  topics: TopicStatus[];
  alerts: AlertEvent[];
};
