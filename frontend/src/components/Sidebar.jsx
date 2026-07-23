import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Shield, History, PlusSquare, Globe } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuth } from '../lib/AuthContext';

export default function Sidebar() {
  const location = useLocation();
  const { user } = useAuth();

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Shield, path: '/' },
    { id: 'websites', label: 'Websites', icon: Globe, path: '/websites' },
    { id: 'history', label: 'History', icon: History, path: '/history' },
  ];

  return (
    <div className="w-64 h-full border-r border-border bg-card flex flex-col z-20">
      <div className="h-16 flex items-center px-6 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center">
            <Shield className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-bold text-lg tracking-tight">VulneraX</span>
        </div>
      </div>

      <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
        <div className="mb-4 px-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Menu
          </p>
        </div>
        {menuItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <NavLink
              key={item.id}
              to={item.path}
              className="relative flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors hover:text-foreground text-muted-foreground"
            >
              {isActive && (
                <motion.div
                  layoutId="active-nav-bg"
                  className="absolute inset-0 bg-accent rounded-md"
                  initial={false}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              <item.icon className={`h-4 w-4 relative z-10 ${isActive ? 'text-primary' : ''}`} />
              <span className={`relative z-10 ${isActive ? 'text-foreground font-semibold' : ''}`}>
                {item.label}
              </span>
            </NavLink>
          );
        })}
      </nav>

      <div className="p-4 border-t border-border mt-auto">
        <div className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors">
          <div className="h-8 w-8 rounded-full bg-secondary border border-border flex items-center justify-center shrink-0 overflow-hidden">
            <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=Admin`} alt="User" className="h-full w-full object-cover" />
          </div>
          <div className="flex flex-col flex-1 overflow-hidden">
            <span className="text-sm font-medium truncate">{user?.username || 'Guest'}</span>
            <span className="text-xs text-muted-foreground truncate">User</span>
          </div>
        </div>
      </div>
    </div>
  );
}
