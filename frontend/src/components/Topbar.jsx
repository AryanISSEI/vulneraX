import { useState, useRef, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Home, Database, Globe, Shield, User, LogOut, Settings, Activity, Palette, Sun, Moon } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuth } from '../lib/AuthContext';
import { useTheme } from './ThemeProvider';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import gsap from 'gsap';

export default function Topbar() {
  const location = useLocation();
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  
  const logoRef = useRef(null);



  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Home, path: '/' },
    { id: 'websites', label: 'Active Scans', icon: Globe, path: '/websites' },
    { id: 'history', label: 'AI Reports', icon: Database, path: '/history' },
  ];

  return (
    <div className="sticky top-0 left-0 right-0 z-50 w-full glass-nav border-b border-border">
      <header className="h-16 w-full max-w-7xl mx-auto flex items-center justify-between px-4 md:px-8">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <Shield className="h-6 w-6 text-primary" />
          <span className="font-extrabold text-xl tracking-tight text-foreground flex">
            Vulnera<span ref={logoRef} className="text-primary ml-[1px]">X</span>
          </span>
        </div>

        {/* Navigation */}
        <nav className="hidden md:flex items-center gap-1 relative">
          {menuItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <NavLink
                key={item.id}
                to={item.path}
                className={`relative px-5 py-2 flex items-center gap-2 text-sm font-medium transition-colors rounded-full group ${
                  isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <item.icon className={`h-4 w-4 ${isActive ? 'text-primary' : 'group-hover:text-primary transition-colors'}`} />
                {item.label}
                {isActive && (
                  <motion.div
                    layoutId="topbar-active-indicator"
                    className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-primary"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Status & Profile */}
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted border border-border">
            <Activity className="h-4 w-4 text-risk-medium animate-pulse" />
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Threat</span>
            <span className="text-[10px] font-bold text-risk-medium font-mono uppercase tracking-widest">MODERATE</span>
          </div>

          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button className="flex items-center justify-center h-10 w-10 rounded-full border border-border overflow-hidden hover:ring-2 hover:ring-primary transition-all focus:outline-none bg-muted text-muted-foreground hover:text-foreground">
                <Palette className="h-4 w-4" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content 
                className="min-w-[150px] rounded-xl border border-border bg-card/90 backdrop-blur-xl p-2 shadow-2xl animate-in fade-in slide-in-from-top-2 z-[60]"
                sideOffset={8}
                align="end"
              >
                <div className="px-3 py-2 mb-1 border-b border-white/5">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Theme</p>
                </div>
                {['light', 'dark', 'midnight', 'neon', 'ocean', 'sunset'].map((t) => (
                  <DropdownMenu.Item 
                    key={t}
                    onClick={() => setTheme(t)}
                    className={`flex items-center gap-3 px-3 py-2 text-sm rounded-lg cursor-pointer outline-none capitalize ${theme === t ? 'bg-primary/20 text-primary' : 'hover:bg-primary/10 text-foreground'}`}
                  >
                    {t === 'light' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />} {t}
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>

          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button className="flex items-center justify-center h-10 w-10 rounded-full border border-border overflow-hidden hover:ring-2 hover:ring-primary transition-all focus:outline-none bg-muted">
                <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=Admin`} alt="User" className="h-full w-full object-cover" />
              </button>
            </DropdownMenu.Trigger>

            <DropdownMenu.Portal>
              <DropdownMenu.Content 
                className="min-w-[220px] rounded-xl border border-border bg-card/90 backdrop-blur-xl p-2 shadow-2xl animate-in fade-in slide-in-from-top-2 z-[60]"
                sideOffset={8}
                align="end"
              >
                <div className="px-3 py-2 mb-2 border-b border-border">
                  <p className="text-sm font-bold text-foreground">{user?.username || 'Administrator'}</p>
                  <p className="text-xs text-primary font-mono flex items-center gap-1.5 mt-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                    System Active
                  </p>
                </div>
                <DropdownMenu.Item 
                  onClick={() => navigate('/settings')}
                  className="flex items-center gap-3 px-3 py-2 text-sm rounded-lg hover:bg-primary/10 text-foreground cursor-pointer outline-none"
                >
                  <Settings className="h-4 w-4 text-muted-foreground" /> Settings
                </DropdownMenu.Item>
                <DropdownMenu.Item 
                  onClick={logout}
                  className="flex items-center gap-3 px-3 py-2 text-sm rounded-lg hover:bg-destructive/20 text-foreground hover:text-destructive cursor-pointer outline-none mt-1"
                >
                  <LogOut className="h-4 w-4" /> Disconnect
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </header>
    </div>
  );
}
