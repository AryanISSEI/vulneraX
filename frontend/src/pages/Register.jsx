import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { register } from '../api/client';
import { Lock } from 'lucide-react';

export default function Register() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    try {
      const res = await register(email, password);
      localStorage.setItem('vulnerax_token', res.data.access_token);
      window.location.href = '/';
    } catch (err) {
      setError(err.response?.data?.detail || 'Registration failed');
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col bg-background network-bg-full relative overflow-hidden">
      {/* Top Bar */}
      <div className="w-full h-24 flex items-center justify-between px-8 md:px-16 border-b border-border bg-background/80 backdrop-blur-md z-10 shrink-0">
        <div className="text-3xl font-bold text-foreground">VulneraX</div>
        <div className="text-sm text-muted-foreground font-medium">
          Already have an account? <Link to="/login" className="text-primary hover:underline ml-1">Sign in now!</Link>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-start px-8 md:px-32 z-10">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-[440px]"
        >
          <h1 className="text-4xl font-bold text-foreground mb-2 leading-tight">Welcome! Let's<br/>Create Your Account.</h1>
          <p className="text-muted-foreground mb-8 font-medium">Log in below to access your Account.</p>
          
          {error && <div className="p-3 mb-4 text-sm text-destructive bg-destructive/10 rounded-md border border-destructive/20">{error}</div>}
          
          <form onSubmit={handleRegister} className="space-y-4">
            <input 
              type="text" 
              placeholder="First Name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full p-4 rounded bg-input text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all border-none"
            />
            <input 
              type="text" 
              placeholder="Last Name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full p-4 rounded bg-input text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all border-none"
            />
            <input 
              type="email" 
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-4 rounded bg-input text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all border-none"
              required
            />
            <input 
              type="password" 
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-4 rounded bg-input text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all border-none"
              required
            />
            <input 
              type="tel" 
              placeholder="Phone Number"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full p-4 rounded bg-input text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all border-none"
            />
            
            <div className="flex items-center gap-2 pt-2">
              <input type="checkbox" id="remember" className="w-4 h-4 rounded border-border text-primary focus:ring-primary bg-background" />
              <label htmlFor="remember" className="text-sm text-foreground font-medium cursor-pointer">Remember me</label>
            </div>

            <button type="submit" className="w-full mt-6 py-4 px-4 bg-primary text-primary-foreground rounded font-medium hover:bg-primary/90 transition-colors">
              Sign Up
            </button>
          </form>

          <div className="mt-4 flex items-center justify-start gap-2 text-xs text-muted-foreground">
            <Lock className="h-3 w-3" />
            <span>Your information is secure.</span>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
