import { X, Copy, CheckCircle2, AlertTriangle, ShieldCheck, Sparkles, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { generateAIRemediation } from '../api/client';

const getRemediationSnippet = (vuln) => {
  const name = (vuln?.name || '').toLowerCase();
  const category = (vuln?.category || '').toLowerCase();

  if (name.includes('xss') || category.includes('xss')) {
    return `// 1. Content Security Policy (CSP) Header\nHeader set Content-Security-Policy "default-src 'self'; script-src 'self';"\n\n// 2. Output Encoding in Application Code\nconst safeOutput = DOMPurify.sanitize(userInput);\nelement.innerText = safeOutput;`;
  }
  if (name.includes('sqli') || name.includes('sql') || category.includes('sqli')) {
    return `// 1. Parameterized Query (Python SQLAlchemy)\nstmt = select(User).where(User.username == bindparam('username'))\n\n// 2. Prepared Statement (Node.js PG / PostgreSQL)\nconst result = await db.query('SELECT * FROM users WHERE id = $1', [userId]);`;
  }
  if (name.includes('traversal') || category.includes('traversal')) {
    return `// Secure File Path Resolution (Python)\nimport os\n\nbase_dir = os.path.abspath("/var/www/uploads")\nrequested_path = os.path.abspath(os.path.join(base_dir, filename))\n\nif not requested_path.startswith(base_dir):\n    raise PermissionError("Directory Traversal Attempt Blocked")`;
  }
  if (name.includes('sensitive') || name.includes('.env') || name.includes('.git') || category.includes('sensitive')) {
    return `# Nginx Access Restriction Rule\nlocation ~ /\\.(env|git|htaccess|config) {\n    deny all;\n    return 404;\n}`;
  }
  if (name.includes('redirect') || category.includes('redirect')) {
    return `// Validate Redirect URLs against a Trusted Whitelist\nconst allowedDomains = ['example.com', 'auth.example.com'];\nconst targetUrl = new URL(userProvidedRedirect);\n\nif (!allowedDomains.includes(targetUrl.hostname)) {\n    throw new Error("Untrusted Redirect Target");\n}`;
  }
  return `// Standard Security Remediation Best Practices:\n// 1. Validate and sanitize all incoming client parameters.\n// 2. Enforce Strict Transport Security (HSTS) and HTTPS TLS 1.3.\n// 3. Principle of Least Privilege for API/Database credentials.`;
};

export default function RemediationPanel({ vulnerability, onClose, scanId }) {
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiRemediation, setAiRemediation] = useState(null);
  const [aiError, setAiError] = useState(null);

  useEffect(() => {
    setMounted(true);
    setAiRemediation(null); // Reset when a new vulnerability is opened
    setAiError(null);
    return () => setMounted(false);
  }, [vulnerability]);

  if (!vulnerability || !mounted) return null;

  const handleGenerateAI = async () => {
    if (!scanId) {
       setAiError("Scan ID is required for AI remediation.");
       return;
    }
    setIsGenerating(true);
    setAiError(null);
    try {
      const { data } = await generateAIRemediation(
        scanId,
        vulnerability.name,
        vulnerability.description,
        vulnerability.evidence
      );
      setAiRemediation(data.remediation);
    } catch (err) {
      setAiError(err.response?.data?.detail || "Failed to generate AI remediation. Ensure your API key is set.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const patchCode = getRemediationSnippet(vulnerability);

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
              <h2 className="font-bold text-lg text-foreground font-mono uppercase tracking-wider">AI Remediation & Patch Analysis</h2>
            </div>
            <button 
              onClick={onClose}
              className="p-2 rounded-full hover:bg-foreground/10 transition-colors"
            >
              <X className="h-5 w-5 text-muted-foreground hover:text-foreground" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto p-6 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent space-y-6">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-destructive/10 border border-destructive/20 text-destructive text-xs font-mono font-bold uppercase tracking-widest mb-4 shadow-[0_0_10px_rgba(255,0,60,0.2)]">
                <AlertTriangle className="h-3 w-3" />
                {vulnerability.severity} Risk
              </div>
              <h1 className="text-2xl font-extrabold text-foreground mb-2">{vulnerability.name}</h1>
              <p className="text-muted-foreground font-mono text-sm break-all">{vulnerability.url || vulnerability.endpoint}</p>
            </div>

            {vulnerability.description && (
              <div className="p-4 rounded-xl bg-secondary/30 border border-border/50 text-sm text-foreground space-y-1">
                <span className="text-[10px] font-bold font-mono uppercase tracking-wider text-muted-foreground block">Vulnerability Description</span>
                <p>{vulnerability.description}</p>
              </div>
            )}

            <div className="prose prose-invert prose-p:text-muted-foreground prose-headings:text-foreground max-w-none">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-bold font-mono uppercase tracking-wider text-primary block">Recommended Guidance</span>
                <button
                  onClick={handleGenerateAI}
                  disabled={isGenerating}
                  className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 rounded-full text-xs font-bold uppercase tracking-widest transition-all shadow-[0_0_15px_rgba(0,240,255,0.15)] hover:shadow-[0_0_25px_rgba(0,240,255,0.3)] disabled:opacity-50"
                >
                  {isGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {isGenerating ? 'Generating...' : 'AI Analyze'}
                </button>
              </div>

              {aiError && (
                <div className="p-3 mb-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm font-mono">
                  {aiError}
                </div>
              )}

              {aiRemediation ? (
                <div className="p-4 rounded-xl border border-primary/30 bg-primary/5 shadow-inner">
                  <ReactMarkdown components={components}>
                    {aiRemediation}
                  </ReactMarkdown>
                </div>
              ) : vulnerability.recommendation ? (
                 <ReactMarkdown components={components}>
                   {vulnerability.recommendation}
                 </ReactMarkdown>
              ) : (
                <div className="p-4 bg-foreground/5 rounded-lg border border-border">
                  <p className="text-muted-foreground text-sm font-mono italic">Implement strict input validation, contextual output encoding, and enforce least-privilege security policies.</p>
                </div>
              )}
            </div>

            {/* Code Patch Suggestion */}
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold font-mono uppercase tracking-wider text-emerald-400">
                  Remediation & Patch Code Snippet
                </span>
                <button
                  onClick={() => handleCopy(patchCode)}
                  className="flex items-center gap-1 text-[11px] font-mono text-muted-foreground hover:text-foreground"
                >
                  {copied ? <CheckCircle2 className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                  {copied ? 'COPIED' : 'COPY PATCH'}
                </button>
              </div>
              <pre className="p-4 rounded-xl bg-black/90 text-emerald-400 font-mono text-xs overflow-x-auto border border-emerald-500/20 leading-relaxed shadow-inner">
                <code>{patchCode}</code>
              </pre>
            </div>
            
            <div className="pt-4 border-t border-border">
              <h3 className="text-xs font-bold text-foreground uppercase tracking-widest mb-3 flex items-center gap-2">
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
