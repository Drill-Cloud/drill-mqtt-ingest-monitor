export type AppConfig = {
  httpPort: number;
  mqttUrl: string;
  mqttUsername?: string;
  mqttPassword?: string;
  importantTopics: string[];
  importantTopicExpectations: Record<string, ImportantTopicExpectation>;
  staleMs: number;
  deadMs: number;
  matrixEnabled: boolean;
  matrixHomeserver: string;
  matrixRoomId: string;
  matrixAccessToken: string;
};

export type ImportantTopicExpectation = {
  expectedCount: number;
  countLabel: string;
};

function readNumber(name: string, fallback: number): number {
  const value = process.env[name];

  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readList(name: string, fallback: string[]): string[] {
  const value = process.env[name];

  if (!value) {
    return fallback;
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function readConfig(): AppConfig {
  return {
    httpPort: readNumber('HTTP_PORT', 3205),
    mqttUrl: process.env.MQTT_URL?.trim(),
    mqttUsername: process.env.MQTT_USERNAME,
    mqttPassword: process.env.MQTT_PASSWORD,
    importantTopics: readList('IMPORTANT_TOPICS', ['data/edge5/video/v2/+', 'data/edge5/modbus/v3']),
    importantTopicExpectations: {
      'data/edge5/modbus/v3': {
        expectedCount: readNumber('EDGE5_MODBUS_EXPECTED_TAGS', 7),
        countLabel: 'тегов',
      },
      'data/edge5/video/v2/+': {
        expectedCount: readNumber('EDGE5_VIDEO_EXPECTED_CAMERAS', 3),
        countLabel: 'камер',
      },
    },
    staleMs: readNumber('TOPIC_STALE_MS', 15_000),
    deadMs: readNumber('TOPIC_DEAD_MS', 45_000),
    matrixEnabled: process.env.MATRIX_ENABLED === 'true',
    matrixHomeserver: process.env.MATRIX_HOMESERVER ?? 'https://matrix.greact.online',
    matrixRoomId: process.env.MATRIX_ROOM_ID ?? '',
    matrixAccessToken: process.env.MATRIX_ACCESS_TOKEN ?? '',
  };
}
