import { ArrowRight, Cloud, RadioTower, Server } from 'lucide-react';
import type { ReactNode } from 'react';
import type { MonitorSnapshot } from '../../shared/types';
import { formatBrokerAddress } from '../format';
import { stateLabel } from '../presentation';
import { InfoHint } from './InfoHint';

export function DataFlow({ snapshot }: { snapshot: MonitorSnapshot }) {
  const flowing = snapshot.broker.connected && snapshot.bus.state === 'active';

  return (
    <section className={`data-flow ${flowing ? 'data-flow--active' : ''}`}>
      <header className="section-heading section-heading--compact">
        <div>
          <span className="section-index">01</span>
          <span className="section-kicker">Маршрут данных</span>
        </div>
        <InfoHint text="Edge-устройства публикуют данные в MQTT-топики. Облачные сервисы получают собственную копию сообщений по своим подпискам." />
      </header>

      <div className="data-flow__rail" aria-label="Схема передачи данных">
        <FlowNode icon={<RadioTower />} title="Edge" detail="Публикация" />
        <FlowLink active={flowing} />
        <div className={`flow-broker ${snapshot.broker.connected ? 'flow-broker--online' : ''}`}>
          <span className="flow-broker__halo" />
          <Server />
          <div><small>MQTT broker</small><strong title={snapshot.broker.address}>{formatBrokerAddress(snapshot.broker.address)}</strong></div>
          <span className="flow-broker__state">{snapshot.broker.connected ? stateLabel[snapshot.bus.state] : 'Нет соединения'}</span>
        </div>
        <FlowLink active={flowing} />
        <FlowNode icon={<Cloud />} title="Cloud" detail="Подписка" />
      </div>
    </section>
  );
}

function FlowNode({ icon, title, detail }: { icon: ReactNode; title: string; detail: string }) {
  return <div className="flow-node"><span>{icon}</span><div><strong>{title}</strong><small>{detail}</small></div></div>;
}

function FlowLink({ active }: { active: boolean }) {
  return <div className={`flow-link ${active ? 'flow-link--active' : ''}`}><span /><ArrowRight /></div>;
}
