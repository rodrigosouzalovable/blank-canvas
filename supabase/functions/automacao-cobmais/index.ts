import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

async function getAuthenticatedUser(req: Request) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: 'Unauthorized', status: 401 }
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )

  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    return { error: 'Unauthorized', status: 401 }
  }

  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { data: roleData } = await adminClient
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', 'admin')
    .maybeSingle()

  if (!roleData) {
    return { error: 'Admin access required', status: 403 }
  }

  return { userId: user.id, adminClient }
}

function getAdminClientForInternal() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
}

// ===== ACTION HANDLERS =====

async function handleGetConfig(adminClient: any) {
  const { data } = await adminClient
    .from('automacao_config')
    .select('*')
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle()
  return { success: true, config: data }
}

async function handleSaveConfig(adminClient: any, body: any, userId: string) {
  const { server_url, cobmais_email, cobmais_senha } = body
  const { data: existing } = await adminClient
    .from('automacao_config')
    .select('id')
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing) {
    await adminClient
      .from('automacao_config')
      .update({ server_url, cobmais_email, cobmais_senha, atualizado_em: new Date().toISOString() })
      .eq('id', existing.id)
  } else {
    await adminClient
      .from('automacao_config')
      .insert({ user_id: userId, server_url, cobmais_email, cobmais_senha })
  }
  return { success: true }
}

async function handleStatus(adminClient: any) {
  const { data: config } = await adminClient
    .from('automacao_config')
    .select('id, server_url, status')
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!config?.server_url) {
    return { success: true, status: 'offline', message: 'URL do servidor não configurada' }
  }

  try {
    const res = await fetch(`${config.server_url}/status`, {
      method: 'GET',
      headers: { 'ngrok-skip-browser-warning': 'true', 'User-Agent': 'MeusAcordos/1.0' },
      signal: AbortSignal.timeout(5000)
    })
    const data = await res.json()
    const newStatus = data.status === 'online' || data.online ? 'online' : 'offline'

    await adminClient
      .from('automacao_config')
      .update({ status: newStatus, atualizado_em: new Date().toISOString() })
      .eq('id', config.id)

    return { success: true, status: newStatus, data }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Servidor não respondeu'
    await adminClient
      .from('automacao_config')
      .update({ status: 'offline', atualizado_em: new Date().toISOString() })
      .eq('id', config.id)
    return { success: true, status: 'offline', message: errorMsg }
  }
}

async function handleExecute(adminClient: any, body: any, userId: string) {
  const { acao, parametros } = body
  if (!acao) return { error: 'Campo acao é obrigatório', _httpStatus: 400 }

  const { data: config } = await adminClient
    .from('automacao_config')
    .select('server_url, cobmais_email, cobmais_senha')
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!config?.server_url) return { error: 'URL do servidor não configurada', _httpStatus: 400 }

  const timeoutMs = acao === 'gerar_boleto' ? 180000 : 120000
  const effectiveUserId = userId === 'system' ? '00000000-0000-0000-0000-000000000000' : userId

  const { data: comando } = await adminClient
    .from('automacao_comandos')
    .insert({ user_id: effectiveUserId, acao, parametros: parametros || {}, status: 'executando' })
    .select('id')
    .single()

  const comandoId = comando?.id
  const startTime = Date.now()

  await adminClient.from('automacao_logs').insert({
    comando_id: comandoId, user_id: effectiveUserId, tipo: 'info',
    mensagem: `Iniciando ação: ${acao}`, detalhes: parametros || {}
  })

  try {
    const res = await fetch(`${config.server_url}/automacao/cobmais`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true', 'User-Agent': 'MeusAcordos/1.0' },
      body: JSON.stringify({ acao, parametros: parametros || {}, cobmais_email: config.cobmais_email, cobmais_senha: config.cobmais_senha }),
      signal: AbortSignal.timeout(timeoutMs)
    })
    const resultado = await res.json()
    const tempo = Date.now() - startTime

    if (res.ok && resultado.success !== false) {
      if (acao === 'gerar_boleto' && !resultado.boleto_url) {
        const erro = 'Robô retornou sucesso mas sem boleto_url — fluxo incompleto'
        await adminClient.from('automacao_comandos').update({ status: 'erro', erro, resultado, tempo_execucao_ms: tempo, executado_em: new Date().toISOString() }).eq('id', comandoId)
        await adminClient.from('automacao_logs').insert({ comando_id: comandoId, user_id: effectiveUserId, tipo: 'erro', mensagem: erro, detalhes: resultado })
        return { success: false, error: erro, resultado, tempo_ms: tempo }
      }

      await adminClient.from('automacao_comandos').update({ status: 'concluido', resultado, tempo_execucao_ms: tempo, executado_em: new Date().toISOString() }).eq('id', comandoId)
      await adminClient.from('automacao_logs').insert({ comando_id: comandoId, user_id: effectiveUserId, tipo: 'sucesso', mensagem: `Ação ${acao} concluída em ${tempo}ms`, detalhes: resultado })
      return { success: true, resultado, tempo_ms: tempo }
    } else {
      const erro = resultado.error || 'Erro desconhecido'
      await adminClient.from('automacao_comandos').update({ status: 'erro', erro, tempo_execucao_ms: tempo, executado_em: new Date().toISOString() }).eq('id', comandoId)
      await adminClient.from('automacao_logs').insert({ comando_id: comandoId, user_id: effectiveUserId, tipo: 'erro', mensagem: `Erro na ação ${acao}: ${erro}`, detalhes: resultado })
      return { success: false, error: erro, tempo_ms: tempo }
    }
  } catch (err) {
    const tempo = Date.now() - startTime
    const erro = err instanceof Error ? err.message : 'Erro de conexão'
    await adminClient.from('automacao_comandos').update({ status: 'erro', erro, tempo_execucao_ms: tempo, executado_em: new Date().toISOString() }).eq('id', comandoId)
    await adminClient.from('automacao_logs').insert({ comando_id: comandoId, user_id: effectiveUserId, tipo: 'erro', mensagem: `Falha na ação ${acao}: ${erro}` })
    return { success: false, error: erro, tempo_ms: tempo }
  }
}

