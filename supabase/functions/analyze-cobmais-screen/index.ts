import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const BASE_SYSTEM_PROMPT = `Você é um agente de automação web especializado no sistema CobMais (app.cobmais.com.br).
Você recebe screenshots da tela atual do navegador e deve decidir a próxima ação para completar o objetivo.

## Estrutura do CobMais
- Login: campos #Username, #Password, botão submit
- Pesquisa: campo #txtCPFCNPJ, botão #btnPesquisar
- Ficha do devedor: abas (Telefone, E-mail, Endereço), botões de ação
- Cálculo: botão #btnCalcular (precisa scroll), campo #txtValorFinal, botão #btnAtualizarCalculo, #btnSalvarCalc
- Boletos: dropdown amarelo (span.ev-btn-amarelo), link "Emitir Boleto" (a.gerar-boleto), checkbox #ckbTodosBoletos (label), #btnConfirmarBoleto
- Modais: podem aparecer pedindo email, confirmação, etc.

## Regras de Segurança
- NUNCA deletar dados
- NUNCA alterar senhas de usuários
- NUNCA clicar em botões de exclusão
- Se aparecer confirmação de exclusão, retorne action "error"

## Como Identificar Erros
- Toasts amarelos/vermelhos = erro ou aviso
- Texto "Email do cliente não pode ficar em branco" = precisa cadastrar email
- Página de login = sessão expirou, precisa relogar
- Modal com "Erro" no título = falha na operação

## Seletores Conhecidos (use como dicas, mas analise a imagem)
- Login: input#Username, input#Password
- Pesquisa CPF: input#txtCPFCNPJ, #btnPesquisar
- Resultados: table tbody tr:first-child td a
- Cálculo: a#btnCalcular, input#txtValorFinal, #btnAtualizarCalculo, #btnSalvarCalc
- Boletos: span.ev-btn-amarelo, a.gerar-boleto, label[for="ckbTodosBoletos"], #btnConfirmarBoleto
- Email: a[href="#tabEmail"], a#btnNovoItem, input#txtEmail, #btnSalvarEmail

## Formato da Resposta
Retorne SEMPRE via tool call com a próxima ação a executar.`;

