export type TopicState = 'alive' | 'stale' | 'dead' | 'silent';

export type TopicStatus = {
  topic: string;
  important: boolean;
  matchedPattern: string | null;
  state: TopicState;
  messageCount: number;
  bytesTotal: number;
  ratePerMinute: number;
  lastSeenAt: string | null;
  lastPayloadPreview: string;
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
  message: string;
  createdAt: string;
};

export type MatrixStatus = {
  enabled: boolean;
  homeserver: string;
  roomConfigured: boolean;
  accessTokenConfigured: boolean;
};

export type MonitorSnapshot = {
  mqttUrl: string;
  connected: boolean;
  startedAt: string;
  now: string;
  matrix: MatrixStatus;
  importantPatterns: string[];
  staleMs: number;
  deadMs: number;
  important: TopicStatus[];
  topics: TopicStatus[];
  alerts: AlertEvent[];
};
