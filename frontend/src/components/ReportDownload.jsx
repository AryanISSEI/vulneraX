import { FileJson, FileText, FileDown, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { getReport } from '../api/client';

export default function ReportDownload({ scanId }) {
  const [loading, setLoading] = useState('');

  if (!scanId) return null;

  const handleDownload = async (format) => {
    setLoading(format);
    try {
      const response = await getReport(scanId, format);

      if (format === 'json') {
        const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
        downloadBlob(blob, `VulneraX-report-${scanId.slice(0, 8)}.json`);
      } else {
        const blob = response.data;
        const ext = format === 'pdf' ? 'pdf' : 'html';
        const mimeType = format === 'pdf' ? 'application/pdf' : 'text/html';
        downloadBlob(new Blob([blob], { type: mimeType }), `VulneraX-report-${scanId.slice(0, 8)}.${ext}`);
      }
    } catch (err) {
      console.error(`Failed to download ${format} report:`, err);
    } finally {
      setLoading('');
    }
  };

  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const buttons = [
    { format: 'json', label: 'JSON', icon: FileJson, color: 'text-accent-emerald', bg: 'bg-accent-emerald/10 hover:bg-accent-emerald/20' },
    { format: 'html', label: 'HTML', icon: FileText, color: 'text-accent-cyan', bg: 'bg-accent-cyan/10 hover:bg-accent-cyan/20' },
    { format: 'pdf', label: 'PDF', icon: FileDown, color: 'text-accent-primary', bg: 'bg-accent-primary/10 hover:bg-accent-primary/20' },
  ];

  return (
    <div className="glass-panel p-6 sm:p-8 animate-fade-in">
      <h3 className="font-semibold text-text-primary mb-4">Download Report</h3>
      <div className="flex flex-wrap gap-3">
        {buttons.map(({ format, label, icon: Icon, color, bg }) => (
          <button
            key={format}
            id={`download-${format}-button`}
            onClick={() => handleDownload(format)}
            disabled={!!loading}
            className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium ${color} ${bg} border border-transparent hover:border-border-glow transition-all disabled:opacity-50`}
          >
            {loading === format ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Icon className="h-4 w-4" />
            )}
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
