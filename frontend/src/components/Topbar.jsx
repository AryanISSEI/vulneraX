import { useState, useRef, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Home, Database, Globe, Shield, User, LogOut, Settings } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuth } from '../lib/AuthContext';

export default function Topbar() {
  const location = useLocation();
  const { user, logout } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Home, path: '/' },
    { id: 'websites', label: 'Websites', icon: Globe, path: '/websites' },
    { id: 'history', label: 'History', icon: Database, path: '/history' },
  ];

  useEffect(() => {
    function handleClickOutside(event) {
      if (profileRef.current && !profileRef.current.contains(event.target)) setProfileOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="h-20 glass-nav flex items-center justify-between px-8 z-50 shrink-0 sticky top-0 w-full">
      {/* Logo */}
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 flex items-center justify-center bg-primary/10 rounded-xl border border-primary/20">
          <Shield className="h-8 w-8 text-primary fill-primary/20 animate-spin-slow" />
        </div>
        <span className="font-extrabold text-2xl tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-white to-primary">
          VulneraX
        </span>
      </div>

      {/* Navigation */}
      <nav className="hidden md:flex items-center gap-2">
        {menuItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <NavLink
              key={item.id}
              to={item.path}
              className={`relative px-4 py-2 flex items-center gap-2 text-sm font-semibold transition-all duration-300 rounded-full ${
                isActive ? 'text-white' : 'text-muted-foreground hover:text-white hover:bg-white/5'
              }`}
            >
              <item.icon className={`h-4 w-4 ${isActive ? 'text-primary' : ''}`} />
              {item.label}
              {isActive && (
                <motion.div
                  layoutId="topbar-active-indicator"
                  className="absolute inset-0 border border-primary/50 bg-primary/10 rounded-full -z-10"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Profile */}
      <div className="flex items-center gap-4">
        <div className="relative" ref={profileRef}>
          <button 
            className="flex items-center justify-center h-12 w-12 rounded-full border-2 border-border overflow-hidden hover:ring-2 hover:ring-primary transition-all focus:outline-none bg-black/50"
            onClick={() => setProfileOpen(!profileOpen)}
          >
            <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=Admin`} alt="User" className="h-full w-full object-cover" />
          </button>
          
          {profileOpen && (
            <div className="absolute right-0 mt-3 w-56 rounded-xl border border-border glass-panel shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="px-4 py-4 border-b border-border bg-black/40">
                <p className="text-sm font-bold text-white">{user?.username || 'Administrator'}</p>
                <p className="text-xs text-primary mt-1 font-mono flex items-center gap-1">
                  <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                  System Active
                </p>
              </div>
              <div className="flex flex-col p-2">
                <button className="flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg hover:bg-white/10 text-white transition-colors">
                  <Settings className="h-4 w-4 text-muted-foreground" /> Settings
                </button>
                <button onClick={logout} className="flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg hover:bg-destructive/20 hover:text-destructive text-white font-medium mt-1 transition-colors">
                  <LogOut className="h-4 w-4 text-destructive" /> Disconnect
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
