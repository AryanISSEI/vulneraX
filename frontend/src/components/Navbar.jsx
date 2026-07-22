import { Shield, History, ExternalLink } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

export default function Navbar() {
  const location = useLocation();

  const navLinks = [
    { to: '/', label: 'Scanner', icon: Shield },
    { to: '/history', label: 'History', icon: History },
  ];

  return (
    <nav className="sticky top-0 z-50 border-b border-border-default bg-bg-primary/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand */}
        <Link to="/" className="flex items-center gap-3 group">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-accent-primary/15 transition-all group-hover:bg-accent-primary/25 group-hover:shadow-lg group-hover:shadow-accent-primary/20">
            <Shield className="h-5 w-5 text-accent-primary" />
            <div className="absolute inset-0 rounded-lg animate-pulse-glow opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <span className="text-xl font-bold gradient-text tracking-tight">VulneraX</span>
        </Link>

        {/* Nav Links */}
        <div className="flex items-center gap-1">
          {navLinks.map(({ to, label, icon: Icon }) => {
            const active = location.pathname === to;
            return (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200
                  ${active
                    ? 'bg-accent-primary/15 text-accent-primary shadow-sm shadow-accent-primary/10'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-card'
                  }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-2 flex h-9 w-9 items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-card transition-all"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>
    </nav>
  );
}