async function handleAgentExecute(adminClient: any, body: any, userId: string) {
  const { objetivo, parametros: agentParams } = body
  if (!objetivo) return { error: 'Campo objetivo é obrigatório', _httpStatus: 400 }

  const { data: config } = await adminClient
    .from('automacao_config')
    .select('server_url, cobmais_email, cobmais_senha')
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!config?.server_url) return { error: 'URL do servidor não configurada', _httpStatus: 400 }

  const effectiveUserId = userId === 'system' ? '00000000-0000-0000-0000-000000000000' : userId

  const { data: comando } = await adminClient
    .from('automacao_comandos')
    .insert({ user_id: effectiveUserId, acao: `agent: ${objetivo.substring(0, 50)}`, parametros: agentParams || {}, status: 'executando' })
    .select('id')
    .single()

  const comandoId = comando?.id
  const startTime = Date.now()

  await adminClient.from('automacao_logs').insert({
    comando_id: comandoId, user_id: effectiveUserId, tipo: 'info',
    mensagem: `Agente iniciado: ${objetivo}`, detalhes: agentParams || {},
  })

  try {
    const res = await fetch(`${config.server_url}/automacao/agent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true', 'User-Agent': 'MeusAcordos/1.0' },
      body: JSON.stringify({
        objective: objetivo, parametros: agentParams || {},
        cobmais_email: config.cobmais_email, cobmais_senha: config.cobmais_senha,
        supabase_url: Deno.env.get('SUPABASE_URL'),
        max_iterations: body.max_iterations || undefined,
      }),
      signal: AbortSignal.timeout(360000),
    })

    const tempo = Date.now() - startTime
    const contentType = res.headers.get('content-type') || ''

    if (!contentType.includes('application/json')) {
      const bodyText = await res.text()
      const erro = `Servidor local retornou ${contentType || 'HTML'} em vez de JSON. Verifique se o server.js está atualizado.`
      console.error(`[agent_execute] Resposta não-JSON (status ${res.status}):`, bodyText.substring(0, 200))
      await adminClient.from('automacao_comandos').update({ status: 'erro', erro, tempo_execucao_ms: tempo, executado_em: new Date().toISOString() }).eq('id', comandoId)
      return { success: false, error: erro, tempo_ms: tempo }
    }

    let resultado: any
    try {
      resultado = await res.json()
    } catch {
      const erro = 'Falha ao interpretar resposta do servidor local (JSON inválido)'
      await adminClient.from('automacao_comandos').update({ status: 'erro', erro, tempo_execucao_ms: tempo, executado_em: new Date().toISOString() }).eq('id', comandoId)
      return { success: false, error: erro, tempo_ms: tempo }
    }

    const status = resultado.success ? 'concluido' : 'erro'
    const erro = resultado.success ? null : (resultado.error || 'Erro desconhecido')

    await adminClient.from('automacao_comandos').update({ status, erro, resultado, tempo_execucao_ms: tempo, executado_em: new Date().toISOString() }).eq('id', comandoId)
    await adminClient.from('automacao_logs').insert({
      comando_id: comandoId, user_id: effectiveUserId,
      tipo: resultado.success ? 'sucesso' : 'erro',
      mensagem: `Agente ${status}: ${resultado.mensagem || resultado.error || ''} (${resultado.iterations || 0} iterações)`,
      detalhes: { history: resultado.history, iterations: resultado.iterations },
    })

    return { success: resultado.success, resultado, tempo_ms: tempo }
  } catch (err) {
    const tempo = Date.now() - startTime
    const erro = err instanceof Error ? err.message : 'Erro de conexão'
    await adminClient.from('automacao_comandos').update({ status: 'erro', erro, tempo_execucao_ms: tempo, executado_em: new Date().toISOString() }).eq('id', comandoId)
    return { success: false, error: erro, tempo_ms: tempo }
  }
}

async function handleStop(adminClient: any) {
  const { data: config } = await adminClient
    .from('automacao_config')
    .select('server_url')
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!config?.server_url) return { error: 'URL do servidor não configurada', _httpStatus: 400 }

  try {
    const res = await fetch(`${config.server_url}/automacao/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true', 'User-Agent': 'MeusAcordos/1.0' },
      signal: AbortSignal.timeout(5000),
    })
    const data = await res.json()
    return { success: true, ...data }
  } catch (err) {
    return { success: false, error: 'Servidor não respondeu ao comando de parada' }
  }
}

