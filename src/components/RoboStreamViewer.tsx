import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Monitor, Play, Square, Wifi, WifiOff, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';

interface RoboStreamViewerProps {
  serverUrl: string;
  roboOnline: boolean;
}

interface AutomationLog {
  status: string;
  mensagem: string;
  timestamp: string;
}

export function RoboStreamViewer({ serverUrl, roboOnline }: RoboStreamViewerProps) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [currentFrame, setCurrentFrame] = useState('');
  const [currentUrl, setCurrentUrl] = useState('');
  const [currentStatus, setCurrentStatus] = useState('');
  const [logs, setLogs] = useState<AutomationLog[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const failCountRef = useRef(0);

  const fetchScreenshot = useCallback(async () => {
    if (!serverUrl) return;
    try {
      const url = serverUrl.replace(/\/$/, '');
      const res = await fetch(`${url}/screenshot`, { signal: AbortSignal.timeout(5000), headers: { 'ngrok-skip-browser-warning': 'true' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      setCurrentFrame(data.image || '');
      setCurrentUrl(data.url || '');
      setIsConnected(true);
      failCountRef.current = 0;

      if (data.status && data.status !== currentStatus) {
        setCurrentStatus(data.status);
        setLogs(prev => [
          ...prev.slice(-19),
          { status: data.status, mensagem: data.mensagem || data.status, timestamp: new Date().toLocaleTimeString() },
        ]);
      }
    } catch {
      failCountRef.current++;
      if (failCountRef.current >= 3) {
        setIsConnected(false);
      }
    }
  }, [serverUrl, currentStatus]);

  useEffect(() => {
    if (isStreaming && serverUrl) {
      fetchScreenshot();
      intervalRef.current = setInterval(fetchScreenshot, 1000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isStreaming, serverUrl, fetchScreenshot]);

  useEffect(() => {
    if (!roboOnline) {
      setIsStreaming(false);
      setIsConnected(false);
      setCurrentFrame('');
    }
  }, [roboOnline]);

  const toggleStream = () => setIsStreaming(prev => !prev);

  const statusIcon = (s: string) => {
    if (s === 'erro') return <AlertCircle className="h-4 w-4" />;
    if (s === 'sucesso') return <CheckCircle className="h-4 w-4" />;
    return <Loader2 className="h-4 w-4 animate-spin" />;
  };

  const statusVariant = (s: string): 'default' | 'destructive' | 'secondary' => {
    if (s === 'erro') return 'destructive';
    if (s === 'sucesso') return 'default';
    return 'secondary';
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Monitor className="h-5 w-5" />
            Streaming do Robô
          </CardTitle>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              {isConnected ? (
                <Wifi className="h-4 w-4 text-green-500" />
              ) : (
                <WifiOff className="h-4 w-4 text-destructive" />
              )}
              <span className="text-sm text-muted-foreground">
                {isConnected ? 'Conectado' : 'Desconectado'}
              </span>
            </div>
            <Button
              variant={isStreaming ? 'destructive' : 'default'}
              size="sm"
              onClick={toggleStream}
              disabled={!roboOnline || !serverUrl}
            >
              {isStreaming ? <Square className="h-4 w-4 mr-1" /> : <Play className="h-4 w-4 mr-1" />}
              {isStreaming ? 'Parar' : 'Iniciar'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Video area */}
        <div className="relative bg-muted rounded-lg overflow-hidden" style={{ aspectRatio: '16/9' }}>
          {currentFrame ? (
            <img
              src={currentFrame}
              alt="Streaming do Robô"
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
              <div className="text-center space-y-2">
                <Monitor className="h-16 w-16 mx-auto opacity-50" />
                <p className="text-sm">
                  {!roboOnline
                    ? 'Robô offline — inicie o servidor local'
                    : !isStreaming
                      ? 'Clique em "Iniciar" para ver o streaming'
                      : 'Aguardando streaming...'}
                </p>
              </div>
            </div>
          )}

          {/* Status overlay */}
          {currentStatus && isStreaming && (
            <div className="absolute top-3 left-3 right-3">
              <Badge variant={statusVariant(currentStatus)} className="text-xs px-3 py-1">
                {statusIcon(currentStatus)}
                <span className="ml-1">{currentStatus}</span>
              </Badge>
            </div>
          )}

          {/* URL bar */}
          {currentUrl && isStreaming && (
            <div className="absolute bottom-0 left-0 right-0 bg-background/80 backdrop-blur px-3 py-1.5">
              <p className="text-xs text-muted-foreground truncate font-mono">{currentUrl}</p>
            </div>
          )}
        </div>

        {/* Logs */}
        {logs.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2">Logs da Automação</h4>
            <ScrollArea className="h-32 rounded-md border p-2 bg-muted">
              <div className="space-y-1">
                {logs.map((log, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground shrink-0">{log.timestamp}</span>
                    <Badge variant={statusVariant(log.status)} className="text-[10px] px-1.5 py-0">
                      {log.status}
                    </Badge>
                    <span className="truncate">{log.mensagem}</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
