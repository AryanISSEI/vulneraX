import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { register } from '../api/client';
import { Shield } from 'lucide-react';

export default function Register() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    try {
      const res = await register(username, password);
      localStorage.setItem('vulnerax_token', res.data.access_token);
      window.location.href = '/';
    } catch (err) {
      setError(err.response?.data?.detail || 'Registration failed');
    }
  };

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md p-8 border rounded-lg bg-card/50 backdrop-blur-xl shadow-2xl"
      >
        <div className="flex justify-center mb-8">
          <Shield className="w-12 h-12 text-primary" />
        </div>
        <h1 className="text-2xl font-bold text-center mb-2 text-foreground">Create Account</h1>
        <p className="text-muted-foreground text-center mb-8">Join VulneraX Platform</p>
        
        {error && <div className="p-3 mb-4 text-sm text-red-500 bg-red-500/10 rounded-md border border-red-500/20">{error}</div>}
        
        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Username</label>
            <input 
              type="text" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full p-2 rounded-md bg-background border border-input focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Password</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-2 rounded-md bg-background border border-input focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
              required
            />
          </div>
          <button type="submit" className="w-full py-2 px-4 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 font-medium transition-colors">
            Register
          </button>
        </form>
        <div className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account? <Link to="/login" className="text-primary hover:underline">Login</Link>
        </div>
      </motion.div>
    </div>
  );
}
