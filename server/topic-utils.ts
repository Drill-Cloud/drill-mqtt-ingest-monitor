import type { TopicState } from './types.js';

const MAX_PAYLOAD_TEXT_CHARS = 20_000;

export function topicMatches(pattern: string, topic: string): boolean {
  const patternParts = pattern.split('/');
  const topicParts = topic.split('/');

  for (let index = 0; index < patternParts.length; index += 1) {
    const patternPart = patternParts[index];
    const topicPart = topicParts[index];

    if (patternPart === '#') {
      return index === patternParts.length - 1;
    }

    if (topicPart === undefined) {
      return false;
    }

    if (patternPart !== '+' && patternPart !== topicPart) {
      return false;
    }
  }

  return patternParts.length === topicParts.length;
}

export function hasWildcard(pattern: string): boolean {
  return pattern.includes('+') || pattern.includes('#');
}

export function getPayloadPreview(payload: Buffer): string {
  const text = payload.toString('utf8').replace(/\s+/g, ' ').trim();

  if (!text) {
    return '<binary>';
  }

  return text.length > 160 ? `${text.slice(0, 160)}...` : text;
}

export function getPayloadText(payload: Buffer): { payload: string; payloadTruncated: boolean } {
  const text = payload.toString('utf8');

  if (!text) {
    return { payload: '<binary>', payloadTruncated: false };
  }

  if (text.length <= MAX_PAYLOAD_TEXT_CHARS) {
    return { payload: text, payloadTruncated: false };
  }

  return {
    payload: text.slice(0, MAX_PAYLOAD_TEXT_CHARS),
    payloadTruncated: true,
  };
}

export function getTopicState(lastSeenAt: number | null, now: number, staleMs: number, deadMs: number): TopicState {
  if (!lastSeenAt) {
    return 'silent';
  }

  const age = now - lastSeenAt;

  if (age > deadMs) {
    return 'dead';
  }

  if (age > staleMs) {
    return 'stale';
  }

  return 'alive';
}
