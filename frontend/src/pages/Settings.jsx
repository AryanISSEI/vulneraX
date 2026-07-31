import React, { useState } from 'react';
import { User, Palette, Shield, Key, Mail, Lock, CheckCircle, Save } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../lib/AuthContext';
import { useTheme } from '../components/ThemeProvider';
import PlatformPlaceholder from '../components/PlatformPlaceholder';

export default function Settings() {
  const [activeTab, setActiveTab] = useState('profile');
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User, description: 'Manage your public details' },
    { id: 'appearance', label: 'Appearance', icon: Palette, description: 'Customize UI theme' },
    { id: 'security', label: 'Security', icon: Shield, description: 'Update password & 2FA' },
    { id: 'api', label: 'API Keys', icon: Key, description: 'Manage developer access' },
  ];

  const themes = [
    { id: 'light', name: 'Cyber Classic', color: 'bg-white', border: 'border-slate-200' },
    { id: 'dark', name: 'Flat Crimson', color: 'bg-black', border: 'border-red-600' },
    { id: 'midnight', name: 'Midnight Blue', color: 'bg-slate-950', border: 'border-blue-600' },
    { id: 'neon', name: 'Neon Pulse', color: 'bg-zinc-950', border: 'border-cyan-400' },
    { id: 'ocean', name: 'Ocean Depth', color: 'bg-slate-900', border: 'border-sky-500' },
    { id: 'sunset', name: 'Cyber Sunset', color: 'bg-[#2a1b18]', border: 'border-rose-500' }
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case 'profile':
        return (
          <div className="space-y-6">
            <div className="glass-panel p-6">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                Personal Information
              </h3>
              <div className="space-y-4 max-w-md">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">Username</label>
                  <input 
                    type="text" 
                    defaultValue={user?.username || 'Admin'} 
                    className="w-full bg-background border border-border rounded-lg px-4 py-2 text-foreground focus:ring-2 focus:ring-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input 
                      type="email" 
                      defaultValue="admin@vulnerax.io" 
                      className="w-full bg-background border border-border rounded-lg pl-10 pr-4 py-2 text-foreground focus:ring-2 focus:ring-primary focus:outline-none"
                    />
                  </div>
                </div>
                <button className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg font-medium hover:bg-primary/90 transition-colors">
                  <Save className="h-4 w-4" /> Save Changes
                </button>
              </div>
            </div>
          </div>
        );

      case 'appearance':
        return (
          <div className="space-y-6">
            <div className="glass-panel p-6">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <Palette className="h-5 w-5 text-primary" />
                Theme Configuration
              </h3>
              <p className="text-sm text-muted-foreground mb-6">Select a theme to immediately apply it across the platform.</p>
              
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {themes.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTheme(t.id)}
                    className={`relative p-4 rounded-xl border flex flex-col items-center gap-3 transition-all ${
                      theme === t.id 
                        ? 'border-primary bg-primary/10 ring-2 ring-primary/20' 
                        : 'border-border hover:border-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {theme === t.id && (
                      <div className="absolute top-2 right-2 text-primary">
                        <CheckCircle className="h-4 w-4" />
                      </div>
                    )}
                    <div className={`w-12 h-12 rounded-full border-2 ${t.color} ${t.border} shadow-lg`} />
                    <span className="text-sm font-medium">{t.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        );

      case 'security':
        return (
          <div className="space-y-6">
            <div className="glass-panel p-6">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <Lock className="h-5 w-5 text-primary" />
                Change Password
              </h3>
              <div className="space-y-4 max-w-md">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">Current Password</label>
                  <input 
                    type="password" 
                    className="w-full bg-background border border-border rounded-lg px-4 py-2 text-foreground focus:ring-2 focus:ring-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">New Password</label>
                  <input 
                    type="password" 
                    className="w-full bg-background border border-border rounded-lg px-4 py-2 text-foreground focus:ring-2 focus:ring-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">Confirm New Password</label>
                  <input 
                    type="password" 
                    className="w-full bg-background border border-border rounded-lg px-4 py-2 text-foreground focus:ring-2 focus:ring-primary focus:outline-none"
                  />
                </div>
                <button className="flex items-center gap-2 bg-destructive text-destructive-foreground px-4 py-2 rounded-lg font-medium hover:bg-destructive/90 transition-colors">
                  <Shield className="h-4 w-4" /> Update Password
                </button>
              </div>
            </div>
          </div>
        );

      case 'api':
        return (
          <div className="space-y-6">
            <PlatformPlaceholder
              eyebrow="Developer"
              title="API Keys"
              description="Generate and manage API keys for external integrations and programmatic access to VulneraX capabilities."
            />
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="h-full flex flex-col md:flex-row gap-6">
      
      {/* Sidebar Navigation */}
      <div className="w-full md:w-64 flex-shrink-0">
        <div className="glass-panel p-4 h-full sticky top-0">
          <h2 className="text-xl font-bold mb-6 px-2">Settings</h2>
          <nav className="space-y-1">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-start gap-3 px-3 py-3 rounded-lg text-left transition-all ${
                    isActive 
                      ? 'bg-primary/20 text-foreground' 
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <tab.icon className={`h-5 w-5 mt-0.5 ${isActive ? 'text-primary' : ''}`} />
                  <div>
                    <div className={`text-sm font-medium ${isActive ? 'text-primary' : ''}`}>
                      {tab.label}
                    </div>
                    <div className="text-xs opacity-70 mt-0.5">
                      {tab.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <div className="mb-6">
                <h1 className="text-2xl font-bold">{tabs.find(t => t.id === activeTab)?.label}</h1>
                <p className="text-muted-foreground mt-1">{tabs.find(t => t.id === activeTab)?.description}</p>
              </div>
              
              {renderTabContent()}
              
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

    </div>
  );
}
