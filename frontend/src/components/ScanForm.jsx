import { useState } from 'react';
import { Target, Search, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent } from './ui/card';

export default function ScanForm({ onScan, isScanning }) {
  const [target, setTarget] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (target.trim() && !isScanning) {
      onScan(target.trim());
    }
  };

  return (
    <Card className="bg-muted/10 border-border">
      <CardContent className="p-6">
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Target className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              type="text"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="Enter domain or IP address (e.g., example.com)"
              className="pl-11 h-12 text-base bg-background"
              disabled={isScanning}
            />
          </div>
          <Button 
            type="submit" 
            disabled={!target.trim() || isScanning}
            className={`h-12 px-8 ${!isScanning && target.trim() ? 'animate-pulse-glow' : ''}`}
          >
            {isScanning ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Scanning...
              </>
            ) : (
              <>
                <Search className="mr-2 h-5 w-5" />
                Start Scan
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
