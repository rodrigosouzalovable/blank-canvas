import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Copy, Check, Terminal, Download } from 'lucide-react';
import { toast } from 'sonner';
import SERVER_JS_CODE from '../../server.js?raw';

export function RoboCodeViewer() {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(SERVER_JS_CODE);
    setCopied(true);
    toast.success('Código copiado para a área de transferência!');
    setTimeout(() => setCopied(false), 3000);
  };

  const handleDownload = () => {
    const blob = new Blob([SERVER_JS_CODE], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'server.js';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Arquivo server.js baixado!');
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Terminal className="h-5 w-5" />
              Código do Robô (server.js)
            </CardTitle>
            <CardDescription className="mt-1">
              Copie este código e salve como <code className="bg-muted px-1 rounded">server.js</code> no seu computador
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download className="h-4 w-4 mr-1" /> Baixar
            </Button>
            <Button size="sm" onClick={handleCopy}>
              {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
              {copied ? 'Copiado!' : 'Copiar Código'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
          <p className="text-sm font-medium">📋 Instruções rápidas:</p>
          <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Copie ou baixe o código abaixo</li>
            <li>Salve como <code className="bg-muted px-1 rounded">server.js</code></li>
            <li>Execute: <code className="bg-muted px-1 rounded">npm install express playwright</code></li>
            <li>Execute: <code className="bg-muted px-1 rounded">npx playwright install chromium</code></li>
            <li>Inicie: <code className="bg-muted px-1 rounded">node server.js</code></li>
            <li>Configure o ngrok: <code className="bg-muted px-1 rounded">ngrok http 3001</code></li>
          </ol>
        </div>

        <ScrollArea className="h-[500px] rounded-md border bg-muted p-4">
          <pre className="text-xs text-primary font-mono whitespace-pre-wrap">{SERVER_JS_CODE}</pre>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
