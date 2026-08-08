/**
 * Map severity level to a color class / hex
 */
export const severityColor = (severity) => {
  const map = {
    critical: { bg: 'bg-severity-critical/15', text: 'text-severity-critical', hex: '#ef4444', border: 'border-severity-critical/30' },
    high:     { bg: 'bg-severity-high/15',     text: 'text-severity-high',     hex: '#f97316', border: 'border-severity-high/30' },
    medium:   { bg: 'bg-severity-medium/15',   text: 'text-severity-medium',   hex: '#eab308', border: 'border-severity-medium/30' },
    low:      { bg: 'bg-severity-low/15',      text: 'text-severity-low',      hex: '#3b82f6', border: 'border-severity-low/30' },
    info:     { bg: 'bg-severity-info/15',      text: 'text-severity-info',     hex: '#6b7280', border: 'border-severity-info/30' },
  };
  return map[severity?.toLowerCase()] || map.info;
};

/**
 * Map header status to color
 */
export const headerStatusColor = (present, isWeak) => {
  if (!present) return { label: 'Missing', color: 'text-status-missing', icon: '✕', bg: 'bg-status-missing/10' };
  if (isWeak) return { label: 'Weak', color: 'text-status-weak', icon: '⚠', bg: 'bg-status-weak/10' };
  return { label: 'Present', color: 'text-status-present', icon: '✓', bg: 'bg-status-present/10' };
};

/**
 * Risk score to color gradient
 */
export const riskScoreColor = (score, status) => {
  if (status === 'running' || status === 'pending') {
    return { color: '#f59e0b', label: 'Scan in Progress' };
  }
  if (status === 'aborted') {
    return { color: '#f43f5e', label: 'Aborted' };
  }
  if (status === 'error') {
    return { color: '#ef4444', label: 'Error' };
  }
  if (score >= 80) return { color: '#34d399', label: 'Excellent' };
  if (score >= 60) return { color: '#3b82f6', label: 'Good' };
  if (score >= 40) return { color: '#eab308', label: 'Fair' };
  if (score >= 20) return { color: '#f97316', label: 'Poor' };
  return { color: '#ef4444', label: 'Critical' };
};

/**
 * Format a timestamp string
 */
export const formatTimestamp = (ts) => {
  if (!ts) return '—';
  try {
    const d = new Date(ts);
    return d.toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return ts;
  }
};

/**
 * Truncate a string
 */
export const truncate = (str, maxLen = 60) => {
  if (!str) return '';
  return str.length > maxLen ? str.substring(0, maxLen) + '…' : str;
};

/**
 * Severity ordering for sorting
 */
export const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

/**
 * Count vulnerabilities by severity
 */
export const countBySeverity = (vulns) => {
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  (vulns || []).forEach((v) => {
    const key = v.severity?.toLowerCase();
    if (key in counts) counts[key]++;
  });
  return counts;
};
