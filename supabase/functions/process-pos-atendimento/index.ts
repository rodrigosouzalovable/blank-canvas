import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ClienteExtraido {
  nome: string;
  telefone: string;
  cpf: string;
  hora: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { texto, template } = await req.json();

    if (!texto) {
      return new Response(JSON.stringify({ error: 'Texto do painel não informado' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY não configurada');
    }

    const defaultTemplate = 'Olá {nome}, tudo bem? Você tem 50% de desconto aprovado na loja Novo Mundo para renegociar todas as parcelas. Posso te passar o valor?';
    const msgTemplate = template || defaultTemplate;

    const systemPrompt = `Você é um parser de logs de atendimento do sistema CobMais. 
Extraia TODOS os clientes listados no texto do painel "Pós Atendimento".

Cada registro de cliente geralmente segue este padrão:
- Hora << Chamada Desligada  
- Hora << Cliente: NOME COMPLETO
- Hora << CPF/CNPJ: 000.000.000-00
- Hora << Número discado: (XX) XXXXX-XXXX

Retorne APENAS um JSON array com os clientes encontrados. Cada objeto deve ter:
- nome: nome completo do cliente (capitalizado, ex: "Thiago Freitas Negrão")
- primeiro_nome: apenas o primeiro nome (ex: "Thiago")  
- telefone: número do telefone com DDD, apenas números (ex: "91986179457")
- cpf: CPF completo (ex: "006.125.142-93")
- hora: horário da chamada (ex: "08:25")

Se algum campo não estiver disponível, use string vazia.
Não inclua duplicatas (mesmo CPF).
Retorne SOMENTE o JSON array, sem markdown, sem explicações.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: texto },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit excedido, tente novamente em alguns segundos.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'Créditos insuficientes. Adicione créditos no workspace.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const errText = await response.text();
      console.error('AI gateway error:', response.status, errText);
      throw new Error('Erro ao processar com IA');
    }

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content || '[]';
    
    // Parse the JSON from AI response
    let clientes: any[] = [];
    try {
      // Remove markdown code blocks if present
      const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      clientes = JSON.parse(cleaned);
    } catch (e) {
      console.error('Failed to parse AI response:', content);
      // Try regex fallback
      clientes = [];
    }

    // Generate personalized messages
    const clientesComMensagem = clientes.map((c: any) => ({
      ...c,
      mensagem: msgTemplate
        .replace(/\{nome\}/gi, c.primeiro_nome || c.nome?.split(' ')[0] || 'Cliente')
        .replace(/\{nome_completo\}/gi, c.nome || 'Cliente')
        .replace(/\{telefone\}/gi, c.telefone || '')
        .replace(/\{cpf\}/gi, c.cpf || ''),
    }));

    console.log(`✅ Extraídos ${clientesComMensagem.length} clientes do Pós Atendimento`);

    return new Response(JSON.stringify({ 
      success: true, 
      clientes: clientesComMensagem,
      total: clientesComMensagem.length,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Erro process-pos-atendimento:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
