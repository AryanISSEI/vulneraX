import { Globe, Server, MapPin, Network, Shield, Cpu } from 'lucide-react';
import { riskScoreColor } from '../utils/helpers';

export default function QuickInfo({ scanResult }) {
  if (!scanResult) return null;

  const { dns, fingerprint, ports, risk_score } = scanResult;
  const scoreInfo = riskScoreColor(risk_score?.overall ?? 100);

  const cards = [
    {
      icon: Globe,
      label: 'IP Address',
      value: dns?.ip_address || '—',
      color: 'text-primary',
      bg: 'bg-primary/10',
    },
    {
      icon: MapPin,
      label: 'Country',
      value: dns?.country || '—',
      color: 'text-muted-foreground',
      bg: 'bg-foreground/5',
    },
    {
      icon: Server,
      label: 'Server',
      value: fingerprint?.server || '—',
      color: 'text-muted-foreground',
      bg: 'bg-foreground/5',
    },
    {
      icon: Cpu,
      label: 'Technologies',
      value: fingerprint?.technologies?.length
        ? fingerprint.technologies.slice(0, 3).join(', ')
        : '—',
      color: 'text-muted-foreground',
      bg: 'bg-foreground/5',
    },
    {
      icon: Network,
      label: 'Open Ports',
      value: ports?.length?.toString() || '0',
      color: 'text-orange-500',
      bg: 'bg-orange-500/10',
    },
    {
      icon: Shield,
      label: 'Risk Score',
      value: `${risk_score?.overall ?? 100}/100`,
      color: '',
      bg: '',
      customColor: scoreInfo.color,
      sublabel: scoreInfo.label,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6 stagger-children">
      {cards.map((card) => (
        <div
          key={card.label}
          className="glass-panel p-6 flex flex-col items-center text-center gap-3 hover:-translate-y-1 hover:shadow-[0_8px_30px_rgba(220,38,38,0.15)] transition-all duration-300"
        >
          <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${card.bg || 'bg-bg-card'}`}>
            <card.icon
              className="h-6 w-6"
              style={card.customColor ? { color: card.customColor } : undefined}
              {...(!card.customColor ? { className: `h-6 w-6 ${card.color}` } : {})}
            />
          </div>
          <div>
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">
              {card.label}
            </p>
            <p
              className="text-sm font-semibold text-foreground truncate max-w-[140px]"
              title={card.value}
              style={card.customColor ? { color: card.customColor } : undefined}
            >
              {card.value}
            </p>
            {card.sublabel && (
              <p className="text-[10px] font-medium mt-0.5" style={{ color: card.customColor }}>
                {card.sublabel}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
