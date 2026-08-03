import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { History as HistoryIcon, Search, Shield, ExternalLink, Loader2, RefreshCw, Trash2, Sparkles, FileText, Download, X, Code, CheckCircle, AlertTriangle, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getScanHistory, deleteScan, getScanResults, getReport } from '../api/client';
import { formatTimestamp, riskScoreColor } from '../utils/helpers';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';

export default function History() {
  const [scans, setScans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedScanReport, setSelectedScanReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const navigate = useNavigate();

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const { data } = await getScanHistory();
      setScans(data.scans || []);
    } catch (err) {
      console.error('Failed to fetch history:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (scanId) => {
    if (!window.confirm('Are you sure you want to delete this scan history?')) return;
    try {
      await deleteScan(scanId);
      setScans(scans.filter(s => s.scan_id !== scanId));
      if (selectedScanReport?.scan_id === scanId) {
        setSelectedScanReport(null);
      }
    } catch (err) {
      console.error('Failed to delete scan:', err);
      alert('Failed to delete scan. Please try again.');
    }
  };

  const handleViewDashboard = async (scan) => {
    try {
      const { data: results } = await getScanResults(scan.scan_id);
      localStorage.setItem('vulnerax_active_scan', JSON.stringify({
        target: scan.target,
        scanId: scan.scan_id,
        scanStatus: scan.status,
        scanResult: results
      }));
    } catch (err) {
      console.error('Error loading scan for dashboard:', err);
    }
    navigate(`/?scan=${scan.scan_id}`);
  };

  const handleOpenAIReport = async (scan) => {
    setReportLoading(true);
    try {
      const { data: results } = await getScanResults(scan.scan_id);
      setSelectedScanReport({
        ...scan,
        results
      });
    } catch (err) {
      console.error('Failed to load scan report:', err);
      alert('Failed to load report data.');
    } finally {
      setReportLoading(false);
    }
  };

  const handleDownloadReport = async (scanId, format, target) => {
    try {
      const response = await getReport(scanId, format);
      const filename = `VulneraX_AI_Report_${target.replace(/[^a-zA-Z0-9]/g, '_')}`;
      
      let blob;
      if (format === 'json') {
        blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
      } else if (format === 'pdf') {
        blob = new Blob([response.data], { type: 'application/pdf' });
      } else {
        blob = new Blob([response.data], { type: 'text/html' });
      }
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download report:', err);
      alert('Failed to download report file. Make sure the backend server is active.');
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const filtered = scans.filter((s) =>
    s.target.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.05 }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
  };

  // Helper to build AI Exploit Chain & Reasoning
  const buildAIReasoning = (results, status) => {
    if (status === 'aborted' || results?.status === 'aborted') {
      return "This security scan was aborted by the user before completion. Complete vulnerability detection and AI exploit reasoning could not be conducted for this target.";
    }
    if (!results) return "Scan results pending or uninitialized.";
    const vulns = results.vulnerabilities || [];
    const headers = results.headers || {};
    const ssl = results.ssl || {};

    let reasoning = [];
    if (vulns.some(v => v.type?.toLowerCase().includes('sqli'))) {
      reasoning.push("Critical SQL Injection flaws detected. Unauthenticated threat actors can manipulate backend database queries to bypass authentication and exfiltrate databases.");
    }
    if (vulns.some(v => v.type?.toLowerCase().includes('xss'))) {
      reasoning.push("Cross-Site Scripting (XSS) reflection vectors allow malicious script execution within user browsers to steal session tokens.");
    }
    if (vulns.some(v => v.type?.toLowerCase().includes('traversal'))) {
      reasoning.push("Path Traversal vulnerabilities allow attackers to break directory boundaries and inspect restricted configuration files.");
    }
    if (headers.missing_headers?.length) {
      reasoning.push(`Missing HTTP security headers (${headers.missing_headers.slice(0, 3).join(', ')}) expose client sessions to clickjacking and MIME-type sniffing.`);
    }
    if (ssl.valid === false) {
      reasoning.push("SSL/TLS handshake errors or outdated protocols permit Man-in-the-Middle (MITM) interception of network traffic.");
    }
    if (reasoning.length === 0) {
      reasoning.push("Target system demonstrated strong adherence to security baselines. Periodic reassessment is recommended.");
    }

    return reasoning.join(" ");
  };

  // Helper to get patch code snippets
  const getPatchSnippet = (vulnType) => {
    const t = vulnType?.toLowerCase() || '';
    if (t.includes('xss')) {
      return `// 1. Set Content-Security-Policy header in web server:\nHeader set Content-Security-Policy "default-src 'self'; script-src 'self';"\n\n// 2. Sanitize HTML outputs in JavaScript:\nconst cleanHTML = DOMPurify.sanitize(userSubmittedInput);`;
    }
    if (t.includes('sqli')) {
      return `// Python SQLAlchemy Parameterized Query:\nstmt = select(User).where(User.username == bindparam('username'))\n\n// Node.js PG Prepared Statement:\nconst res = await client.query('SELECT * FROM users WHERE id = $1', [userId]);`;
    }
    if (t.includes('traversal')) {
      return `// Python Secure Path Sanitization:\nimport os\nbase_dir = "/var/www/uploads"\ntarget_path = os.path.abspath(os.path.join(base_dir, requested_file))\nif not target_path.startswith(base_dir):\n    raise PermissionError("Access Denied")`;
    }
    if (t.includes('header')) {
      return `// Nginx Security Headers Setup:\nadd_header X-Frame-Options "DENY";\nadd_header X-Content-Type-Options "nosniff";\nadd_header Strict-Transport-Security "max-age=31536000; includeSubDomains";`;
    }
    return `// Recommended Remediation:\n// Enforce strict input validation, least-privilege permissions, and HTTPS TLS 1.3 encryption.`;
  };

  return (
    <div className="w-full h-full p-8 flex flex-col space-y-6 glass-panel rounded-2xl border border-border relative overflow-hidden">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Sparkles className="h-8 w-8 text-primary animate-pulse" />
            AI Reports & Threat Intelligence
          </h1>
          <p className="text-muted-foreground mt-1">
            Explore past security assessments with AI exploit reasoning, threat analysis & code patches
          </p>
        </div>
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/20 pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <HistoryIcon className="h-5 w-5 text-muted-foreground" />
            Assessment History ({scans.length})
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter by target..."
                className="pl-9"
              />
            </div>
            <Button variant="outline" size="icon" onClick={fetchHistory} title="Refresh">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="flex-1 p-0 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Shield className="h-12 w-12 text-muted-foreground mb-3 opacity-30" />
              <p className="text-muted-foreground text-sm">
                {searchQuery ? 'No scans match your search.' : 'No security reports yet. Run your first scan from the Dashboard.'}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader className="sticky top-0 bg-background/95 backdrop-blur z-10 shadow-sm">
                <TableRow>
                  <TableHead className="w-[280px]">Target Domain</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Risk Score</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody as={motion.tbody} variants={container} initial="hidden" animate="show">
                {filtered.map((scan) => {
                  const scoreInfo = riskScoreColor(scan.risk_score, scan.status);
                  return (
                    <TableRow key={scan.scan_id} as={motion.tr} variants={item} className="hover:bg-secondary/40 transition-colors">
                      <TableCell className="font-medium font-mono text-primary flex items-center gap-2">
                        <Shield className="h-4 w-4 text-primary shrink-0" />
                        {scan.target}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {formatTimestamp(scan.timestamp)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={scan.status === 'error' ? 'destructive' : 'outline'}
                          className={
                            scan.status === 'completed'
                              ? 'bg-emerald-500/10 text-emerald-500 border-none'
                              : scan.status === 'aborted'
                              ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                              : scan.status === 'error'
                              ? 'bg-destructive/10 text-destructive border-none'
                              : 'bg-amber-500/10 text-amber-400'
                          }
                        >
                          <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${
                            scan.status === 'completed'
                              ? 'bg-emerald-500'
                              : scan.status === 'aborted'
                              ? 'bg-rose-500'
                              : scan.status === 'error'
                              ? 'bg-destructive'
                              : 'bg-amber-500 animate-pulse'
                          }`} />
                          {scan.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold" style={{ color: scoreInfo.color }}>
                            {scan.status === 'aborted' ? 'Aborted' : scan.status === 'error' ? 'N/A' : `${scan.risk_score}/100`}
                          </span>
                          <span className="text-[10px] text-muted-foreground">({scoreInfo.label})</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end items-center gap-2">
                          {/* AI Security Report Button */}
                          <Button
                            variant="default"
                            size="sm"
                            className="h-8 gap-1.5 bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 font-semibold text-xs rounded-lg"
                            onClick={() => handleOpenAIReport(scan)}
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                            AI Report
                          </Button>

                          {/* View Dashboard Button */}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1 text-foreground hover:text-primary hover:bg-primary/10 rounded-lg text-xs"
                            onClick={() => handleViewDashboard(scan)}
                            title="View full results on Dashboard"
                          >
                            View Dashboard
                            <ExternalLink className="h-3 w-3" />
                          </Button>

                          {/* Delete Button */}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg"
                            onClick={() => handleDelete(scan.scan_id)}
                            title="Delete report"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* AI Threat Analysis & Report Modal */}
      <AnimatePresence>
        {selectedScanReport && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-4xl max-h-[85vh] bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            >
              {/* Modal Header */}
              <div className="p-6 border-b border-border flex items-center justify-between bg-secondary/30">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-primary/10 text-primary border border-primary/20">
                    <Sparkles className="h-6 w-6 animate-pulse" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                      AI Security Threat Report
                    </h2>
                    <p className="text-xs text-muted-foreground font-mono">
                      Target: <strong className="text-primary">{selectedScanReport.target}</strong> ({formatTimestamp(selectedScanReport.timestamp)})
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 gap-1.5 text-xs font-semibold"
                    onClick={() => handleDownloadReport(selectedScanReport.scan_id, 'pdf', selectedScanReport.target)}
                  >
                    <Download className="h-3.5 w-3.5 text-red-400" />
                    PDF
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 gap-1.5 text-xs font-semibold"
                    onClick={() => handleDownloadReport(selectedScanReport.scan_id, 'html', selectedScanReport.target)}
                  >
                    <Download className="h-3.5 w-3.5 text-blue-400" />
                    HTML
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 gap-1.5 text-xs font-semibold"
                    onClick={() => handleDownloadReport(selectedScanReport.scan_id, 'json', selectedScanReport.target)}
                  >
                    <Download className="h-3.5 w-3.5 text-amber-400" />
                    JSON
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 rounded-lg ml-2"
                    onClick={() => setSelectedScanReport(null)}
                  >
                    <X className="h-5 w-5" />
                  </Button>
                </div>
              </div>

              {/* Modal Body */}
              <div className="p-6 flex-1 overflow-y-auto space-y-6">
                {/* AI Executive Reasoning Card */}
                <div className="p-5 rounded-xl bg-primary/5 border border-primary/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-2">
                      <Sparkles className="h-4 w-4" />
                      AI Threat Chain & Exploit Reasoning
                    </span>
                    <Badge variant="outline" className="font-bold text-xs">
                      Risk Score: {selectedScanReport.status === 'aborted' ? 'Aborted' : selectedScanReport.status === 'error' ? 'N/A' : `${selectedScanReport.risk_score}/100`}
                    </Badge>
                  </div>
                  <p className="text-sm leading-relaxed text-foreground">
                    {buildAIReasoning(selectedScanReport.results, selectedScanReport.status)}
                  </p>
                </div>

                {/* Vulnerability & Code Patch Details */}
                <div className="space-y-4">
                  <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                    <Shield className="h-5 w-5 text-primary" />
                    Detected Findings & Concrete Patch Suggestions
                  </h3>

                  {selectedScanReport.status === 'aborted' ? (
                    <div className="p-6 rounded-xl bg-rose-500/10 border border-rose-500/20 text-center text-sm text-rose-300">
                      <AlertTriangle className="h-8 w-8 text-rose-400 mx-auto mb-2" />
                      This scan was aborted by the user before vulnerability testing could be completed.
                    </div>
                  ) : (!selectedScanReport.results?.vulnerabilities || selectedScanReport.results.vulnerabilities.length === 0) ? (
                    <div className="p-6 rounded-xl bg-card border border-border text-center text-sm text-muted-foreground">
                      <CheckCircle className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
                      No critical vulnerabilities detected on this target.
                    </div>
                  ) : (
                    selectedScanReport.results.vulnerabilities.map((v, i) => (
                      <div key={i} className="p-5 rounded-xl bg-card/80 border border-border space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-base text-foreground flex items-center gap-2">
                            <AlertTriangle className={`h-4 w-4 ${
                              v.severity === 'High' || v.severity === 'Critical' ? 'text-destructive' : 'text-amber-500'
                            }`} />
                            {v.type || 'Security Finding'}
                          </span>
                          <Badge className={
                            v.severity === 'Critical' ? 'bg-red-500 text-foreground' :
                            v.severity === 'High' ? 'bg-orange-500 text-foreground' : 'bg-amber-500 text-black'
                          }>
                            {v.severity || 'Medium'} Severity
                          </Badge>
                        </div>

                        <p className="text-xs text-muted-foreground">
                          {v.description || 'Automated check flagged security misconfiguration.'}
                        </p>

                        <div className="p-3 rounded-lg bg-secondary/50 border border-border/50 text-xs font-mono">
                          <span className="text-muted-foreground uppercase tracking-wider text-[10px] block mb-1">
                            Target Endpoint:
                          </span>
                          <span className="text-primary">{v.url || v.parameter || selectedScanReport.target}</span>
                        </div>

                        {/* Code / Config Patch Box */}
                        <div className="space-y-1.5 pt-2">
                          <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                            <Code className="h-4 w-4" />
                            Remediation & Code Patch Suggestion:
                          </span>
                          <pre className="p-4 rounded-xl bg-black/90 text-emerald-400 font-mono text-xs overflow-x-auto border border-emerald-500/20 leading-relaxed">
                            <code>{getPatchSnippet(v.type)}</code>
                          </pre>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-4 border-t border-border flex items-center justify-between bg-secondary/20">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleViewDashboard(selectedScanReport)}
                  className="gap-2 text-xs font-semibold"
                >
                  Inspect Full Dashboard
                  <ArrowRight className="h-4 w-4" />
                </Button>

                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setSelectedScanReport(null)}
                  className="text-xs font-semibold"
                >
                  Close Report
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

