import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const userId = claimsData.claims.sub;
    const { messages } = await req.json();

    // Fetch all knowledge data using service role
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const [sessionsRes, knowledgeRes, configRes] = await Promise.all([
      adminClient.from("cobmais_sessoes_gravadas").select("*").order("criado_em", { ascending: false }),
      adminClient.from("cobmais_conhecimento").select("*").order("sessao_id, passo_numero"),
      adminClient.from("automacao_config").select("cobmais_email, cobmais_senha").order("criado_em", { ascending: false }).limit(1).maybeSingle(),
    ]);

    const cobmaisConfig = configRes.data;

    const sessions = sessionsRes.data || [];
    const knowledge = knowledgeRes.data || [];

    // Build knowledge context
    let knowledgeContext = "";
    if (sessions.length === 0) {
      knowledgeContext = "NENHUM CONHECIMENTO FOI GRAVADO AINDA. Não há sessões de treinamento nem vídeos processados.";
    } else {
      knowledgeContext = sessions.map(s => {
        const steps = knowledge.filter(k => k.sessao_id === s.id);
        const stepsText = steps.map(k => 
          `  Passo ${k.passo_numero}: ação="${k.acao}" | seletor="${k.seletor || 'N/A'}" | valor="${k.valor || 'N/A'}" | descrição="${k.descricao_tela || 'N/A'}" | url="${k.url_pagina || 'N/A'}"`
        ).join("\n");
        return `FLUXO: "${s.nome}" (status: ${s.status}, ${s.total_passos} passos, gravado em ${s.criado_em})\n${s.descricao ? `Descrição: ${s.descricao}\n` : ""}${stepsText || "  (sem passos registrados)"}`;
      }).join("\n\n");
    }

    const credenciaisSection = cobmaisConfig?.cobmais_email
      ? `\n## Credenciais CobMais:\nEmail: ${cobmaisConfig.cobmais_email}, Senha: ${cobmaisConfig.cobmais_senha}.\nQuando o usuário pedir para fazer login, use essas credenciais no objetivo da automação. NUNCA exiba a senha no chat — apenas use-a internamente no objetivo da tool.`
      : `\n## Credenciais CobMais:\nNENHUMA CREDENCIAL CONFIGURADA. Peça ao usuário para configurar na seção "Configuração do Servidor".`;

    const systemPrompt = `Você é a IA do sistema de automação CobMais. Seu papel é conversar com o administrador sobre o que você aprendeu nos treinamentos E também EXECUTAR ações quando solicitado.
${credenciaisSection}

## Seu conhecimento atual:
${knowledgeContext}

## Modo de Execução: HÍBRIDO INTELIGENTE
- Para comandos simples (1 clique, 1 preenchimento): use executar_acao_direta COM VISÃO (o sistema vai capturar screenshot, analisar com IA de visão, e executar o seletor correto)
- Para fluxos complexos multi-passo: use executar_automacao

## Regras CRÍTICAS:
1. Responda SEMPRE em português brasileiro
2. **NUNCA diga "✅ Feito!" sem verificação** — o sistema vai verificar automaticamente se a ação funcionou
3. Se a ação falhar, mostre o erro real e peça orientação ao usuário
4. **Execute UMA ETAPA por vez** — após executar, pare e pergunte o próximo passo
5. Use markdown para formatar as respostas

## Regras de Conhecimento:
6. Quando perguntado sobre o que sabe fazer, analise os fluxos gravados e descreva
7. Se um passo está vago, identifique como LACUNA: "📹 **Sugiro que envie um novo vídeo explicando [o que falta]**"
8. Se perguntado sobre algo que NÃO está nos fluxos, diga que ainda não aprendeu
9. Seja honesto sobre o que sabe e o que não sabe

## Regras de Execução:
10. Quando o usuário PEDIR para executar algo, use a tool adequada — NÃO apenas descreva
11. Para executar_automacao, use max_iterations:
    - Ação simples: 1 | Fluxo curto: 3 | Fluxo completo: 5
12. Exemplos de quando executar: "acesse o link X", "pesquise pelo CPF Y", "clique no botão Z"
13. Exemplos de quando NÃO executar: "o que você sabe fazer?", "explique como funciona"
14. Suporta TECLAS (keypress): F5, Enter, Escape, Tab, Backspace
15. Para login: INCLUA credenciais no objetivo, NUNCA mostre a senha no chat
16. SEMPRE pergunte ao usuário qual o próximo passo após confirmar a execução
17. Informe que o usuário pode acompanhar no **"Streaming do Robô"**

## Análise de Imagens:
18. Quando o usuário enviar screenshot, ANALISE VISUALMENTE e identifique elementos
19. Use a informação visual para decidir exatamente onde clicar

## MODO DE EXECUÇÃO DIRETA:
20. Use "executar_acao_direta" para ações simples (clique, fill, keypress, navigate)
21. O sistema vai AUTOMATICAMENTE: capturar screenshot → analisar com IA de visão → encontrar seletor correto → executar → verificar resultado
22. Mesmo se você não souber o seletor exato, use uma DESCRIÇÃO do elemento como selector (ex: "botão Cobrança no menu lateral", "link Telecobrança")
23. A IA de visão vai encontrar o seletor correto na tela real
24. Para click: use selector com descrição textual do que clicar
25. Para fill: use selector + value
26. Para keypress: use value com nome da tecla
27. Para navigate: use url`;


    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const tools = [
      {
        type: "function",
        function: {
          name: "executar_automacao",
          description: "Executa um fluxo COMPLEXO multi-passo no robô CobMais usando IA de visão. Use APENAS quando não souber os seletores ou para fluxos longos. Para ações simples, prefira executar_acao_direta.",
          parameters: {
            type: "object",
            properties: {
              objetivo: {
                type: "string",
                description: "Descrição em linguagem natural do que deve ser feito"
              },
              max_iterations: {
                type: "number",
                description: "Número máximo de ações. Use 1-5. Padrão: 1"
              }
            },
            required: ["objetivo"],
            additionalProperties: false
          }
        }
      },
      {
        type: "function",
        function: {
          name: "executar_acao_direta",
          description: "Executa UMA ação no navegador COM verificação por IA de visão. O sistema captura screenshot, usa visão computacional para encontrar o seletor correto, executa, e verifica o resultado.",
          parameters: {
            type: "object",
            properties: {
              action: {
                type: "string",
                enum: ["click", "fill", "keypress", "navigate", "scroll", "select"],
                description: "Tipo da ação a executar"
              },
              selector: {
                type: "string",
                description: "Descrição textual do elemento (ex: 'botão Cobrança no menu lateral', 'link Telecobrança'). A IA de visão encontrará o seletor CSS correto."
              },
              value: {
                type: "string",
                description: "Valor para fill, keypress (F5, Enter, Escape), ou select"
              },
              url: {
                type: "string",
                description: "URL para navigate"
              }
            },
            required: ["action"],
            additionalProperties: false
          }
        }
      }
    ];

    // 1st call: non-streaming, with tools, to decide if we need to execute
    console.log("[chat-cobmais-knowledge] 1st call: checking for tool usage...");
    const firstResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        tools,
        stream: false,
      }),
    });

    if (!firstResponse.ok) {
      if (firstResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Tente novamente em alguns segundos." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (firstResponse.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await firstResponse.text();
      console.error("AI gateway error (1st call):", firstResponse.status, t);
      return new Response(JSON.stringify({ error: "Erro no gateway de IA" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const firstResult = await firstResponse.json();
    const firstChoice = firstResult.choices?.[0];
    const toolCalls = firstChoice?.message?.tool_calls;

    let finalMessages = [
      { role: "system", content: systemPrompt },
      ...messages,
    ];

    if (toolCalls && toolCalls.length > 0) {
      const toolCall = toolCalls[0];
      const args = JSON.parse(toolCall.function.arguments || "{}");
      const toolName = toolCall.function.name;

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

      let toolResultContent = "";

      if (toolName === "executar_acao_direta") {
        // VISION-GUIDED DIRECT ACTION
        const { action: directAction, selector, value, url: directUrl } = args;
        console.log(`[chat-cobmais-knowledge] Vision-guided action: ${directAction}, description: ${selector}, value: ${value}`);

        try {
          // For navigate/keypress, no vision needed
          if (directAction === "navigate" || directAction === "keypress") {
            const directRes = await fetch(`${supabaseUrl}/functions/v1/automacao-cobmais`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
              body: JSON.stringify({
                action: "acao_direta",
                direct_action: directAction,
                direct_selector: selector,
                direct_value: value,
                direct_url: directUrl,
                _internal: true,
              }),
            });
            const directResult = await directRes.json();
            toolResultContent = directResult.success
              ? `Ação executada com sucesso! Ação: ${directAction}${value ? ` (${value})` : ""}${directUrl ? ` → ${directUrl}` : ""}. Confirme ao usuário.`
              : `❌ Erro: ${directResult.error || "desconhecido"}. Informe o erro REAL ao usuário e peça orientação.`;
          } else {
            // STEP 1: Capture screenshot from server
            const screenshotRes = await fetch(`${supabaseUrl}/functions/v1/automacao-cobmais`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
              body: JSON.stringify({ action: "screenshot", _internal: true }),
            });
            const screenshotData = await screenshotRes.json();
            
            if (!screenshotData.screenshot) {
              toolResultContent = "❌ Não consegui capturar a tela do navegador. O servidor local está conectado? Informe o erro ao usuário.";
            } else {
              // STEP 2: Use vision AI to find the correct selector
              const visionInstruction = directAction === "click" 
                ? `Encontre o elemento para clicar: "${selector}". Retorne a ação click com o seletor CSS correto ou coordenadas x,y.`
                : directAction === "fill"
                ? `Encontre o campo para preencher: "${selector}". Retorne a ação fill com o seletor CSS correto. O valor a preencher é: "${value}"`
                : `Execute: ${directAction} no elemento "${selector}"`;
              
              const visionRes = await fetch(`${supabaseUrl}/functions/v1/analyze-cobmais-screen`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
                body: JSON.stringify({
                  screenshot: screenshotData.screenshot,
                  objective: visionInstruction,
                  current_url: screenshotData.current_url || "",
                  mode: "single_action",
                }),
              });
              const visionResult = await visionRes.json();
              
              if (!visionResult.success || !visionResult.action) {
                toolResultContent = `❌ A IA de visão não conseguiu encontrar o elemento "${selector}" na tela. Erro: ${visionResult.error || "elemento não identificado"}. Peça ao usuário para enviar um screenshot ou descrever melhor o elemento.`;
              } else {
                const visionAction = visionResult.action;
                console.log(`[chat-cobmais-knowledge] Vision found: action=${visionAction.action}, selector=${visionAction.selector}, confidence=${visionAction.confidence}`);

                if (visionAction.confidence < 0.5) {
                  toolResultContent = `⚠️ A IA de visão encontrou o elemento mas com baixa confiança (${Math.round(visionAction.confidence * 100)}%). Descrição: "${visionAction.description}". Peça ao usuário para confirmar ou enviar um screenshot.`;
                } else {
                  // STEP 3: Execute with the vision-found selector
                  const execBody: any = {
                    action: "acao_direta",
                    direct_action: directAction,
                    direct_selector: visionAction.selector,
                    direct_value: value,
                    _internal: true,
                  };
                  // If vision returned coordinates and no CSS selector, use click_at_position
                  if (!visionAction.selector && visionAction.result_data?.x && visionAction.result_data?.y) {
                    execBody.direct_action = "click_at_position";
                    execBody.x = visionAction.result_data.x;
                    execBody.y = visionAction.result_data.y;
                    delete execBody.direct_selector;
                  }

                  const execRes = await fetch(`${supabaseUrl}/functions/v1/automacao-cobmais`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
                    body: JSON.stringify(execBody),
                  });
                  const execResult = await execRes.json();

                  if (!execResult.success) {
                    toolResultContent = `❌ A IA de visão encontrou o elemento (seletor: "${visionAction.selector}") mas a execução falhou: ${execResult.error}. Informe o erro REAL ao usuário.`;
                  } else {
                    // STEP 4: Verify - capture post-action screenshot
                    await new Promise(r => setTimeout(r, 1000));
                    const verifyRes = await fetch(`${supabaseUrl}/functions/v1/automacao-cobmais`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
                      body: JSON.stringify({ action: "screenshot", _internal: true }),
                    });
                    const verifyData = await verifyRes.json();
                    const newUrl = verifyData.current_url || "";
                    const oldUrl = screenshotData.current_url || "";
                    const urlChanged = newUrl !== oldUrl;

                    toolResultContent = `✅ Ação executada! ${visionAction.description}. Seletor usado: "${visionAction.selector || "coordenadas"}". Confiança: ${Math.round(visionAction.confidence * 100)}%.${urlChanged ? ` A URL mudou de ${oldUrl} para ${newUrl}.` : ""} Confirme ao usuário e pergunte o próximo passo.`;
                  }
                }
              }
            }
          }
        } catch (err) {
          toolResultContent = `❌ Erro de conexão: ${err instanceof Error ? err.message : "desconhecido"}. Informe ao usuário.`;
        }
      } else {
        // AGENT MODE: fire-and-forget for complex flows
        const objetivo = args.objetivo;
        const maxIterations = args.max_iterations || 1;
        console.log(`[chat-cobmais-knowledge] Agent: ${objetivo}, max_iterations: ${maxIterations}`);

        fetch(`${supabaseUrl}/functions/v1/automacao-cobmais`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
          body: JSON.stringify({
            action: "agent_execute",
            objetivo,
            parametros: {},
            max_iterations: Math.min(maxIterations, 10),
            _internal: true,
          }),
        }).then(res => res.text()).then(t => {
          console.log("[chat-cobmais-knowledge] Automation dispatched:", t.substring(0, 200));
        }).catch(err => {
          console.error("[chat-cobmais-knowledge] Automation dispatch error:", err);
        });

        // Save knowledge (fire-and-forget)
        (async () => {
          try {
            let { data: session } = await adminClient.from("cobmais_sessoes_gravadas")
              .select("id, total_passos").eq("nome", "chat_aprendido").single();
            if (!session) {
              const { data: ns } = await adminClient.from("cobmais_sessoes_gravadas")
                .insert({ nome: "chat_aprendido", status: "finalizado", criado_por: userId, total_passos: 0, descricao: "Conhecimento aprendido via chat" })
                .select("id, total_passos").single();
              session = ns;
            }
            if (session) {
              const nextStep = (session.total_passos || 0) + 1;
              const objLower = objetivo.toLowerCase();
              let acao = "navigate";
              if (objLower.includes("f5") || objLower.includes("enter") || objLower.includes("escape") || objLower.includes("tab") || objLower.includes("tecla") || objLower.includes("pressio")) acao = "keypress";
              else if (objLower.includes("clic") || objLower.includes("botão") || objLower.includes("botao")) acao = "click";
              else if (objLower.includes("preench") || objLower.includes("digit") || objLower.includes("escrev")) acao = "fill";
              else if (objLower.includes("scroll") || objLower.includes("rolar")) acao = "scroll";
              await adminClient.from("cobmais_conhecimento").insert({ sessao_id: session.id, nome_fluxo: "chat_aprendido", passo_numero: nextStep, acao, descricao_tela: objetivo });
              await adminClient.from("cobmais_sessoes_gravadas").update({ total_passos: nextStep }).eq("id", session.id);
            }
          } catch (err) { console.error("[chat-cobmais-knowledge] Error saving knowledge:", err); }
        })();

        toolResultContent = `Automação disparada com sucesso! O robô está executando o objetivo: "${objetivo}". Confirme ao usuário e pergunte o próximo passo.`;
      }

      finalMessages = [
        ...finalMessages,
        firstChoice.message,
        { role: "tool", tool_call_id: toolCall.id, content: toolResultContent },
      ];
    } else if (firstChoice?.message?.content) {
      finalMessages = [...finalMessages];
    }

    // 2nd call: streaming, with full context
    console.log("[chat-cobmais-knowledge] 2nd call: streaming final response...");
    const streamResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: finalMessages,
        stream: true,
      }),
    });

    if (!streamResponse.ok) {
      const t = await streamResponse.text();
      console.error("AI gateway error (2nd call):", streamResponse.status, t);
      return new Response(JSON.stringify({ error: "Erro no gateway de IA" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(streamResponse.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat-cobmais-knowledge error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
