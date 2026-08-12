import assert from 'node:assert/strict';
import test from 'node:test';
import { TopicTracker, expandImportantChannels, matchesTopic } from '../server/topic-tracker.js';

test('matches MQTT topic wildcards', () => {
  assert.equal(matchesTopic('data/+/state', 'data/edge5/state'), true);
  assert.equal(matchesTopic('data/#', 'data/edge5/video/frame'), true);
  assert.equal(matchesTopic('data/+/state', 'data/edge5/video/state'), false);
  assert.equal(matchesTopic('data/#/state', 'data/edge5/state'), false);
});

test('expands every important video camera into its own channel', () => {
  assert.deepEqual(
    expandImportantChannels(['data/edge5/video/v2/+', 'data/edge5/modbus/v3'], ['camera-11', 'camera-12']),
    ['data/edge5/video/v2/camera-11', 'data/edge5/video/v2/camera-12', 'data/edge5/modbus/v3'],
  );
});

test('reports only currently active topics and keeps silent important channels', () => {
  const startedAt = 1_000_000;
  const tracker = new TopicTracker(
    ['data/edge5/video/v2/+', 'data/edge5/modbus/v3'],
    ['camera-11'],
    10_000,
    startedAt,
  );

  tracker.record('data/edge5/video/v2/camera-11', 1_024, startedAt + 1_000);
  tracker.record('data/edge5/other', 100, startedAt + 1_000);

  const active = tracker.snapshot(startedAt + 2_000);
  assert.equal(active.bus.state, 'active');
  assert.equal(active.topics.length, 2);
  assert.equal(active.important[0]?.state, 'active');
  assert.equal(active.important[1]?.state, 'waiting');

  const silent = tracker.snapshot(startedAt + 12_000);
  assert.equal(silent.bus.state, 'silent');
  assert.equal(silent.topics.length, 0);
  assert.deepEqual(silent.important.map((item) => item.state), ['silent', 'silent']);
});
