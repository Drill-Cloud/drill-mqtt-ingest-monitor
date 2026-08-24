import { existsSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
import type { MonitorSnapshot } from '../shared/types.js';
import { AlertService } from './alerts.js';
import { readConfig } from './config.js';
import { MqttMonitor } from './mqtt-monitor.js';
import { TelegramNotifier } from './telegram.js';

const config = readConfig();
const app = express();
const monitor = new MqttMonitor(config);
const telegram = config.telegram ? new TelegramNotifier(config.telegram) : null;
const alerts = new AlertService(telegram, config.telegram?.alertIntervalMs, config.timeZone);
const eventClients = new Set<express.Response>();
const staticDir = path.resolve(process.cwd(), 'dist');
let shuttingDown = false;

function sendEvent(response: express.Response, snapshot: MonitorSnapshot): void {
  response.write(`data: ${JSON.stringify(snapshot)}\n\n`);
}

app.get('/api/health', (_request, response) => {
  response.json({ ok: true, brokerConnected: monitor.getSnapshot().broker.connected });
});

app.get('/api/snapshot', (_request, response) => {
  response.json(monitor.getSnapshot());
});

app.get('/api/events', (request, response) => {
  response.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
  });
  response.flushHeaders();

  eventClients.add(response);
  sendEvent(response, monitor.getSnapshot());
  request.on('close', () => eventClients.delete(response));
});

if (existsSync(staticDir)) {
  app.use(express.static(staticDir));
  app.get(/^\/(?!api(?:\/|$)).*/, (_request, response) => {
    response.sendFile(path.join(staticDir, 'index.html'));
  });
}

monitor.subscribe((snapshot) => {
  alerts.check(snapshot);
  for (const client of eventClients) sendEvent(client, snapshot);
});

monitor.start();
const server = app.listen(config.httpPort, () => {
  console.log(JSON.stringify({ event: 'http.listening', port: config.httpPort }));
});

async function shutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  alerts.stop();
  monitor.stop();
  for (const client of eventClients) client.end();
  await telegram?.disconnect();
  server.close(() => process.exit(0));
}

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
