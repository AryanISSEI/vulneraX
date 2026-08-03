import { X, Copy, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

export default function RemediationPanel({ vulnerability, onClose }) {
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  if (!vulnerability || !mounted) return null;

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Custom components for ReactMarkdown to style code blocks
  const components = {
    code({ node, inline, className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || '');
      const codeString = String(children).replace(/\n$/, '');
      
      if (!inline && match) {
        return (
          <div className="relative group mt-4 mb-6">
            <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 to-blue-500/20 rounded-lg blur opacity-25 group-hover:opacity-100 transition duration-1000 group-hover:duration-200"></div>
            <div className="relative rounded-lg bg-[#0a0a20] border border-border overflow-hidden shadow-2xl">
              <div className="flex items-center justify-between px-4 py-2 bg-black/40 border-b border-white/5">
                <span className="text-[10px] uppercase font-mono text-primary tracking-widest">{match[1]}</span>
                <button 
                  onClick={() => handleCopy(codeString)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {copied ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                  {copied ? 'COPIED' : 'COPY'}
                </button>
              </div>
              <div className="p-4 overflow-x-auto text-sm font-mono text-blue-100/90 leading-relaxed">
                <code className={className} {...props}>
                  {children}
                </code>
              </div>
            </div>
          </div>
        );
      }
      return (
        <code className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-sm font-mono" {...props}>
          {children}
        </code>
      );
    }
  };

  const panelContent = (
    <AnimatePresence>
      <motion.div
        initial={{ x: "100%", opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: "100%", opacity: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className="fixed top-0 right-0 w-full md:w-[600px] h-full z-50 p-4 pl-0"
      >
        <div className="w-full h-full glass-panel rounded-l-3xl border-l border-y border-border shadow-[-20px_0_50px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden relative backdrop-blur-2xl bg-black/80">
          
          {/* Header */}
          <div className="px-6 py-5 border-b border-border bg-black/40 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-6 w-6 text-primary animate-pulse" />
              <h2 className="font-bold text-lg text-foreground font-mono uppercase tracking-wider">Oracle Analysis</h2>
            </div>
            <button 
              onClick={onClose}
              className="p-2 rounded-full hover:bg-foreground/10 transition-colors"
            >
              <X className="h-5 w-5 text-muted-foreground hover:text-foreground" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto p-6 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
            <div className="mb-8">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-destructive/10 border border-destructive/20 text-destructive text-xs font-mono font-bold uppercase tracking-widest mb-4 shadow-[0_0_10px_rgba(255,0,60,0.2)]">
                <AlertTriangle className="h-3 w-3" />
                {vulnerability.severity} Risk
              </div>
              <h1 className="text-2xl font-extrabold text-foreground mb-2">{vulnerability.name}</h1>
              <p className="text-muted-foreground font-mono text-sm break-all">{vulnerability.url || vulnerability.endpoint}</p>
            </div>

            <div className="prose prose-invert prose-p:text-muted-foreground prose-headings:text-foreground max-w-none">
              {vulnerability.recommendation ? (
                 <ReactMarkdown components={components}>
                   {vulnerability.recommendation}
                 </ReactMarkdown>
              ) : (
                <div className="p-4 bg-foreground/5 rounded-lg border border-border">
                  <p className="text-muted-foreground text-sm font-mono italic">No remediation data provided by AI Oracle.</p>
                </div>
              )}
            </div>
            
            <div className="mt-8 pt-8 border-t border-border">
              <h3 className="text-sm font-bold text-foreground uppercase tracking-widest mb-4 flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
                Evidence Payload
              </h3>
              <div className="bg-black/50 border border-white/5 p-4 rounded-lg font-mono text-xs text-primary/80 break-all leading-relaxed shadow-inner">
                {vulnerability.evidence || "No evidence payload attached."}
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );

  return createPortal(panelContent, document.body);
}
