import { useState } from 'react';
import { Search, Plus, Globe, Activity, Clock, ShieldAlert, User, Scan, Edit, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';

export default function Websites() {
  const [websites] = useState([
    { id: 1, url: 'example.com', status: 'Healthy', lastScan: '2 hours ago', risk: 'Low', ip: '93.184.216.34' },
    { id: 2, url: 'test.vulnweb.com', status: 'Vulnerable', lastScan: '1 day ago', risk: 'High', ip: '176.28.50.165' },
    { id: 3, url: 'scanme.nmap.org', status: 'Warning', lastScan: '5 hours ago', risk: 'Medium', ip: '45.33.32.156' },
    { id: 4, url: 'demo.testfire.net', status: 'Vulnerable', lastScan: '3 days ago', risk: 'Critical', ip: '65.61.137.117' },
  ]);

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
  };

  const getRiskBadge = (risk) => {
    switch (risk) {
      case 'Low': return <Badge className="bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 shadow-none border-none">Low</Badge>;
      case 'Medium': return <Badge className="bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 shadow-none border-none">Medium</Badge>;
      case 'High': return <Badge className="bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 shadow-none border-none">High</Badge>;
      case 'Critical': return <Badge variant="destructive" className="shadow-none">Critical</Badge>;
      default: return <Badge variant="outline">{risk}</Badge>;
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'Healthy': return <Activity className="h-4 w-4 text-emerald-500" />;
      case 'Warning': return <Activity className="h-4 w-4 text-amber-500" />;
      case 'Vulnerable': return <ShieldAlert className="h-4 w-4 text-rose-500" />;
      default: return <Globe className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="w-full h-full p-8 flex flex-col space-y-6">
      <div className="flex justify-between items-center shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Websites</h1>
          <p className="text-muted-foreground mt-1">Manage and monitor your target assets</p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          New Target
        </Button>
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/20 pb-4">
          <CardTitle className="text-lg">Monitored Assets</CardTitle>
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search targets..." className="pl-9" />
          </div>
        </CardHeader>
        <CardContent className="flex-1 p-0 overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-background/95 backdrop-blur z-10 shadow-sm">
              <TableRow>
                <TableHead className="w-[300px]">Target URL</TableHead>
                <TableHead>IP Address</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Risk Level</TableHead>
                <TableHead>Last Scan</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody as={motion.tbody} variants={container} initial="hidden" animate="show">
              {websites.map((site) => (
                <TableRow key={site.id} as={motion.tr} variants={item}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20 shrink-0">
                        <Globe className="h-5 w-5 text-primary" />
                      </div>
                      {site.url}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">{site.ip}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {getStatusIcon(site.status)}
                      <span className="text-sm">{site.status}</span>
                    </div>
                  </TableCell>
                  <TableCell>{getRiskBadge(site.risk)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span className="text-xs">{site.lastScan}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1 text-muted-foreground">
                      <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-foreground"><User className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-primary"><Scan className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-foreground"><Edit className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
        <div className="border-t border-border p-4 flex items-center justify-end bg-muted/10">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="h-8 w-8" disabled><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="default" size="icon" className="h-8 w-8">1</Button>
            <Button variant="outline" size="icon" className="h-8 w-8">2</Button>
            <Button variant="outline" size="icon" className="h-8 w-8">3</Button>
            <Button variant="outline" size="icon" className="h-8 w-8"><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