async function fetchKnowledge(supabaseClient: any, objective: string): Promise<string> {
  try {
    // Extract flow name hints from the objective
    const flowKeywords: Record<string, string[]> = {
      'gerar_boleto': ['boleto', 'gerar boleto', 'emitir boleto'],
      'buscar_cliente': ['buscar', 'pesquisar', 'cliente', 'cpf'],
      'login': ['login', 'entrar', 'logar'],
      'cadastrar_email': ['email', 'e-mail', 'cadastrar email'],
      'calculo': ['cálculo', 'calculo', 'calcular', 'valor'],
    }

    const objectiveLower = objective.toLowerCase()
    const matchingFlows: string[] = []
    
    for (const [flow, keywords] of Object.entries(flowKeywords)) {
      if (keywords.some(k => objectiveLower.includes(k))) {
        matchingFlows.push(flow)
      }
    }

    // Fetch all knowledge, prioritizing matching flows
    let query = supabaseClient
      .from('cobmais_conhecimento')
      .select('nome_fluxo, passo_numero, descricao_tela, acao, seletor, valor, url_pagina, screenshot_description')
      .order('nome_fluxo')
      .order('passo_numero')

    if (matchingFlows.length > 0) {
      query = query.in('nome_fluxo', matchingFlows)
    }

    const { data, error } = await query.limit(100)
    
    if (error || !data || data.length === 0) return ''

    // Group by flow and filter noise
    const flows: Record<string, any[]> = {}
    for (const step of data) {
      // Skip chrome-error URLs
      if (step.url_pagina?.includes('chrome-error://')) continue
      // Skip generic selectors with no useful info
      if (step.acao === 'click' && step.seletor === 'div.login') continue
      
      if (!flows[step.nome_fluxo]) flows[step.nome_fluxo] = []
      flows[step.nome_fluxo].push(step)
    }

    let knowledgeText = '\n\n## 🎓 CONHECIMENTO APRENDIDO (gravado por humano)\nUse estas lições como guia prioritário. Estes passos foram gravados por um humano navegando o CobMais real.\n'

    for (const [flowName, rawSteps] of Object.entries(flows)) {
      // Filter consecutive duplicate navigates (keep only the last one with a new base URL)
      const steps: any[] = []
      let lastNavBaseUrl = ''
      for (const step of rawSteps) {
        if (step.acao === 'navigate') {
          const baseUrl = (step.url_pagina || '').split('?')[0].split('#')[0]
          if (baseUrl === lastNavBaseUrl) continue // skip duplicate
          if ((step.url_pagina || '').includes('/connect/authorize/callback')) continue // skip OAuth redirects
          lastNavBaseUrl = baseUrl
        } else {
          lastNavBaseUrl = '' // reset after non-navigate
        }
        steps.push(step)
      }

      knowledgeText += `\n### Fluxo: "${flowName}" (${steps.length} passos úteis)\n`
      let stepNum = 0
      for (const step of steps) {
        stepNum++
        const icon = step.acao === 'click' || step.acao === 'fill' ? '⭐' : ''
        knowledgeText += `  ${stepNum}. ${icon}[${step.acao}] `
        if (step.seletor) knowledgeText += `seletor="${step.seletor}" `
        if (step.valor) {
          // Truncate long URLs in valor
          const truncVal = step.valor.length > 80 ? step.valor.substring(0, 80) + '...' : step.valor
          knowledgeText += `valor="${truncVal}" `
        }
        if (step.url_pagina) {
          const shortUrl = step.url_pagina.split('?')[0]
          knowledgeText += `url="${shortUrl}" `
        }
        if (step.screenshot_description) knowledgeText += `— ${step.screenshot_description}`
        if (step.descricao_tela) knowledgeText += ` (tela: ${step.descricao_tela})`
        knowledgeText += '\n'
      }
    }

    return knowledgeText
  } catch (err) {
    console.error('Error fetching knowledge:', err)
    return ''
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { screenshot, objective, history, current_url, mode } = await req.json()

    if (!screenshot || !objective) {
      return new Response(JSON.stringify({ error: 'screenshot e objective são obrigatórios' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Single-action mode: simplified prompt for finding a specific element
    const isSingleAction = mode === 'single_action'

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: 'LOVABLE_API_KEY não configurada' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Fetch learned knowledge from database
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    
    let SYSTEM_PROMPT: string
    if (isSingleAction) {
      SYSTEM_PROMPT = `Você é um assistente de automação web. Analise o screenshot e identifique o elemento exato que o usuário quer interagir.
Retorne o seletor CSS mais preciso possível, ou coordenadas x,y do centro do elemento se não conseguir determinar o seletor.
Priorize: IDs (#id) > classes únicas (.class) > atributos ([attr]) > coordenadas.
Se o elemento estiver dentro de um iframe, indique isso.
NUNCA invente seletores — só retorne o que você consegue identificar visualmente.`
    } else {
      const knowledgeText = await fetchKnowledge(adminClient, objective)
      SYSTEM_PROMPT = BASE_SYSTEM_PROMPT + knowledgeText
    }

    const historyText = (history || [])
      .map((h: any, i: number) => `${i + 1}. [${h.action}] ${h.description} → ${h.result || 'ok'}`)
      .join('\n')

    const userPrompt = `## Objetivo
${objective}

## URL Atual
${current_url || 'desconhecida'}

## Histórico de Ações (${(history || []).length} passos)
${historyText || 'Nenhuma ação executada ainda.'}

## Screenshot Atual
Analise a imagem e decida a próxima ação para atingir o objetivo.
Se o objetivo já foi alcançado, retorne done=true.
Se encontrou um erro irrecuperável, retorne action="error".`

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'text', text: userPrompt },
              { type: 'image_url', image_url: { url: screenshot } },
            ],
          },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'next_action',
              description: 'Retorna a próxima ação que o robô deve executar no navegador',
              parameters: {
                type: 'object',
                properties: {
                  action: {
                    type: 'string',
                    enum: ['click', 'fill', 'scroll', 'wait', 'navigate', 'select', 'keypress', 'done', 'error'],
                    description: 'Tipo de ação a executar',
                  },
                  selector: {
                    type: 'string',
                    description: 'Seletor CSS do elemento alvo (ex: #btnCalcular, input#txtValorFinal)',
                  },
                  value: {
                    type: 'string',
                    description: 'Valor para preencher (action=fill) ou URL (action=navigate) ou direção (action=scroll: up/down) ou tecla (action=keypress: F5, Enter, Escape, Tab, Backspace)',
                  },
                  description: {
                    type: 'string',
                    description: 'Descrição em português do que esta ação faz',
                  },
                  confidence: {
                    type: 'number',
                    description: 'Confiança de 0 a 1 de que esta é a ação correta',
                  },
                  done: {
                    type: 'boolean',
                    description: 'True se o objetivo foi alcançado',
                  },
                  error_message: {
                    type: 'string',
                    description: 'Mensagem de erro se action=error',
                  },
                  result_data: {
                    type: 'object',
                    description: 'Dados extraídos da tela (ex: boleto_url)',
                    properties: {
                      boleto_url: { type: 'string' },
                      mensagem: { type: 'string' },
                    },
                  },
                },
                required: ['action', 'description', 'confidence', 'done'],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: 'function', function: { name: 'next_action' } },
      }),
    })

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit excedido, tente novamente em alguns segundos' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'Créditos insuficientes no Lovable AI' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const errorText = await response.text()
      console.error('AI Gateway error:', response.status, errorText)
      return new Response(JSON.stringify({ error: `Erro na IA: ${response.status}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const data = await response.json()
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0]
    
    if (!toolCall?.function?.arguments) {
      return new Response(JSON.stringify({ error: 'IA não retornou ação estruturada' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const action = JSON.parse(toolCall.function.arguments)

    console.log(`[Agent] Action: ${action.action} | Confidence: ${action.confidence} | ${action.description}`)

    return new Response(JSON.stringify({ success: true, action }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    console.error('analyze-cobmais-screen error:', err)
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Erro interno' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
