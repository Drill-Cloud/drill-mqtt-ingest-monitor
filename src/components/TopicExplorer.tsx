import { ArrowLeft, Eye, Maximize2, MessageSquareText, Plus, Search, X } from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { addImportantTopic, getTopicMessages } from '../api';
import { formatAge, formatBytes } from '../format';
import type { MonitorSnapshot, TopicMessage, TopicStatus } from '../types';
import { StateBadge, stateOrder } from './StateBadge';

type TopicExplorerProps = {
  snapshot: MonitorSnapshot;
  onSnapshot: (snapshot: MonitorSnapshot) => void;
};

function getPayloadText(message: TopicMessage): string {
  return message.payload ?? message.payloadPreview ?? '';
}

function formatPayload(message: TopicMessage): { kind: 'JSON' | 'Текст'; value: string } {
  const payload = getPayloadText(message);

  try {
    return {
      kind: 'JSON',
      value: JSON.stringify(JSON.parse(payload), null, 2),
    };
  } catch {
    return {
      kind: 'Текст',
      value: payload || '—',
    };
  }
}

function AddImportantTopicForm({ onAdded }: { onAdded: (snapshot: MonitorSnapshot) => void }) {
  const [pattern, setPattern] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!pattern.trim()) {
      return;
    }

    setSaving(true);

    try {
      onAdded(await addImportantTopic(pattern));
      setPattern('');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="add-topic-form" onSubmit={handleSubmit}>
      <input value={pattern} onChange={(event) => setPattern(event.target.value)} placeholder="data/edge5/custom/+" />
      <button disabled={saving} type="submit">
        <Plus size={16} />
        Добавить важный
      </button>
    </form>
  );
}

function TopicsTable({
  now,
  onSelect,
  topics,
}: {
  now: string;
  onSelect: (topic: string) => void;
  topics: TopicStatus[];
}) {
  if (topics.length === 0) {
    return <div className="empty-panel">Пока нет MQTT-сообщений. Монитор увидит топики после первого сообщения.</div>;
  }

  return (
    <div className="topic-table">
      <div className="topic-table__head">
        <span>Топик</span>
        <span>Статус</span>
        <span>Последнее</span>
        <span>Скорость</span>
        <span>Всего</span>
      </div>
      {topics.map((topic) => (
        <button className="topic-table__row" key={topic.topic} onClick={() => onSelect(topic.topic)} type="button">
          <div>
            <strong>{topic.topic}</strong>
            {topic.matchedPattern && <small>{topic.matchedPattern}</small>}
          </div>
          <StateBadge state={topic.state} />
          <span>{formatAge(topic.lastSeenAt, now)}</span>
          <span>{topic.ratePerMinute}/мин</span>
          <span>{topic.messageCount}</span>
        </button>
      ))}
    </div>
  );
}

function MessageTable({
  messages,
  onSelect,
  selectedMessageId,
}: {
  messages: TopicMessage[];
  onSelect: (message: TopicMessage) => void;
  selectedMessageId: string | null;
}) {
  if (messages.length === 0) {
    return <div className="empty-panel">Сообщений по выбранному топику пока нет.</div>;
  }

  return (
    <div className="message-table">
      <div className="message-table__head">
        <span>№</span>
        <span>Время</span>
        <span>Размер</span>
        <span>Превью</span>
      </div>
      {messages.map((message, index) => (
        <button
          className={`message-table__row ${selectedMessageId === message.id ? 'message-table__row--active' : ''}`}
          key={message.id}
          onClick={() => onSelect(message)}
          type="button"
        >
          <span>{index + 1}</span>
          <span>{new Date(message.receivedAt).toLocaleString('ru-RU')}</span>
          <span>{formatBytes(message.bytes)}</span>
          <code>{message.payloadPreview || '—'}</code>
        </button>
      ))}
    </div>
  );
}

function MessageDetails({
  message,
  onOpenPayload,
}: {
  message: TopicMessage | null;
  onOpenPayload: (message: TopicMessage) => void;
}) {
  if (!message) {
    return (
      <aside className="message-detail">
        <div className="empty-panel empty-panel--small">Выберите сообщение, чтобы открыть payload и метаданные.</div>
      </aside>
    );
  }

  return (
    <aside className="message-detail">
      <div className="message-detail__header">
        <div>
          <span className="kicker">Детали сообщения</span>
          <h3>{new Date(message.receivedAt).toLocaleString('ru-RU')}</h3>
        </div>
        <MessageSquareText size={18} />
      </div>
      <div className="message-detail__meta">
        <div>
          <span>Топик</span>
          <strong>{message.topic}</strong>
        </div>
        <div>
          <span>Размер</span>
          <strong>{formatBytes(message.bytes)}</strong>
        </div>
        <div>
          <span>Получено</span>
          <strong>{message.receivedAt}</strong>
        </div>
      </div>
      <div className="message-detail__payload">
        <div className="message-detail__payload-header">
          <span>Превью payload</span>
          <button onClick={() => onOpenPayload(message)} type="button">
            <Maximize2 size={15} />
            Открыть
          </button>
        </div>
        <pre>{message.payloadPreview || '—'}</pre>
      </div>
    </aside>
  );
}

