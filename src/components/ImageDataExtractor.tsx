import { useState, useRef, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Upload, Image, X, Sparkles, Loader2, Clipboard } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

export interface ExtractedData {
  cliente_nome: string | null;
  cliente_cpf: string | null;
  cliente_telefone: string | null;
  valor_total: number | null;
  parcelas: number | null;
  valor_parcela: number | null;
  data_primeiro_pagamento: string | null;
  dias_atraso: number | null;
}

interface ImageDataExtractorProps {
  onDataExtracted: (data: ExtractedData) => void;
}

export function ImageDataExtractor({ onDataExtracted }: ImageDataExtractorProps) {
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Processa arquivo de imagem e converte para base64
  const processImageFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      toast({
        variant: 'destructive',
        title: 'Arquivo inválido',
        description: 'Por favor, selecione uma imagem (PNG, JPG, etc.)',
      });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({
        variant: 'destructive',
        title: 'Imagem muito grande',
        description: 'O tamanho máximo permitido é 10MB.',
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setImagePreview(result);
    };
    reader.readAsDataURL(file);
  }, [toast]);

  // Handler para seleção de arquivo via input
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processImageFile(file);
    }
  };

  // Handler para drag and drop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processImageFile(file);
    }
  }, [processImageFile]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  // Handler para Ctrl+V (colar imagem da área de transferência)
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            processImageFile(file);
            toast({
              title: 'Imagem colada!',
              description: 'Imagem da área de transferência carregada.',
            });
            break;
          }
        }
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [processImageFile, toast]);

  // Limpar imagem
  const clearImage = () => {
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Extrair dados via IA
  const extractData = async () => {
    if (!imagePreview) {
      toast({
        variant: 'destructive',
        title: 'Nenhuma imagem',
        description: 'Por favor, adicione uma imagem primeiro.',
      });
      return;
    }

    setIsExtracting(true);

    try {
      const { data, error } = await supabase.functions.invoke('extract-acordo-data', {
        body: { image: imagePreview }
      });

      if (error) {
        // Tratar erros específicos
        if (error.message?.includes('429') || error.message?.includes('rate')) {
          toast({
            variant: 'destructive',
            title: 'Limite de requisições',
            description: 'Muitas requisições. Aguarde alguns segundos e tente novamente.',
          });
        } else if (error.message?.includes('402') || error.message?.includes('créditos')) {
          toast({
            variant: 'destructive',
            title: 'Créditos insuficientes',
            description: 'Adicione créditos à sua conta para continuar usando a IA.',
          });
        } else {
          throw error;
        }
        return;
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      if (!data?.success || !data?.data) {
        throw new Error('Não foi possível extrair dados da imagem');
      }

      toast({
        title: 'Dados extraídos com sucesso!',
        description: 'Revise as informações antes de salvar o acordo.',
      });

      onDataExtracted(data.data);

    } catch (error) {
      console.error('Erro na extração:', error);
      toast({
        variant: 'destructive',
        title: 'Erro na extração',
        description: error instanceof Error ? error.message : 'Não foi possível extrair os dados da imagem. Tente uma imagem mais clara.',
      });
    } finally {
      setIsExtracting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          Preencher com IA
        </CardTitle>
        <CardDescription>
          Cole um print de tela (Ctrl+V) ou arraste uma imagem do sistema de cobrança para extrair os dados automaticamente.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Área de Upload */}
        {!imagePreview ? (
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              isDragOver 
                ? 'border-primary bg-primary/5' 
                : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50'
            }`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileSelect}
            />
            <div className="flex flex-col items-center gap-3">
              <div className="p-4 rounded-full bg-muted">
                <Upload className="h-8 w-8 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium">Arraste uma imagem ou clique para selecionar</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Também aceita <kbd className="px-1.5 py-0.5 rounded bg-muted text-xs">Ctrl+V</kbd> para colar prints
                </p>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clipboard className="h-4 w-4" />
                <span>PNG, JPG, WEBP - máx. 10MB</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Preview da imagem */}
            <div className="relative rounded-lg overflow-hidden border bg-muted/20">
              <img
                src={imagePreview}
                alt="Preview do print"
                className="w-full max-h-[400px] object-contain"
              />
              <Button
                variant="destructive"
                size="icon"
                className="absolute top-2 right-2"
                onClick={clearImage}
                disabled={isExtracting}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Botão de extração */}
            <Button
              className="w-full"
              size="lg"
              onClick={extractData}
              disabled={isExtracting}
            >
              {isExtracting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Extraindo dados com IA...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Extrair Dados com IA
                </>
              )}
            </Button>
          </div>
        )}

        {/* Dica */}
        <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-md">
          <p className="font-medium mb-1">💡 Dica:</p>
          <p>
            A IA irá extrair automaticamente: nome do cliente, CPF, telefone, valor total, 
            número de parcelas, valor das parcelas, data do primeiro pagamento e dias em atraso.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
