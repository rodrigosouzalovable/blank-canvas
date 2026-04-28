import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

    // Find expired media messages
    const { data: expiredMessages, error: fetchError } = await supabase
      .from('whatsapp_mensagens')
      .select('id, media_url')
      .not('media_url', 'is', null)
      .lt('criado_em', threeDaysAgo)
      .limit(500);

    if (fetchError) throw fetchError;
    if (!expiredMessages || expiredMessages.length === 0) {
      return new Response(JSON.stringify({ success: true, cleaned: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[CLEANUP] Encontradas ${expiredMessages.length} mensagens com mídia expirada`);

    // Extract storage paths from URLs
    const storagePaths: string[] = [];
    for (const msg of expiredMessages) {
      if (msg.media_url) {
        const match = msg.media_url.match(/\/storage\/v1\/object\/public\/inbox-media\/(.+)/);
        if (match) storagePaths.push(match[1]);
      }
    }

    // Delete files from storage
    if (storagePaths.length > 0) {
      const { error: deleteError } = await supabase.storage
        .from('inbox-media')
        .remove(storagePaths);
      if (deleteError) {
        console.error('[CLEANUP] Erro ao deletar arquivos:', deleteError);
      } else {
        console.log(`[CLEANUP] ${storagePaths.length} arquivos deletados do storage`);
      }
    }

    // Update messages
    const ids = expiredMessages.map(m => m.id);
    const { error: updateError } = await supabase
      .from('whatsapp_mensagens')
      .update({
        conteudo: 'Acesse seu WhatsApp para ver este arquivo',
        media_url: null,
      })
      .in('id', ids);

    if (updateError) throw updateError;

    console.log(`[CLEANUP] ${ids.length} mensagens atualizadas`);

    return new Response(JSON.stringify({ success: true, cleaned: ids.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Erro cleanup-inbox-media:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
