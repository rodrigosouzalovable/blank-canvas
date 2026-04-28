import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface EditTelefoneData {
  id: string;
  numero: string;
  tipo: string;
  is_contato: boolean;
  is_whatsapp: boolean;
  ativo: boolean;
  autorizado: boolean;
  observacao: string | null;
  ramal: string | null;
}

interface TelefoneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cpfNormalizado: string;
  userId: string;
  onSaved: () => void;
  initialNumero?: string;
  editData?: EditTelefoneData | null;
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits.length ? `(${digits}` : '';
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function TelefoneDialog({ open, onOpenChange, cpfNormalizado, userId, onSaved, initialNumero, editData }: TelefoneDialogProps) {
  const [numero, setNumero] = useState('');
  const prevOpenRef = useRef(false);
  
  const [tipo, setTipo] = useState('celular');
  const [isContato, setIsContato] = useState('nao');
  const [isWhatsapp, setIsWhatsapp] = useState('nao');
  const [ativo, setAtivo] = useState('sim');
  const [autorizado, setAutorizado] = useState('sim');
  const [observacao, setObservacao] = useState('');
  const [ramal, setRamal] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && !prevOpenRef.current) {
      if (editData) {
        setNumero(formatPhone(editData.numero));
        setTipo(editData.tipo);
        setIsContato(editData.is_contato ? 'sim' : 'nao');
        setIsWhatsapp(editData.is_whatsapp ? 'sim' : 'nao');
        setAtivo(editData.ativo ? 'sim' : 'nao');
        setAutorizado(editData.autorizado ? 'sim' : 'nao');
        setObservacao(editData.observacao || '');
        setRamal(editData.ramal || '');
      } else if (initialNumero) {
        setNumero(formatPhone(initialNumero));
      }
    }
    prevOpenRef.current = open;
  }, [open, initialNumero, editData]);

  const isEditing = !!editData;

  const reset = () => {
    setNumero(''); setTipo('celular'); setIsContato('nao'); setIsWhatsapp('nao');
    setAtivo('sim'); setAutorizado('sim'); setObservacao(''); setRamal('');
  };

  const handleSave = async () => {
    if (!numero.replace(/\D/g, '')) {
      toast.error('Informe o número do telefone');
      return;
    }
    setSaving(true);

    const payload = {
      numero,
      tipo,
      is_contato: isContato === 'sim',
      is_whatsapp: isWhatsapp === 'sim',
      ativo: ativo === 'sim',
      autorizado: autorizado === 'sim',
      observacao: observacao || null,
      ramal: ramal || null,
    };

    let error;
    if (isEditing && editData) {
      ({ error } = await supabase.from('devedor_telefones' as any).update(payload as any).eq('id', editData.id));
    } else {
      ({ error } = await supabase.from('devedor_telefones' as any).insert({
        ...payload,
        devedor_cpf: cpfNormalizado,
        criado_por: userId,
      } as any));
    }

    if (error) {
      toast.error('Erro ao salvar telefone: ' + error.message);
    } else {
      toast.success(isEditing ? 'Telefone atualizado com sucesso!' : 'Telefone cadastrado com sucesso!');
      reset();
      onSaved();
      onOpenChange(false);
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar Telefone' : 'Novo Telefone'}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 py-2">
          <div className="space-y-2">
            <Label>Telefone</Label>
            <Input
              placeholder="(00) 00000-0000"
              value={numero}
              onChange={(e) => setNumero(formatPhone(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label>Tel. de Contato</Label>
            <RadioGroup value={isContato} onValueChange={setIsContato} className="flex gap-4 pt-1">
              <div className="flex items-center gap-1"><RadioGroupItem value="sim" id="contato-sim" /><Label htmlFor="contato-sim" className="font-normal">Sim</Label></div>
              <div className="flex items-center gap-1"><RadioGroupItem value="nao" id="contato-nao" /><Label htmlFor="contato-nao" className="font-normal">Não</Label></div>
            </RadioGroup>
          </div>
          <div className="space-y-2">
            <Label>Ativo</Label>
            <RadioGroup value={ativo} onValueChange={setAtivo} className="flex gap-4 pt-1">
              <div className="flex items-center gap-1"><RadioGroupItem value="sim" id="ativo-sim" /><Label htmlFor="ativo-sim" className="font-normal">Sim</Label></div>
              <div className="flex items-center gap-1"><RadioGroupItem value="nao" id="ativo-nao" /><Label htmlFor="ativo-nao" className="font-normal">Não</Label></div>
            </RadioGroup>
          </div>
          <div className="space-y-2">
            <Label>Tipo de Telefone</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="celular">Celular</SelectItem>
                <SelectItem value="comercial">Comercial</SelectItem>
                <SelectItem value="residencial">Residencial</SelectItem>
                <SelectItem value="outro">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Whatsapp</Label>
            <RadioGroup value={isWhatsapp} onValueChange={setIsWhatsapp} className="flex gap-4 pt-1">
              <div className="flex items-center gap-1"><RadioGroupItem value="sim" id="whats-sim" /><Label htmlFor="whats-sim" className="font-normal">Sim</Label></div>
              <div className="flex items-center gap-1"><RadioGroupItem value="nao" id="whats-nao" /><Label htmlFor="whats-nao" className="font-normal">Não</Label></div>
            </RadioGroup>
          </div>
          <div className="space-y-2">
            <Label>Autorizado</Label>
            <RadioGroup value={autorizado} onValueChange={setAutorizado} className="flex gap-4 pt-1">
              <div className="flex items-center gap-1"><RadioGroupItem value="sim" id="auto-sim" /><Label htmlFor="auto-sim" className="font-normal">Sim</Label></div>
              <div className="flex items-center gap-1"><RadioGroupItem value="nao" id="auto-nao" /><Label htmlFor="auto-nao" className="font-normal">Não</Label></div>
            </RadioGroup>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Observação</Label>
            <Textarea placeholder="Observação..." value={observacao} onChange={(e) => setObservacao(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Ramal</Label>
            <Input placeholder="Ramal" value={ramal} onChange={(e) => setRamal(e.target.value)} />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
