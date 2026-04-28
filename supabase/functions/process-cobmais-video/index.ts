import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { video_path, nome_fluxo } = await req.json()

    if (!video_path || !nome_fluxo) {
      return new Response(JSON.stringify({ error: 'video_path e nome_fluxo são obrigatórios' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: 'LOVABLE_API_KEY não configurada' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Download video from storage
    console.log(`[process-video] Downloading video: ${video_path}`)
    const { data: videoData, error: downloadError } = await adminClient.storage
      .from('cobmais-videos')
      .download(video_path)

    if (downloadError || !videoData) {
      console.error('Download error:', downloadError)
      return new Response(JSON.stringify({ error: 'Erro ao baixar vídeo do storage' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Convert to base64
    const arrayBuffer = await videoData.arrayBuffer()
    const uint8Array = new Uint8Array(arrayBuffer)
    let binary = ''
    const chunkSize = 8192
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.subarray(i, i + chunkSize)
      binary += String.fromCharCode(...chunk)
    }
    const base64Video = btoa(binary)

    const fileExtension = video_path.split('.').pop()?.toLowerCase() || 'webm'
    const mimeType = fileExtension === 'mp4' ? 'video/mp4' : 'video/webm'

    console.log(`[process-video] Video size: ${(uint8Array.length / 1024 / 1024).toFixed(2)}MB, format: ${mimeType}`)

    // Create session record first
    const authHeader = req.headers.get('authorization')
    let userId = null
    if (authHeader) {
      const { data: { user } } = await adminClient.auth.getUser(authHeader.replace('Bearer ', ''))
      userId = user?.id
    }

    const { data: sessao, error: sessaoError } = await adminClient
      .from('cobmais_sessoes_gravadas')
      .insert({
        nome: nome_fluxo,
        criado_por: userId || '00000000-0000-0000-0000-000000000000',
        status: 'processando',
        descricao: `Aprendizado por vídeo narrado`,
        total_passos: 0,
      })
      .select('id')
      .single()

    if (sessaoError) {
      console.error('Session creation error:', sessaoError)
      return new Response(JSON.stringify({ error: 'Erro ao criar sessão' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const sessaoId = sessao.id
    console.log(`[process-video] Created session: ${sessaoId}`)

    // Send video to Gemini for analysis
    const systemPrompt = `Você é um especialista em automação web analisando um vídeo de treinamento do sistema CobMais (app.cobmais.com.br).

O vídeo mostra um humano navegando no CobMais enquanto narra o que está fazendo. Sua tarefa é extrair passos estruturados que um robô de automação possa seguir.

## O que extrair de cada passo:
1. **acao**: tipo de ação (click, fill, navigate, scroll, select, wait)
2. **seletor**: seletor CSS do elemento quando possível (ex: #btnCalcular, input#txtValorFinal, a.gerar-boleto)
3. **valor**: valor preenchido ou URL navegada
4. **descricao_tela**: descrição do que está visível na tela naquele momento
5. **screenshot_description**: o que o narrador explicou sobre esse passo (contexto humano)

## Regras:
- Ignore ações repetidas ou navegações automáticas (redirects)
- Foque nos cliques e preenchimentos que realmente importam
- Capture o contexto narrado — "aqui eu clico no botão amarelo porque é o menu de boletos"
- Identifique seletores CSS quando visíveis (IDs, classes)
- Agrupe ações relacionadas logicamente
- Numere os passos sequencialmente

## Seletores conhecidos do CobMais (use como referência):
- Login: input#Username, input#Password, #Login
- Pesquisa: input#txtCPFCNPJ, #btnPesquisar
- Cálculo: a#btnCalcular, input#txtValorFinal, #btnAtualizarCalculo, #btnSalvarCalc
- Boletos: span.ev-btn-amarelo, a.gerar-boleto, label[for="ckbTodosBoletos"], #btnConfirmarBoleto
- Email: a[href="#tabEmail"], a#btnNovoItem, input#txtEmail, #btnSalvarEmail

Retorne os passos usando a tool call fornecida.`

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
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Analise este vídeo de treinamento do fluxo "${nome_fluxo}" no CobMais. Extraia todos os passos que o usuário executou, incluindo o contexto narrado.`,
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64Video}`,
                },
              },
            ],
          },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'save_training_steps',
              description: 'Salva os passos de treinamento extraídos do vídeo',
              parameters: {
                type: 'object',
                properties: {
                  resumo: {
                    type: 'string',
                    description: 'Resumo geral do que o vídeo ensina',
                  },
                  passos: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        passo_numero: { type: 'number', description: 'Número sequencial do passo' },
                        acao: { type: 'string', enum: ['click', 'fill', 'navigate', 'scroll', 'select', 'wait'], description: 'Tipo de ação' },
                        seletor: { type: 'string', description: 'Seletor CSS do elemento (quando identificável)' },
                        valor: { type: 'string', description: 'Valor preenchido ou URL' },
                        descricao_tela: { type: 'string', description: 'O que está visível na tela' },
                        screenshot_description: { type: 'string', description: 'O que o narrador explicou sobre este passo' },
                      },
                      required: ['passo_numero', 'acao', 'descricao_tela', 'screenshot_description'],
                      additionalProperties: false,
                    },
                  },
                },
                required: ['resumo', 'passos'],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: 'function', function: { name: 'save_training_steps' } },
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('AI Gateway error:', response.status, errorText)

      // Update session as failed
      await adminClient.from('cobmais_sessoes_gravadas').update({ status: 'erro' }).eq('id', sessaoId)

      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit excedido, tente novamente em alguns segundos' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'Créditos insuficientes' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      return new Response(JSON.stringify({ error: `Erro na IA: ${response.status}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const data = await response.json()
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0]

    if (!toolCall?.function?.arguments) {
      await adminClient.from('cobmais_sessoes_gravadas').update({ status: 'erro' }).eq('id', sessaoId)
      return new Response(JSON.stringify({ error: 'IA não retornou passos estruturados' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const result = JSON.parse(toolCall.function.arguments)
    const passos = result.passos || []
    const resumo = result.resumo || ''

    console.log(`[process-video] AI extracted ${passos.length} steps. Summary: ${resumo}`)

    // Save steps to cobmais_conhecimento
    if (passos.length > 0) {
      const records = passos.map((p: any) => ({
        sessao_id: sessaoId,
        nome_fluxo: nome_fluxo,
        passo_numero: p.passo_numero,
        acao: p.acao,
        seletor: p.seletor || null,
        valor: p.valor || null,
        descricao_tela: p.descricao_tela || null,
        screenshot_description: p.screenshot_description || null,
        url_pagina: null,
      }))

      const { error: insertError } = await adminClient
        .from('cobmais_conhecimento')
        .insert(records)

      if (insertError) {
        console.error('Insert error:', insertError)
        await adminClient.from('cobmais_sessoes_gravadas').update({ status: 'erro' }).eq('id', sessaoId)
        return new Response(JSON.stringify({ error: 'Erro ao salvar passos' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
    }

    // Update session as completed
    await adminClient.from('cobmais_sessoes_gravadas').update({
      status: 'concluida',
      total_passos: passos.length,
      finalizado_em: new Date().toISOString(),
      descricao: resumo || `Aprendizado por vídeo narrado`,
    }).eq('id', sessaoId)

    console.log(`[process-video] Successfully saved ${passos.length} steps for session ${sessaoId}`)

    return new Response(JSON.stringify({
      success: true,
      sessao_id: sessaoId,
      total_passos: passos.length,
      resumo,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('process-cobmais-video error:', err)
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Erro interno' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