function PayloadModal({ message, onClose }: { message: TopicMessage | null; onClose: () => void }) {
  const formatted = message ? formatPayload(message) : null;

  useEffect(() => {
    if (!message) {
      return undefined;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [message, onClose]);

  if (!message || !formatted) {
    return null;
  }

  return (
    <div className="payload-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="payload-modal" role="dialog" aria-modal="true" aria-label="Payload сообщения" onMouseDown={(event) => event.stopPropagation()}>
        <header className="payload-modal__header">
          <div>
            <span className="kicker">Payload сообщения</span>
            <h2>{message.topic}</h2>
          </div>
          <button aria-label="Закрыть" onClick={onClose} type="button">
            <X size={20} />
          </button>
        </header>
        <div className="payload-modal__meta">
          <span>{new Date(message.receivedAt).toLocaleString('ru-RU')}</span>
          <span>{formatBytes(message.bytes)}</span>
          <span>Формат: {formatted.kind}</span>
          {message.payloadTruncated && <span>Payload обрезан для просмотра</span>}
        </div>
        <pre className="payload-modal__body">{formatted.value}</pre>
      </section>
    </div>
  );
}

function TopicSummary({ now, topic }: { now: string; topic: TopicStatus }) {
  return (
    <section className="topic-summary">
      <div>
        <span>Размер</span>
        <strong>{formatBytes(topic.bytesTotal)}</strong>
      </div>
      <div>
        <span>Сообщений</span>
        <strong>{topic.messageCount}</strong>
      </div>
      <div>
        <span>Скорость</span>
        <strong>{topic.ratePerMinute}/мин</strong>
      </div>
      <div>
        <span>Последнее сообщение</span>
        <strong>{formatAge(topic.lastSeenAt, now)}</strong>
      </div>
      <div>
        <span>Шаблон</span>
        <strong>{topic.matchedPattern ?? '—'}</strong>
      </div>
      <div>
        <span>Статус</span>
        <StateBadge state={topic.state} />
      </div>
    </section>
  );
}

export function TopicExplorer({ onSnapshot, snapshot }: TopicExplorerProps) {
  const [query, setQuery] = useState('');
  const [importantOnly, setImportantOnly] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [messages, setMessages] = useState<TopicMessage[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<TopicMessage | null>(null);
  const [openedPayload, setOpenedPayload] = useState<TopicMessage | null>(null);

  const filteredTopics = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return snapshot.topics
      .filter((topic) => (importantOnly ? topic.important : true))
      .filter((topic) => topic.topic.toLowerCase().includes(normalizedQuery))
      .sort((left, right) => stateOrder[left.state] - stateOrder[right.state] || left.topic.localeCompare(right.topic));
  }, [importantOnly, query, snapshot.topics]);

  const selectedTopicStatus = useMemo(
    () => snapshot.topics.find((topic) => topic.topic === selectedTopic) ?? null,
    [selectedTopic, snapshot.topics],
  );

  useEffect(() => {
    if (!selectedTopic) {
      setMessages([]);
      setSelectedMessage(null);
      return undefined;
    }

    const controller = new AbortController();
    const loadMessages = () => {
      void getTopicMessages(selectedTopic, controller.signal)
        .then((nextMessages) => {
          setMessages(nextMessages);
          setSelectedMessage((current) => {
            if (!current) {
              return nextMessages[0] ?? null;
            }

            return nextMessages.find((message) => message.id === current.id) ?? current;
          });
        })
        .catch(() => setMessages([]));
    };

    loadMessages();
    const interval = window.setInterval(loadMessages, 1_000);

    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [selectedTopic]);

  if (selectedTopic && selectedTopicStatus) {
    return (
      <section className="topic-page">
        <div className="topic-page__toolbar">
          <button className="back-button" onClick={() => setSelectedTopic(null)} type="button">
            <ArrowLeft size={16} />
            К списку топиков
          </button>
          <div>
            <span className="kicker">Топик</span>
            <h2>{selectedTopicStatus.topic}</h2>
          </div>
        </div>

        <TopicSummary now={snapshot.now} topic={selectedTopicStatus} />

        <section className="message-browser">
          <div className="panel">
            <div className="panel__header">
              <div>
                <span className="kicker">Сообщения</span>
                <h2>Последние сообщения</h2>
              </div>
              <span className="panel__hint">{messages.length}/100</span>
            </div>
            <MessageTable messages={messages} onSelect={setSelectedMessage} selectedMessageId={selectedMessage?.id ?? null} />
          </div>
          <MessageDetails message={selectedMessage} onOpenPayload={setOpenedPayload} />
        </section>

        <PayloadModal message={openedPayload} onClose={() => setOpenedPayload(null)} />
      </section>
    );
  }

  return (
    <section className="panel topic-list-page">
      <div className="panel__header panel__header--tools">
        <div>
          <span className="kicker">Топики</span>
          <h2>Все топики</h2>
        </div>
        <div className="toolbar">
          <label className="search-box">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по топику" />
          </label>
          <button className={importantOnly ? 'toggle toggle--active' : 'toggle'} onClick={() => setImportantOnly((value) => !value)}>
            <Eye size={16} />
            Только важные
          </button>
        </div>
      </div>
      <AddImportantTopicForm onAdded={onSnapshot} />
      <TopicsTable now={snapshot.now} onSelect={setSelectedTopic} topics={filteredTopics} />
    </section>
  );
}
