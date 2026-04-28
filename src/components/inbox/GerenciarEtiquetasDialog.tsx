import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Trash2, Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const CORES_DISPONIVEIS = [
  '#25D366', '#FF6B6B', '#4ECDC4', '#FFD93D',
  '#6C5CE7', '#FF8A5C', '#EA4C89', '#00B4D8',
];

interface Etiqueta {
  id: string;
  nome: string;
  cor: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  etiquetas: Etiqueta[];
  onEtiquetasChange: () => void;
}

export function GerenciarEtiquetasDialog({ open, onOpenChange, etiquetas, onEtiquetasChange }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [novoNome, setNovoNome] = useState('');
  const [novaCor, setNovaCor] = useState(CORES_DISPONIVEIS[0]);

  const handleCriar = async () => {
    if (!novoNome.trim() || !user) return;
    const { error } = await supabase.from('whatsapp_etiquetas').insert({
      user_id: user.id,
      nome: novoNome.trim(),
      cor: novaCor,
    });
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      return;
    }
    setNovoNome('');
    setNovaCor(CORES_DISPONIVEIS[0]);
    onEtiquetasChange();
  };

  const handleExcluir = async (id: string) => {
    await supabase.from('whatsapp_etiquetas').delete().eq('id', id);
    onEtiquetasChange();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Gerenciar Etiquetas</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Input
              placeholder="Nome da etiqueta..."
              value={novoNome}
              onChange={e => setNovoNome(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCriar()}
            />
            <div className="flex items-center gap-1.5 flex-wrap">
              {CORES_DISPONIVEIS.map(cor => (
                <button
                  key={cor}
                  onClick={() => setNovaCor(cor)}
                  className="h-6 w-6 rounded-full border-2 transition-transform"
                  style={{
                    backgroundColor: cor,
                    borderColor: novaCor === cor ? 'hsl(var(--foreground))' : 'transparent',
                    transform: novaCor === cor ? 'scale(1.2)' : 'scale(1)',
                  }}
                />
              ))}
            </div>
            <Button size="sm" onClick={handleCriar} disabled={!novoNome.trim()} className="w-full">
              <Plus className="h-4 w-4 mr-1" /> Criar Etiqueta
            </Button>
          </div>

          {etiquetas.length > 0 && (
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {etiquetas.map(et => (
                <div key={et.id} className="flex items-center justify-between gap-2 p-2 rounded-md bg-accent/30">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="h-3.5 w-3.5 rounded-full shrink-0" style={{ backgroundColor: et.cor }} />
                    <span className="text-sm truncate">{et.nome}</span>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => handleExcluir(et.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
