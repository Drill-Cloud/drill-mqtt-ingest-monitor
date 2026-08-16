export type ActivityState = 'active' | 'silent' | 'waiting';

export type TopicActivity = {
  topic: string;
  lastSeenAt: string;
  messagesPerMinute: number;
  bytesPerMinute: number;
};

export type ImportantActivity = {
  channel: string;
  state: ActivityState;
  lastSeenAt: string | null;
  messagesPerMinute: number;
  bytesPerMinute: number;
};

export type MonitorSnapshot = {
  timestamp: string;
  broker: {
    address: string;
    connected: boolean;
    error: string | null;
  };
  bus: {
    state: ActivityState;
    lastMessageAt: string | null;
    activeTopicCount: number;
    messagesPerMinute: number;
    bytesPerMinute: number;
  };
  topics: TopicActivity[];
  important: ImportantActivity[];
  silenceMs: number;
};
