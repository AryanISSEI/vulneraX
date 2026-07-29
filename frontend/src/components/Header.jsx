import { useState, useRef, useEffect } from 'react';
import { LogOut, Settings } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';

export default function Header() {
  const [profileOpen, setProfileOpen] = useState(false);
  const { user, logout } = useAuth();
  const profileRef = useRef(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (profileRef.current && !profileRef.current.contains(event.target)) setProfileOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="h-16 flex items-center justify-between px-6 z-10 shrink-0 bg-transparent">
      <div className="flex-1" />
      
      <div className="flex items-center gap-4">
        {/* User Profile */}
        <div className="relative" ref={profileRef}>
          <button 
            className="flex items-center justify-center h-10 w-10 rounded-full border-2 border-border overflow-hidden hover:ring-2 hover:ring-[#0a192f]/30 transition-all focus:outline-none bg-white"
            onClick={() => setProfileOpen(!profileOpen)}
          >
            <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=Admin`} alt="User" className="h-full w-full object-cover" />
          </button>
          
          {profileOpen && (
            <div className="absolute right-0 mt-2 w-48 rounded-md border border-border bg-popover shadow-lg overflow-hidden z-50 animate-in fade-in zoom-in duration-200">
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
