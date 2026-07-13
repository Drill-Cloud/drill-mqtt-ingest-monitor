import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import { readConfig } from './config.js';
import { MqttMonitor } from './mqtt-monitor.js';
import type { MonitorSnapshot } from './types.js';

const config = readConfig();
const app = express();
const monitor = new MqttMonitor(config);
const clients = new Set<express.Response>();
const appDir = path.dirname(fileURLToPath(import.meta.url));
const staticDir = path.resolve(appDir, '../dist');

function sendEvent(response: express.Response, snapshot: MonitorSnapshot): void {
  response.write(`data: ${JSON.stringify(snapshot)}\n\n`);
}

app.use(cors());
app.use(express.json());

app.get('/api/health', (_request, response) => {
  response.json({ ok: true });
});

app.get('/api/snapshot', (_request, response) => {
  response.json(monitor.getSnapshot());
});

app.get('/api/messages', (request, response) => {
  const topic = String(request.query.topic ?? '');

  if (!topic) {
    response.status(400).json({ message: 'topic is required' });
    return;
  }

  response.json({ topic, messages: monitor.getMessages(topic) });
});

app.post('/api/important-topics', (request, response) => {
  const pattern = String(request.body?.pattern ?? '');

  if (!pattern.trim()) {
    response.status(400).json({ message: 'pattern is required' });
    return;
  }

  monitor.addImportantTopic(pattern);
  response.status(201).json(monitor.getSnapshot());
});

app.get('/api/events', (request, response) => {
  response.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });

  clients.add(response);
  sendEvent(response, monitor.getSnapshot());

  request.on('close', () => {
    clients.delete(response);
  });
});

if (existsSync(staticDir)) {
  app.use(express.static(staticDir));
  app.get(/^\/(?!api(?:\/|$)).*/, (_request, response) => {
    response.sendFile(path.join(staticDir, 'index.html'));
  });
}

monitor.on('update', (snapshot: MonitorSnapshot) => {
  for (const client of clients) {
    sendEvent(client, snapshot);
  }
});

monitor.start();

app.listen(config.httpPort, () => {
  console.log(`mqtt-monitor.api http://localhost:${config.httpPort}`);
  console.log(`mqtt-monitor.mqtt ${config.mqttUrl}`);
});

function shutdown(): void {
  monitor.stop();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
