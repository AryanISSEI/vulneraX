const severityOrder = ['critical', 'high', 'medium', 'low'];

export function getSeverityCounts(vulnerabilities = []) {
  return severityOrder.reduce((counts, severity) => {
    counts[severity] = vulnerabilities.filter((item) => item.severity?.toLowerCase() === severity).length;
    return counts;
  }, {});
}

export function getRiskSummary(score = 0) {
  if (score >= 80) return { label: 'High Exposure', tone: 'critical' };
  if (score >= 50) return { label: 'Moderate Exposure', tone: 'warning' };
  return { label: 'Low Exposure', tone: 'healthy' };
}

export function getLiveSteps(currentPhase = '', status = 'idle') {
  const steps = ['Network Recon (Nmap)', 'Web Crawl & Audit', 'AI Threat Synthesis', 'Report Generation'];
  const activeIndex = Math.max(
    0,
    steps.findIndex((step) => currentPhase.toLowerCase().includes(step.toLowerCase().split(' ')[0].toLowerCase()))
  );

  return steps.map((label, index) => ({
    label,
    state: status === 'completed' ? 'complete' : index < activeIndex ? 'complete' : index === activeIndex ? 'running' : 'queued',
  }));
}

export function getAiInsights(scanResult = null) {
  if (!scanResult) {
    return [
      'Awaiting assessment data to generate threat predictions.',
      'Predicted attack paths will appear after the first completed scan.',
    ];
  }

  return [
    `Target ${scanResult.target || 'asset'} shows concentrated exposure around web-facing services.`,
    'Prioritize internet-exposed services and weak transport security first.',
    'Use the generated report to confirm remediation order for critical issues.',
  ];
}
