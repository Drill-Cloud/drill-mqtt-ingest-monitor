import {
  BellRing,
  Bot,
  CheckCircle2,
  CircleAlert,
  Clock3,
  KeyRound,
  MessageCircleMore,
  Radio,
  Send,
  ShieldCheck,
  WifiOff,
} from 'lucide-react';
import type { AlertEvent, MonitorSnapshot } from '../types';

function ConfigRow({
  label,
  ok,
  optional = false,
  value,
}: {
  label: string;
  ok: boolean;
  optional?: boolean;
  value: string;
}) {
  return (
    <div className={`telegram-config-row ${ok ? 'telegram-config-row--ok' : optional ? 'telegram-config-row--optional' : ''}`}>
      {ok ? <CheckCircle2 size={17} /> : optional ? <Clock3 size={17} /> : <CircleAlert size={17} />}
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function DeliveryBadge({ alert }: { alert: AlertEvent }) {
  const labels: Record<AlertEvent['deliveryStatus'], string> = {
    pending: 'отправляется',
    sent: 'доставлено',
    failed: 'ошибка доставки',
    disabled: 'Telegram выключен',
  };

  return (
    <span className={`telegram-delivery telegram-delivery--${alert.deliveryStatus}`}>
      {labels[alert.deliveryStatus]}
    </span>
  );
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return 'с момента запуска';
  if (seconds < 60) return `${seconds} сек.`;

  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest > 0 ? `${minutes} мин. ${rest} сек.` : `${minutes} мин.`;
}

function AlertCard({ alert }: { alert: AlertEvent }) {
  const recovered = alert.event === 'recovered';

  return (
    <article className={`telegram-alert ${recovered ? 'telegram-alert--recovered' : 'telegram-alert--dead'}`}>
      <div className="telegram-alert__icon">
        {recovered ? <CheckCircle2 size={19} /> : <WifiOff size={19} />}
      </div>
      <div className="telegram-alert__body">
        <div className="telegram-alert__heading">
          <div>
            <span>{recovered ? 'Поток восстановлен' : 'Поток остановлен'}</span>
            <strong>{alert.topic}</strong>
          </div>
          <DeliveryBadge alert={alert} />
        </div>
        <div className="telegram-alert__meta">
          <span>{new Date(alert.createdAt).toLocaleString('ru-RU')}</span>
          <span>
            {recovered
              ? `Простой: ${formatDuration(alert.outageDurationSeconds)}`
              : `Без данных: ${formatDuration(alert.silenceSeconds)}`}
          </span>
        </div>
        {alert.deliveryError && <p className="telegram-alert__error">{alert.deliveryError}</p>}
      </div>
    </article>
  );
}

export function TelegramAlertsView({ snapshot }: { snapshot: MonitorSnapshot }) {
  const sent = snapshot.alerts.filter((alert) => alert.deliveryStatus === 'sent').length;
  const failed = snapshot.alerts.filter((alert) => alert.deliveryStatus === 'failed').length;
  const activeProblems = snapshot.important.filter(
    (topic) => topic.isExpectation && ['degraded', 'stale', 'dead', 'silent'].includes(topic.state),
  ).length;

  return (
    <section className="telegram-view">
      <div className="panel telegram-hero">
        <div className="telegram-hero__content">
          <div className="telegram-hero__eyebrow">
            <span className="telegram-logo"><Send size={19} /></span>
            Telegram health channel
          </div>
          <h2>Уведомления о состоянии потоков</h2>
          <p>
            Монитор сообщает в Telegram об остановке каждого ожидаемого MQTT-потока и отдельно подтверждает его восстановление.
          </p>
          <div className="telegram-hero__recipient">
            <MessageCircleMore size={16} />
            <span>Получатель</span>
            <strong>{snapshot.telegram.recipient}</strong>
          </div>
        </div>
        <div className={`telegram-orbit ${snapshot.telegram.ready ? 'telegram-orbit--ready' : ''}`}>
          <span className="telegram-orbit__ring" />
          <span className="telegram-orbit__ring telegram-orbit__ring--second" />
          <div><Send size={25} /></div>
          <strong>{snapshot.telegram.ready ? 'ГОТОВО' : 'НЕ НАСТРОЕНО'}</strong>
        </div>
      </div>

      <div className="telegram-summary-grid">
        <article className="panel telegram-summary-card">
          <span><Radio size={17} /> Активные проблемы</span>
          <strong>{activeProblems}</strong>
          <small>по ожидаемым потокам</small>
        </article>
        <article className="panel telegram-summary-card telegram-summary-card--blue">
          <span><BellRing size={17} /> События</span>
          <strong>{snapshot.alerts.length}</strong>
          <small>остановки и восстановления</small>
        </article>
        <article className="panel telegram-summary-card telegram-summary-card--green">
          <span><Send size={17} /> Доставлено</span>
          <strong>{sent}</strong>
          <small>сообщений в Telegram</small>
        </article>
        <article className={`panel telegram-summary-card ${failed > 0 ? 'telegram-summary-card--red' : ''}`}>
          <span><CircleAlert size={17} /> Ошибки</span>
          <strong>{failed}</strong>
          <small>после трёх попыток</small>
        </article>
      </div>

      <div className="telegram-layout">
        <section className="panel telegram-config-card">
          <div className="panel__header">
            <div>
              <span className="kicker">Готовность доставки</span>
              <h2>Конфигурация Telegram</h2>
            </div>
            <KeyRound size={18} />
          </div>
          <div className="telegram-config-list">
            <ConfigRow
              label="TELEGRAM_ENABLED"
              ok={snapshot.telegram.enabled}
              value={snapshot.telegram.enabled ? 'уведомления включены' : 'уведомления выключены'}
            />
            <ConfigRow
              label="TELEGRAM_BOT_TOKEN"
              ok={snapshot.telegram.botTokenConfigured}
              value={snapshot.telegram.botTokenConfigured ? 'токен задан и скрыт' : 'добавьте токен в secret'}
            />
            <ConfigRow
              label="TELEGRAM_CHAT_ID"
              ok={snapshot.telegram.chatConfigured}
              value={snapshot.telegram.chatConfigured ? 'получатель задан' : 'получатель не задан'}
            />
            <ConfigRow
              label="TELEGRAM_MESSAGE_THREAD_ID"
              ok={snapshot.telegram.messageThreadConfigured}
              optional
              value={snapshot.telegram.messageThreadConfigured ? 'тема группы задана' : 'не используется'}
            />
          </div>
          <div className={`telegram-readiness ${snapshot.telegram.ready ? 'telegram-readiness--ready' : ''}`}>
            {snapshot.telegram.ready ? <ShieldCheck size={18} /> : <CircleAlert size={18} />}
            <div>
              <strong>{snapshot.telegram.ready ? 'Канал доставки готов' : 'Нужна настройка окружения'}</strong>
              <span>
                {snapshot.telegram.ready
                  ? 'Новые инциденты будут отправлены автоматически.'
                  : 'Укажите token и chat ID, затем включите Telegram и пересоздайте контейнер.'}
              </span>
            </div>
          </div>
        </section>

        <section className="panel telegram-flow-card">
          <div className="panel__header">
            <div>
              <span className="kicker">Как работает</span>
              <h2>Цепочка уведомления</h2>
            </div>
            <Bot size={19} />
          </div>
          <div className="telegram-flow">
            <div className={snapshot.connected ? 'telegram-flow__step telegram-flow__step--active' : 'telegram-flow__step'}>
              <span>01</span><div><strong>MQTT-поток</strong><small>{snapshot.connected ? 'Брокер подключён' : 'Нет связи с брокером'}</small></div>
            </div>
            <i />
            <div className="telegram-flow__step telegram-flow__step--active">
              <span>02</span><div><strong>Контроль тишины</strong><small>Порог {Math.round(snapshot.deadMs / 1_000)} секунд</small></div>
            </div>
            <i />
            <div className={snapshot.telegram.ready ? 'telegram-flow__step telegram-flow__step--active' : 'telegram-flow__step'}>
              <span>03</span><div><strong>Telegram</strong><small>Алерт + сообщение о восстановлении</small></div>
            </div>
          </div>
          <p className="telegram-flow-card__note">
            Повторные уведомления во время одного простоя блокируются. Сбой отправки не останавливает чтение MQTT.
          </p>
        </section>
      </div>

      <section className="panel telegram-events">
        <div className="panel__header">
          <div>
            <span className="kicker">Журнал доставки</span>
            <h2>Последние события</h2>
          </div>
          <BellRing size={19} />
        </div>
        {snapshot.alerts.length === 0 ? (
          <div className="telegram-empty">
            <span><ShieldCheck size={28} /></span>
            <strong>Инцидентов пока нет</strong>
            <p>Здесь появятся остановки потоков, восстановления и результат доставки сообщения в Telegram.</p>
          </div>
        ) : (
          <div className="telegram-alert-list">
            {snapshot.alerts.map((alert) => <AlertCard alert={alert} key={alert.id} />)}
          </div>
        )}
      </section>
    </section>
  );
}
