import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { History as HistoryIcon, Search, Shield, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';
import { getScanHistory } from '../api/client';
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

  return (
    <div className="w-full h-full p-8 flex flex-col space-y-6 glass-panel rounded-2xl border border-white/10 relative overflow-hidden">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Scan History</h1>
          <p className="text-muted-foreground mt-1">Review past vulnerability assessments</p>
        </div>
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/20 pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <HistoryIcon className="h-5 w-5 text-muted-foreground" />
            History Log ({scans.length})
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
                {searchQuery ? 'No scans match your search.' : 'No scans yet. Run your first scan from the Dashboard.'}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader className="sticky top-0 bg-background/95 backdrop-blur z-10 shadow-sm">
                <TableRow>
                  <TableHead className="w-[300px]">Target</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Risk Score</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody as={motion.tbody} variants={container} initial="hidden" animate="show">
                {filtered.map((scan) => {
                  const scoreInfo = riskScoreColor(scan.risk_score);
                  return (
                    <TableRow key={scan.scan_id} as={motion.tr} variants={item}>
                      <TableCell className="font-medium font-mono text-primary">
                        {scan.target}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {formatTimestamp(scan.timestamp)}
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={scan.status === 'error' ? 'destructive' : 'outline'}
                          className={scan.status === 'completed' ? 'bg-emerald-500/10 text-emerald-500 border-none hover:bg-emerald-500/20' : ''}
                        >
                          <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${
                            scan.status === 'completed' ? 'bg-emerald-500' : scan.status === 'error' ? 'bg-destructive' : 'bg-amber-500 animate-pulse'
                          }`} />
                          {scan.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold" style={{ color: scoreInfo.color }}>
                            {scan.risk_score}/100
                          </span>
                          <span className="text-[10px] text-muted-foreground">({scoreInfo.label})</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1 text-primary hover:text-primary hover:bg-primary/10"
                          onClick={() => navigate(`/?scan=${scan.scan_id}`)}
                        >
                          View
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