async function handleRecordStart(adminClient: any, body: any, userId: string) {
  const { nome, descricao } = body
  if (!nome) return { error: 'Campo nome é obrigatório', _httpStatus: 400 }

  const { data: config } = await adminClient
    .from('automacao_config')
    .select('server_url')
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!config?.server_url) return { error: 'URL do servidor não configurada', _httpStatus: 400 }

  const { data: sessao, error } = await adminClient
    .from('cobmais_sessoes_gravadas')
    .insert({ nome, descricao: descricao || null, criado_por: userId, status: 'gravando' })
    .select('id')
    .single()

  if (error) return { error: 'Erro ao criar sessão: ' + error.message, _httpStatus: 500 }

  // Tell local server to start recording
  try {
    const res = await fetch(`${config.server_url}/automacao/gravar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true', 'User-Agent': 'MeusAcordos/1.0' },
      body: JSON.stringify({ sessao_id: sessao.id, nome_fluxo: nome, supabase_url: Deno.env.get('SUPABASE_URL'), supabase_key: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') }),
      signal: AbortSignal.timeout(10000),
    })
    const data = await res.json()
    return { success: true, sessao_id: sessao.id, server_response: data }
  } catch (err) {
    return { success: true, sessao_id: sessao.id, warning: 'Sessão criada mas servidor local não respondeu: ' + (err instanceof Error ? err.message : 'unknown') }
  }
}

async function handleRecordStop(adminClient: any, body: any) {
  const { sessao_id } = body
  if (!sessao_id) return { error: 'Campo sessao_id é obrigatório', _httpStatus: 400 }

  const { data: config } = await adminClient
    .from('automacao_config')
    .select('server_url')
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Count steps
  const { count } = await adminClient
    .from('cobmais_conhecimento')
    .select('id', { count: 'exact', head: true })
    .eq('sessao_id', sessao_id)

  await adminClient
    .from('cobmais_sessoes_gravadas')
    .update({ status: 'concluida', total_passos: count || 0, finalizado_em: new Date().toISOString() })
    .eq('id', sessao_id)

  // Tell local server to stop recording
  if (config?.server_url) {
    try {
      await fetch(`${config.server_url}/automacao/parar-gravacao`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true', 'User-Agent': 'MeusAcordos/1.0' },
        body: JSON.stringify({ sessao_id }),
        signal: AbortSignal.timeout(5000),
      })
    } catch {}
  }

  return { success: true, total_passos: count || 0 }
}

async function handleGetSessions(adminClient: any) {
  const { data } = await adminClient
    .from('cobmais_sessoes_gravadas')
    .select('*')
    .order('criado_em', { ascending: false })
    .limit(50)
  return { success: true, sessoes: data || [] }
}

async function handleGetKnowledge(adminClient: any, body: any) {
  const { sessao_id } = body
  let query = adminClient
    .from('cobmais_conhecimento')
    .select('*')
    .order('passo_numero')

  if (sessao_id) query = query.eq('sessao_id', sessao_id)
  
  const { data } = await query.limit(200)
  return { success: true, conhecimento: data || [] }
}

async function handleDeleteSession(adminClient: any, body: any) {
  const { sessao_id } = body
  if (!sessao_id) return { error: 'Campo sessao_id é obrigatório', _httpStatus: 400 }

  await adminClient.from('cobmais_sessoes_gravadas').delete().eq('id', sessao_id)
  return { success: true }
}

async function handleScreenshot(adminClient: any) {
  const { data: config } = await adminClient
    .from('automacao_config')
    .select('server_url')
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!config?.server_url) return { error: 'URL do servidor não configurada', _httpStatus: 400 }

  try {
    const res = await fetch(`${config.server_url}/screenshot`, {
      headers: { 'ngrok-skip-browser-warning': 'true', 'User-Agent': 'MeusAcordos/1.0' },
      signal: AbortSignal.timeout(10000),
    })
    const data = await res.json()
    return { success: true, screenshot: data.image, current_url: data.url }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Erro ao capturar screenshot' }
  }
}

async function handleAcaoDireta(adminClient: any, body: any, userId: string) {
  const { direct_action, direct_selector, direct_value, direct_url, x, y } = body
  if (!direct_action) return { error: 'Campo direct_action é obrigatório', _httpStatus: 400 }

  const { data: config } = await adminClient
    .from('automacao_config')
    .select('server_url')
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!config?.server_url) return { error: 'URL do servidor não configurada', _httpStatus: 400 }

  const startTime = Date.now()
  try {
    const payload: any = { action: direct_action, selector: direct_selector, value: direct_value, url: direct_url }
    // Support click_at_position with coordinates
    if (direct_action === 'click_at_position') {
      payload.action = 'click_at_position'
      payload.x = x
      payload.y = y
    }
    const res = await fetch(`${config.server_url}/automacao/acao-direta`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true', 'User-Agent': 'MeusAcordos/1.0' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    })
    const resultado = await res.json()
    return { success: resultado.success, resultado, tempo_ms: Date.now() - startTime, error: resultado.error }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Erro de conexão', tempo_ms: Date.now() - startTime }
  }
}

// ===== MAIN HANDLER =====
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { action } = body
    const isInternalCall = body._internal === true

    let userId = 'system'
    let adminClient: any

    if (isInternalCall) {
      adminClient = getAdminClientForInternal()
    } else {
      const auth = await getAuthenticatedUser(req)
      if ('error' in auth) {
        return new Response(JSON.stringify({ error: auth.error }), { status: auth.status, headers: corsHeaders })
      }
      userId = auth.userId!
      adminClient = auth.adminClient!
    }

    let result: any
    switch (action) {
      case 'get_config':
        result = await handleGetConfig(adminClient)
        break
      case 'save_config':
        result = await handleSaveConfig(adminClient, body, userId)
        break
      case 'status':
        result = await handleStatus(adminClient)
        break
      case 'execute':
        result = await handleExecute(adminClient, body, userId)
        break
      case 'agent_execute':
        result = await handleAgentExecute(adminClient, body, userId)
        break
      case 'stop':
        result = await handleStop(adminClient)
        break
      case 'record_start':
        result = await handleRecordStart(adminClient, body, userId)
        break
      case 'record_stop':
        result = await handleRecordStop(adminClient, body)
        break
      case 'get_sessions':
        result = await handleGetSessions(adminClient)
        break
      case 'get_knowledge':
        result = await handleGetKnowledge(adminClient, body)
        break
      case 'delete_session':
        result = await handleDeleteSession(adminClient, body)
        break
      case 'acao_direta':
        result = await handleAcaoDireta(adminClient, body, userId)
        break
      case 'screenshot':
        result = await handleScreenshot(adminClient)
        break
      default:
        return new Response(JSON.stringify({ error: `Ação desconhecida: ${action}` }), { status: 400, headers: corsHeaders })
    }

    const httpStatus = (typeof result._httpStatus === 'number' && result._httpStatus >= 200 && result._httpStatus <= 599) ? result._httpStatus : 200
    delete result._httpStatus
    return new Response(JSON.stringify(result), { status: httpStatus, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error'
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: corsHeaders })
  }
})
