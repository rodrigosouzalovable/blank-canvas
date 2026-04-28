import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { descricaoAcordo, clienteNome, clienteCpf, credor, valorTotal, contratos } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const credoresJuridicos: Record<string, string> = {
      'MONTREAL': 'MONTREAL - MONTADORA DE MÓVEIS E ELETRO-DOMÉSTICOS LTDA., pessoa jurídica de direito privado, inscrita no CNPJ nº 07.019.882/0001-86, com sede na Av. Eurípedes de Menezes, qd. 04, lts. 01/13 e 28/36, Setor Parque Industrial, CEP: 74.993-540, na cidade de Aparecida de Goiânia-GO, neste ato representada na forma de seus atos constitutivos.',
    };

    const credorNormalizado = (credor || '').toUpperCase().trim();
    const credorCompleto = credoresJuridicos[credorNormalizado] || credor || 'Não informado';
    const isMontreal = credorNormalizado === 'MONTREAL';

    let systemPrompt: string;
    let userPrompt: string;

    if (isMontreal) {
      systemPrompt = `Você é um advogado brasileiro com mais de 20 anos de experiência em direito civil e empresarial. Você gera termos de acordo extrajudicial seguindo um modelo fixo e padronizado para a Montreal.

INSTRUÇÕES CRÍTICAS:
- Siga EXATAMENTE a estrutura de cláusulas abaixo, SEM adicionar nem remover cláusulas
- NÃO mencione inteligência artificial em nenhum momento
- Retorne APENAS o texto puro do termo, sem formatação markdown (sem **, ##, etc.)
- Use numeração por extenso (PRIMEIRA, SEGUNDA, etc.)
- Inclua espaços para assinatura ao final
- Use a data atual para o termo
- Adapte os dados do devedor e do acordo conforme fornecido`;

      userPrompt = `Gere um INSTRUMENTO PARTICULAR DE ACORDO EXTRAJUDICIAL E DE RECONHECIMENTO, CONFISSÃO E PARCELAMENTO DE DÍVIDA seguindo EXATAMENTE esta estrutura:

TÍTULO: INSTRUMENTO PARTICULAR DE ACORDO EXTRAJUDICIAL E DE RECONHECIMENTO, CONFISSÃO E PARCELAMENTO DE DÍVIDA

"Pelo presente instrumento particular, as partes abaixo qualificadas:"

CREDORA:
${credorCompleto}

DEVEDORA:
- Nome: ${clienteNome}
- CPF/CNPJ: ${clienteCpf}

CLÁUSULA PRIMEIRA - DO OBJETO E DO RECONHECIMENTO E CONFISSÃO DA DÍVIDA:
A DEVEDORA reconhece e confessa, de forma irrevogável e irretratável, a dívida objeto deste acordo, nos termos dos arts. 389, 395 e 784, III, do Código de Processo Civil, e renuncia a qualquer alegação futura de nulidade, inexigibilidade, excesso de execução ou discussão quanto à origem do débito, por se tratar de uma dívida líquida, certa e exigível, perante a CREDORA, oriunda de inadimplemento contratual, referente aos seguintes títulos e contratos:

${contratos ? contratos : 'Contratos não especificados'}

O montante principal atualizado da dívida perfaz o valor total de: R$ ${valorTotal ? Number(valorTotal).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : 'Não informado'}.

CLÁUSULA SEGUNDA - DA TRANSAÇÃO E DOS PAGAMENTOS:
Descreva aqui as condições de pagamento com base na descrição do acordo abaixo. Inclua o montante total negociado, número de parcelas, valor de cada parcela.
PARÁGRAFO ÚNICO: O vencimento da primeira parcela, as demais no mesmo dia dos meses subsequentes. Pagamentos via boleto bancário ou transferência para conta indicada pela CREDORA.

CLÁUSULA TERCEIRA - DAS RESPONSABILIDADES PELAS BAIXAS DE PENDÊNCIAS:
É de inteira e exclusiva responsabilidade da DEVEDORA o pagamento de quaisquer custas, taxas e emolumentos cartorários, necessários à baixa de processo, protestos ou pendências existentes em seu nome e no de suas filiais; inclusive, em empresas restritivas de créditos.
PARÁGRAFO ÚNICO: A CREDORA se compromete a fornecer a Carta de Anuência, para cancelamento dos protestos em cartório, somente após o recebimento integral e a efetiva compensação de todas as parcelas pactuadas neste instrumento, sendo que a DEVEDORA deverá providenciar o protocolo e pagamento das custas perante os respectivos tabelionatos.

CLÁUSULA QUARTA - DO INADIMPLEMENTO E DAS PENALIDADES:
O não pagamento de qualquer das parcelas, nas datas aprazadas, constituirá a DEVEDORA em mora, independentemente de notificação judicial ou extrajudicial.
PARÁGRAFO PRIMEIRO: Na hipótese de atraso superior a 05 (cinco) dias, no pagamento de qualquer parcela, ocorrerá o vencimento antecipado de toda a dívida remanescente, autorizando a CREDORA a promover a imediata execução do saldo devedor integral, sem prejuízo da inscrição do nome da DEVEDORA nos órgãos de proteção ao crédito (SPC/SERASA) e novos protestos.
PARÁGRAFO SEGUNDO: Em caso de inadimplemento, sobre o saldo devedor total incidirá multa penalizadora de 20% (vinte por cento), juros moratórios de 1% (um por cento) ao mês e correção monetária pelos índices das Taxas da SELIC Diária do BACEN; e mais 20% (vinte por cento) de honorários advocatícios, calculados sobre o valor total e atualizado do débito.

CLÁUSULA QUINTA - DA NOVAÇÃO:
A presente transação é realizada em caráter excepcional e não importa em novação da dívida original. O descumprimento do presente acordo permite à CREDORA a cobrança do débito original, nos termos dos contratos discriminados na Cláusula Primeira, subtraindo-se apenas os valores eventualmente pagos.

CLÁUSULA SEXTA - DAS DISPOSIÇÕES GERAIS:
O presente acordo constitui título executivo extrajudicial, nos termos do art. 784, III e IV, do Código de Processo Civil. Qualquer tolerância por parte da CREDORA, quanto ao cumprimento das cláusulas do presente acordo, será considerada mera liberalidade, não constituindo renúncia, perdão, alteração ou novação das obrigações aqui assumidas.

CLÁUSULA SÉTIMA - DO FORO:
As partes elegem o Foro da Comarca de Aparecida de Goiânia-GO, para dirimirem quaisquer eventuais dúvidas ou litígios oriundos deste instrumento, com renúncia expressa a qualquer outro, por mais privilegiado que seja.

"E, por estarem assim justas e contratadas, as partes assinam o presente instrumento em 02 (duas) vias de igual teor e forma, para um só efeito, na presença de 02 (duas) testemunhas."

Local e data: Aparecida de Goiânia-GO, [data atual por extenso].

Espaços para assinatura:
- MONTREAL - MONTADORA DE MÓVEIS E ELETRO-DOMÉSTICOS LTDA. (CREDORA)
- ${clienteNome} (DEVEDOR(A))

TESTEMUNHAS:
1. Nome: / CPF:
2. Nome: / CPF:

DESCRIÇÃO DO ACORDO FEITO (use para preencher a CLÁUSULA SEGUNDA):
${descricaoAcordo}

Gere o termo completo seguindo EXATAMENTE esta estrutura com 7 cláusulas. Adapte apenas a CLÁUSULA SEGUNDA com os dados do acordo descrito acima. Escreva todos os valores por extenso entre parênteses.`;

    } else {
      // Generic template for non-Montreal creditors
      systemPrompt = `Você é um advogado brasileiro com mais de 20 anos de experiência em direito civil e empresarial, especializado em acordos extrajudiciais de cobrança. Você redige termos de acordo extrajudiciais completos e profissionais.

INSTRUÇÕES:
- Gere um TERMO DE ACORDO EXTRAJUDICIAL completo e profissional
- Use linguagem jurídica formal e precisa
- Inclua todas as cláusulas necessárias: qualificação das partes, objeto, condições de pagamento, multas, penalidades, foro, disposições gerais
- NÃO mencione inteligência artificial em nenhum momento
- Retorne APENAS o texto puro do termo, sem formatação markdown (sem **, ##, etc.)
- Use numeração de cláusulas (CLÁUSULA PRIMEIRA, CLÁUSULA SEGUNDA, etc.)
- Inclua espaços para assinatura das partes e testemunhas ao final
- Use a data atual para o termo
- Seja detalhista nas cláusulas de inadimplemento e penalidades`;

      userPrompt = `Gere um Termo de Acordo Extrajudicial com base nas seguintes informações:

DADOS DO DEVEDOR:
- Nome: ${clienteNome}
- CPF/CNPJ: ${clienteCpf}

CREDOR: ${credorCompleto}

VALOR TOTAL DA DÍVIDA: R$ ${valorTotal ? Number(valorTotal).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : 'Não informado'}

${contratos ? `CONTRATOS EM ABERTO:\n${contratos}` : ''}

DESCRIÇÃO DO ACORDO FEITO:
${descricaoAcordo}

Gere o termo completo e profissional.`;
    }

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);

      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Taxa de requisições excedida. Tente novamente em alguns segundos.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'Créditos insuficientes. Por favor, adicione créditos à sua conta.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`AI gateway error: ${response.status}`);
    }

    const result = await response.json();
    const termoGerado = result.choices?.[0]?.message?.content || '';

    const termoLimpo = termoGerado
      .replace(/\*\*/g, '')
      .replace(/##\s*/g, '')
      .replace(/###\s*/g, '')
      .replace(/`/g, '');

    return new Response(
      JSON.stringify({ termo: termoLimpo }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error generating termo:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro ao gerar termo de acordo';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
