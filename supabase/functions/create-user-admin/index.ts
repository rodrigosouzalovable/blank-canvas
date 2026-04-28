import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // 1. Verificar autenticação
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('Não autorizado')
    }

    // 2. Criar cliente com token do usuário
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    // 3. Obter usuário atual
    const { data: { user: callingUser }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !callingUser) {
      console.error('Auth error:', userError)
      throw new Error('Usuário não autenticado')
    }

    // 4. Verificar se é admin
    const { data: isAdmin, error: roleError } = await supabaseClient
      .rpc('has_role', { _user_id: callingUser.id, _role: 'admin' })

    if (roleError) {
      console.error('Role check error:', roleError)
      throw new Error('Erro ao verificar permissões')
    }
    
    if (!isAdmin) {
      console.error(`User ${callingUser.email} attempted to create user without admin role`)
      throw new Error('Apenas administradores podem criar usuários')
    }

    // 5. Obter dados da requisição
    const { nome, email, password } = await req.json()
    
    if (!nome || !email || !password) {
      throw new Error('Nome, email e senha são obrigatórios')
    }

    if (password.length < 6) {
      throw new Error('A senha deve ter pelo menos 6 caracteres')
    }

    // 6. Criar cliente admin
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // 7. Criar usuário no auth.users
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirma o email
      user_metadata: { nome }
    })

    if (createError) {
      console.error('Create user error:', createError)
      throw createError
    }

    // 8. Log de sucesso
    console.log(`SUCCESS: Admin ${callingUser.email} created user ${email} (ID: ${newUser.user.id})`)

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Usuário criado com sucesso',
        userId: newUser.user.id 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in create-user-admin:', error)
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido'
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
