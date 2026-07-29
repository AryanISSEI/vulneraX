import React from 'react';

export default function Contact() {
  return (
    <div className="w-full h-full p-8 flex flex-col space-y-6 glass-panel rounded-2xl border border-white/10 relative overflow-hidden">
      <h1 className="text-3xl font-bold tracking-tight">Contact</h1>
      <p className="mt-1 text-muted-foreground">Get in touch with the VulneraX team.</p>
      
      <div className="mt-8 p-6 bg-black/40 rounded-xl border border-white/5">
        <p className="text-sm text-foreground">Support Email: support@vulnerax.com</p>
      </div>
    </div>
  );
}
