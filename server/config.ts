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
  expectedItems: string[];
  countLabel: string;
};

const DEFAULT_EDGE5_MODBUS_IMPORTANT_TAGS = [
  'edge5-v3-wk',
  'edge5-v3-hk',
  'edge5-v3-vw',
  'edge5-v3-pdk',
  'edge5-v3-h2s',
  'edge5-v3-nrot',
  'edge5-v3-vsp',
];

const DEFAULT_EDGE5_VIDEO_IMPORTANT_CAMERAS = ['v1', 'v2', 'v3'];

function readRequiredString(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

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
    return [...new Set(fallback)];
  }

  const items = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return [...new Set(items)];
}

export function readConfig(): AppConfig {
  return {
    httpPort: readNumber('HTTP_PORT', 3205),
    mqttUrl: readRequiredString('MQTT_URL'),
    mqttUsername: process.env.MQTT_USERNAME,
    mqttPassword: process.env.MQTT_PASSWORD,
    importantTopics: readList('IMPORTANT_TOPICS', ['data/edge5/video/v2/+', 'data/edge5/modbus/v3']),
    importantTopicExpectations: {
      'data/edge5/modbus/v3': {
        expectedItems: readList('EDGE5_MODBUS_IMPORTANT_TAGS', DEFAULT_EDGE5_MODBUS_IMPORTANT_TAGS),
        countLabel: 'тегов',
      },
      'data/edge5/video/v2/+': {
        expectedItems: readList('EDGE5_VIDEO_IMPORTANT_CAMERAS', DEFAULT_EDGE5_VIDEO_IMPORTANT_CAMERAS),
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
