import { useState, useRef, useEffect } from 'react';
import { Moon, Sun, Monitor, Laptop, User, LogOut, Settings } from 'lucide-react';
import { useTheme } from './ThemeProvider';
import { Button } from './ui/button';
import { useAuth } from '../lib/AuthContext';

export default function Header() {
  const { theme, setTheme } = useTheme();
  const [themeOpen, setThemeOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const { user, logout } = useAuth();
  
  const themeRef = useRef(null);
  const profileRef = useRef(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (themeRef.current && !themeRef.current.contains(event.target)) setThemeOpen(false);
      if (profileRef.current && !profileRef.current.contains(event.target)) setProfileOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="h-16 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 flex items-center justify-between px-6 z-10 shrink-0">
      <div className="flex-1" />
      
      <div className="flex items-center gap-4">
        {/* Theme Switcher */}
        <div className="relative" ref={themeRef}>
          <Button variant="ghost" size="icon" onClick={() => setThemeOpen(!themeOpen)}>
            {theme === 'light' ? <Sun className="h-5 w-5" /> : theme === 'midnight' ? <Monitor className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>
          
          {themeOpen && (
            <div className="absolute right-0 mt-2 w-40 rounded-md border border-border bg-popover shadow-md overflow-hidden z-50 animate-in fade-in zoom-in duration-200">
              <div className="flex flex-col p-1">
                <button onClick={() => { setTheme('light'); setThemeOpen(false); }} className={`flex items-center gap-2 px-3 py-2 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground ${theme === 'light' ? 'bg-accent text-accent-foreground font-medium' : 'text-foreground'}`}>
                  <Sun className="h-4 w-4" /> Light Mode
                </button>
                <button onClick={() => { setTheme('dark'); setThemeOpen(false); }} className={`flex items-center gap-2 px-3 py-2 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground ${theme === 'dark' ? 'bg-accent text-accent-foreground font-medium' : 'text-foreground'}`}>
                  <Moon className="h-4 w-4" /> Dark Mode
                </button>
                <button onClick={() => { setTheme('midnight'); setThemeOpen(false); }} className={`flex items-center gap-2 px-3 py-2 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground ${theme === 'midnight' ? 'bg-accent text-accent-foreground font-medium' : 'text-foreground'}`}>
                  <Monitor className="h-4 w-4" /> Midnight
                </button>
                <div className="h-px bg-border my-1" />
                <button onClick={() => { setTheme('neon'); setThemeOpen(false); }} className={`flex items-center gap-2 px-3 py-2 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground ${theme === 'neon' ? 'bg-accent text-accent-foreground font-medium' : 'text-foreground'}`}>
                  <div className="h-2 w-2 rounded-full bg-[#39ff14]" /> Neon Cyberpunk
                </button>
                <button onClick={() => { setTheme('ocean'); setThemeOpen(false); }} className={`flex items-center gap-2 px-3 py-2 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground ${theme === 'ocean' ? 'bg-accent text-accent-foreground font-medium' : 'text-foreground'}`}>
                  <div className="h-2 w-2 rounded-full bg-[#06b6d4]" /> Deep Ocean
                </button>
                <button onClick={() => { setTheme('sunset'); setThemeOpen(false); }} className={`flex items-center gap-2 px-3 py-2 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground ${theme === 'sunset' ? 'bg-accent text-accent-foreground font-medium' : 'text-foreground'}`}>
                  <div className="h-2 w-2 rounded-full bg-[#f97316]" /> Sunset
                </button>
              </div>
            </div>
          )}
        </div>

        {/* User Profile */}
        <div className="relative" ref={profileRef}>
          <button 
            className="flex items-center justify-center h-9 w-9 rounded-full bg-secondary border border-border overflow-hidden hover:ring-2 hover:ring-primary/50 transition-all focus:outline-none"
            onClick={() => setProfileOpen(!profileOpen)}
          >
            <User className="h-5 w-5 text-muted-foreground" />
          </button>
          
          {profileOpen && (
            <div className="absolute right-0 mt-2 w-48 rounded-md border border-border bg-popover shadow-md overflow-hidden z-50 animate-in fade-in zoom-in duration-200">
              <div className="px-4 py-3 border-b border-border">
                <p className="text-sm font-medium text-foreground">{user?.username || 'Guest'}</p>
                <p className="text-xs text-muted-foreground truncate">User</p>
              </div>
              <div className="flex flex-col p-1">
                <button className="flex items-center gap-2 px-3 py-2 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground text-foreground">
                  <Settings className="h-4 w-4" /> Account Settings
                </button>
                <button onClick={logout} className="flex items-center gap-2 px-3 py-2 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground text-destructive font-medium mt-1">
                  <LogOut className="h-4 w-4" /> Log out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
