import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      throw new Error('Não autorizado')
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const token = authHeader.replace('Bearer ', '')
    const parts = token.split('.')
    if (parts.length !== 3) throw new Error('Token inválido')

    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
    const callingUserId = payload.sub
    const callingEmail = payload.email

    if (!callingUserId) throw new Error('Usuário não autenticado')

    const { data: isAdmin, error: roleError } = await supabaseClient
      .rpc('has_role', { _user_id: callingUserId, _role: 'admin' })

    if (roleError || !isAdmin) {
      throw new Error('Apenas administradores podem excluir usuários')
    }

    const { userId } = await req.json()

    if (!userId) {
      throw new Error('ID do usuário é obrigatório')
    }

    if (userId === callingUserId) {
      throw new Error('Você não pode excluir sua própria conta')
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Delete related data first (cascade may handle some, but be explicit)
    await supabaseAdmin.from('user_roles').delete().eq('user_id', userId)
    await supabaseAdmin.from('user_permissions').delete().eq('user_id', userId)
    await supabaseAdmin.from('user_whatsapp_instances').delete().eq('user_id', userId)
    await supabaseAdmin.from('user_whatsapp_config').delete().eq('user_id', userId)
    await supabaseAdmin.from('team_members').delete().or(`gestor_id.eq.${userId},funcionario_id.eq.${userId}`)
    await supabaseAdmin.from('metas_funcionarios').delete().eq('user_id', userId)
    await supabaseAdmin.from('lembretes_lidos').delete().eq('user_id', userId)
    await supabaseAdmin.from('profiles').delete().eq('id', userId)

    // Delete from auth.users
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId)

    if (deleteError) {
      console.error('Delete user error:', deleteError)
      throw deleteError
    }

    console.log(`SUCCESS: Admin ${callingEmail} deleted user ${userId}`)

    return new Response(
      JSON.stringify({ success: true, message: 'Usuário excluído com sucesso' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in delete-user-admin:', error)
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido'
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
