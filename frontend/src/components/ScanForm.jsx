import { useState, useRef, useEffect } from 'react';
import { Target, Loader2, Settings, ChevronDown, ChevronUp } from 'lucide-react';
import gsap from 'gsap';

export default function ScanForm({ onScan, isScanning }) {
  const [target, setTarget] = useState('');
  const [headers, setHeaders] = useState('');
  const [cookies, setCookies] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [shattered, setShattered] = useState(false);
  const formRef = useRef(null);
  const containerRef = useRef(null);
  const particlesRef = useRef([]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (target.trim()) {
      let parsedHeaders = null;
      let parsedCookies = null;

      try {
        if (headers.trim()) parsedHeaders = JSON.parse(headers);
      } catch (err) {
        alert("Invalid JSON format in Headers. Please provide valid JSON.");
        return;
      }

      try {
        if (cookies.trim()) parsedCookies = JSON.parse(cookies);
      } catch (err) {
        alert("Invalid JSON format in Cookies. Please provide valid JSON.");
        return;
      }

      triggerShatterEffect();
      // Delay the actual scan start so the animation plays out
      setTimeout(() => {
        onScan(target.trim(), parsedHeaders, parsedCookies);
        setTarget('');
      }, 1500);
    }
  };

  const triggerShatterEffect = () => {
    setShattered(true);
    
    // Animate the actual input fading out
    gsap.to(formRef.current, {
      opacity: 0,
      scale: 1.1,
      duration: 0.3,
      ease: "power2.out"
    });

    // Create particles
    const rect = formRef.current.getBoundingClientRect();
    const containerRect = containerRef.current.getBoundingClientRect();
    const numParticles = 40;
    
    for (let i = 0; i < numParticles; i++) {
      const particle = document.createElement('div');
      particle.className = 'absolute bg-primary rounded-full shadow-md z-50';
      
      // Random size
      const size = Math.random() * 6 + 2;
      particle.style.width = `${size}px`;
      particle.style.height = `${size}px`;
      
      // Starting position inside the input area relative to container
      const startX = (Math.random() * rect.width) + (rect.left - containerRect.left);
      const startY = (Math.random() * rect.height) + (rect.top - containerRect.top);
      
      particle.style.left = `${startX}px`;
      particle.style.top = `${startY}px`;
      
      containerRef.current.appendChild(particle);
      particlesRef.current.push(particle);

      // Animation timeline for each particle
      const tl = gsap.timeline();
      
      // 1. Explode outward
      tl.to(particle, {
        x: (Math.random() - 0.5) * 300,
        y: (Math.random() - 0.5) * 300,
        opacity: Math.random() * 0.5 + 0.5,
        duration: 0.5 + Math.random() * 0.3,
        ease: "expo.out"
      })
      // 2. Swarm to center target (representing crawler)
      .to(particle, {
        x: (containerRect.width / 2) - startX,
        y: -100 - startY, // Swarm upwards into the dashboard
        opacity: 0,
        duration: 1 + Math.random() * 0.5,
        ease: "power3.inOut",
        onComplete: () => {
          if (particle.parentNode) {
            particle.parentNode.removeChild(particle);
          }
        }
      });
    }
  };

  // Reset form when scanning completes (if it completes fast or fails)
  useEffect(() => {
    if (!isScanning && shattered) {
      setShattered(false);
      gsap.to(formRef.current, {
        opacity: 1,
        scale: 1,
        duration: 0.5,
        delay: 0.5,
        ease: "power2.out"
      });
      particlesRef.current = [];
    }
  }, [isScanning, shattered]);

  return (
    <div ref={containerRef} className="relative w-full max-w-3xl mx-auto my-8">
      <form 
        ref={formRef}
        onSubmit={handleSubmit} 
        className="relative flex flex-col sm:flex-row gap-4 w-full group"
      >
        <div className="relative flex-1">
          <div className="absolute inset-0 bg-primary/20 blur-xl rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          
          <div className="relative flex items-center bg-card border-2 border-border hover:border-primary/50 focus-within:border-primary rounded-2xl px-4 py-2 backdrop-blur-xl transition-all duration-300 shadow-md focus-within:shadow-[0_0_25px_var(--primary)]">
            <Target className="h-6 w-6 text-primary shrink-0 animate-pulse" />
            <input
              type="text"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="ENTER TARGET DOMAIN OR IP..."
              className="w-full bg-transparent border-none outline-none text-foreground px-4 py-4 font-mono text-lg placeholder:text-muted-foreground tracking-widest"
              disabled={shattered}
            />
          </div>
        </div>
        
        <button 
          type="submit" 
          disabled={!target.trim() || shattered}
          className={`relative overflow-hidden rounded-2xl px-10 py-4 font-bold tracking-widest uppercase transition-all duration-300 ${
            target.trim() && !shattered
              ? 'bg-primary text-primary-foreground hover:scale-[1.02] shadow-md hover:shadow-lg focus:ring-2 focus:ring-ring' 
              : 'bg-muted text-muted-foreground border border-border opacity-50 cursor-not-allowed'
          }`}
        >
          {shattered ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              Scanning
            </span>
          ) : (
            <span className="relative z-10">Engage</span>
          )}
        </button>
      </form>

      {/* Advanced Settings Toggle */}
      {!shattered && (
        <div className="mt-4 flex flex-col items-center">
          <button 
            type="button" 
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-primary transition-colors uppercase tracking-widest"
          >
            <Settings className="h-4 w-4" />
            Advanced Settings
            {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          
          {/* Advanced Settings Panel */}
          {showAdvanced && (
            <div className="mt-4 w-full grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in slide-in-from-top-4 fade-in duration-300">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Custom Headers (JSON)</label>
                <textarea 
                  className="w-full bg-card border-2 border-border focus:border-primary rounded-xl p-3 font-mono text-xs text-foreground placeholder:text-muted-foreground min-h-[100px] resize-y shadow-inner outline-none transition-colors"
                  placeholder='{"Authorization": "Bearer token", "X-Custom": "Value"}'
                  value={headers}
                  onChange={(e) => setHeaders(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Custom Cookies (JSON)</label>
                <textarea 
                  className="w-full bg-card border-2 border-border focus:border-primary rounded-xl p-3 font-mono text-xs text-foreground placeholder:text-muted-foreground min-h-[100px] resize-y shadow-inner outline-none transition-colors"
                  placeholder='{"session_id": "12345", "user_prefs": "dark_mode"}'
                  value={cookies}
                  onChange={(e) => setCookies(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Target display when shattered */}
      {shattered && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center animate-in fade-in zoom-in duration-500 delay-500">
            <h3 className="text-primary font-mono tracking-[0.5em] text-sm mb-2 opacity-80">INITIALIZING CRAWLER</h3>
            <p className="text-foreground text-2xl font-extrabold tracking-wider filter drop-shadow-md">
              {target}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
