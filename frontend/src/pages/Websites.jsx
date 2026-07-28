import { useState } from 'react';
import { Search, Plus, Filter, Download, MoreVertical, CheckCircle2 } from 'lucide-react';
import { motion } from 'framer-motion';

export default function Websites() {
  const [websites] = useState([
    { id: 1, domain: 'app.example.com', status: 'Active', scanDate: '2 hours ago', vulns: { critical: 2, high: 5, medium: 12, low: 24 } },
    { id: 2, domain: 'api.example.com', status: 'Inactive', scanDate: '1 day ago', vulns: { critical: 0, high: 2, medium: 8, low: 15 } },
    { id: 3, domain: 'portal.example.com', status: 'Active', scanDate: '2 days ago', vulns: { critical: 5, high: 12, medium: 34, low: 89 } },
    { id: 4, domain: 'dev.example.com', status: 'Inactive', scanDate: '5 days ago', vulns: { critical: 0, high: 0, medium: 3, low: 12 } },
    { id: 5, domain: 'test.example.com', status: 'Active', scanDate: '1 week ago', vulns: { critical: 1, high: 4, medium: 15, low: 42 } },
  ]);

  const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.1 } }
  };

  const item = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
  };

  return (
    <div className="w-full h-full p-8 md:p-12 flex flex-col space-y-8 glass-panel rounded-2xl border border-white/10 relative overflow-hidden">
      <div className="flex justify-between items-start shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Websites Interfaces</h1>
          <p className="text-muted-foreground mt-1">Welcome back, user</p>
        </div>
        <button className="bg-primary hover:bg-primary/90 text-primary-foreground px-5 py-2.5 rounded-lg flex items-center gap-2 font-medium transition-all shadow-sm hover:scale-105 animate-pulse-glow">
          <Plus className="h-5 w-5" />
          Add Website
        </button>
      </div>

      <div className="flex-1 bg-card rounded-xl shadow-sm border border-border flex flex-col overflow-hidden">
        {/* Table Toolbar */}
        <div className="p-4 border-b border-border flex flex-wrap items-center justify-between gap-4 bg-card">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input 
                type="text" 
                placeholder="Search..." 
                className="pl-9 pr-4 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 w-64 bg-input text-foreground"
              />
            </div>
            <select className="border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 appearance-none bg-input">
              <option>Status: All</option>
              <option>Active</option>
              <option>Inactive</option>
            </select>
            <button className="p-2 border border-border rounded-lg text-muted-foreground hover:bg-secondary transition-colors bg-card">
              <Filter className="h-4 w-4" />
            </button>
          </div>
          
          <button className="flex items-center gap-2 text-sm text-foreground border border-border px-4 py-2 rounded-lg hover:bg-secondary transition-colors bg-card">
            <Download className="h-4 w-4" />
            Export
          </button>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto bg-card">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead className="bg-secondary/50 sticky top-0 z-10">
              <tr>
                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Domain</th>
                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Scan Date</th>
                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Vulnerabilities</th>
                <th className="px-6 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <motion.tbody 
              className="divide-y divide-border bg-card"
              variants={container}
              initial="hidden"
              animate="show"
            >
              {websites.map((site) => (
                <motion.tr key={site.id} variants={item} className="hover:bg-secondary/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                      <span className="font-medium text-foreground">{site.domain}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      site.status === 'Active' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-muted text-muted-foreground'
                    }`}>
                      {site.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">
                    {site.scanDate}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1.5">
                      <div className="flex items-center justify-center w-7 h-7 rounded bg-red-500/10 text-red-500 text-xs font-bold">{site.vulns.critical}</div>
                      <div className="flex items-center justify-center w-7 h-7 rounded bg-orange-500/10 text-orange-500 text-xs font-bold">{site.vulns.high}</div>
                      <div className="flex items-center justify-center w-7 h-7 rounded bg-yellow-500/10 text-yellow-500 text-xs font-bold">{site.vulns.medium}</div>
                      <div className="flex items-center justify-center w-7 h-7 rounded bg-blue-500/10 text-blue-500 text-xs font-bold">{site.vulns.low}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button className="text-muted-foreground hover:text-foreground transition-colors p-2 rounded-md hover:bg-secondary">
                      <MoreVertical className="h-5 w-5" />
                    </button>
                  </td>
                </motion.tr>
              ))}
            </motion.tbody>
          </table>
        </div>
        
        {/* Pagination placeholder */}
        <div className="p-4 border-t border-border flex items-center justify-between text-sm text-muted-foreground bg-card">
          <span>Showing 1 to 5 of 12 entries</span>
          <div className="flex items-center gap-1">
            <button className="px-3 py-1 border border-border rounded hover:bg-secondary disabled:opacity-50">Prev</button>
            <button className="px-3 py-1 border border-primary rounded bg-primary text-primary-foreground">1</button>
            <button className="px-3 py-1 border border-border rounded hover:bg-secondary">2</button>
            <button className="px-3 py-1 border border-border rounded hover:bg-secondary">3</button>
            <button className="px-3 py-1 border border-border rounded hover:bg-secondary">Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}
