import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Home, Database, Globe, Contact, Users, Shield } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuth } from '../lib/AuthContext';

export default function Sidebar() {
  const location = useLocation();
  const { user } = useAuth();

  const menuItems = [
    { id: 'dashboard', icon: Home, path: '/' },
    { id: 'database', icon: Database, path: '/history' },
    { id: 'websites', icon: Globe, path: '/websites' },
    { id: 'contact', icon: Contact, path: '/contact' },
    { id: 'users', icon: Users, path: '/users' },
  ];

  return (
    <div className="w-20 h-full border-r border-border bg-card flex flex-col items-center py-6 z-20 shrink-0">
      <div className="flex flex-col items-center gap-1 mb-8">
        <div className="h-10 w-10 flex items-center justify-center">
          <Shield className="h-8 w-8 text-primary fill-primary" />
        </div>
        <span className="font-bold text-[10px] tracking-tight text-primary">VulneraX</span>
      </div>

      <nav className="flex-1 w-full px-3 py-2 space-y-4 flex flex-col items-center overflow-y-auto">
        {menuItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <NavLink
              key={item.id}
              to={item.path}
              title={item.id}
              className={`relative flex items-center justify-center h-12 w-12 rounded-xl transition-colors ${
                isActive ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="active-nav-bg"
                  className="absolute inset-0 bg-primary rounded-xl"
                  initial={false}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              <item.icon className={`h-6 w-6 relative z-10`} />
            </NavLink>
          );
        })}
      </nav>

      <div className="mt-auto pt-4">
        <div className="h-10 w-10 rounded-full border-2 border-border overflow-hidden cursor-pointer hover:ring-2 ring-primary transition-all">
          <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=Admin`} alt="User" className="h-full w-full object-cover bg-secondary" />
        </div>
      </div>
    </div>
  );
}
