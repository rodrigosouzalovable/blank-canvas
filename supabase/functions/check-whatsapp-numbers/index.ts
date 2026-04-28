const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

function formatPhone(phone: string): string {
  const clean = phone.replace(/\D/g, '');
  return clean.startsWith('55') ? clean : `55${clean}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { numbers, server_url, instance_token } = await req.json();

    if (!numbers || !Array.isArray(numbers) || numbers.length === 0) {
      return jsonResponse({ error: 'numbers array é obrigatório' }, 400);
    }
    if (!server_url || !instance_token) {
      return jsonResponse({ error: 'server_url e instance_token são obrigatórios' }, 400);
    }

    const cleanUrl = server_url.replace(/\/+$/, '');
    const formattedNumbers = numbers.map((n: string) => formatPhone(n));

    const valid: string[] = [];
    const invalid: string[] = [];
    const errors: string[] = [];

    const BATCH_SIZE = 50;
    const CONCURRENCY = 5;
    const REQUEST_TIMEOUT_MS = 25000;

    // Build all batches
    const batches: { batch: string[]; originalBatch: string[]; index: number }[] = [];
    for (let i = 0; i < formattedNumbers.length; i += BATCH_SIZE) {
      batches.push({
        batch: formattedNumbers.slice(i, i + BATCH_SIZE),
        originalBatch: numbers.slice(i, i + BATCH_SIZE),
        index: Math.floor(i / BATCH_SIZE) + 1,
      });
    }

    const processItem = (item: any, originalNumber: string) => {
      const hasWhatsApp = item.isInWhatsapp === true ||
                         item.exists === true ||
                         item.numberExists === true ||
                         item.onWhatsapp === true;
      if (hasWhatsApp) {
        valid.push(originalNumber);
      } else {
        invalid.push(originalNumber);
      }
    };

    const processBatch = async ({ batch, originalBatch, index }: { batch: string[]; originalBatch: string[]; index: number }) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        console.log(`Verificando lote ${index}: ${batch.length} números`);
        const response = await fetch(`${cleanUrl}/chat/check`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'token': instance_token,
          },
          body: JSON.stringify({ numbers: batch }),
          signal: controller.signal,
        });

        const text = await response.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          console.error(`Resposta não-JSON: ${text.slice(0, 200)}`);
          originalBatch.forEach((n: string) => errors.push(n));
          return;
        }

        if (data?.code === 504 || data?.message === 'Request timeout') {
          console.error(`Timeout no lote ${index}`);
          originalBatch.forEach((n: string) => errors.push(n));
          return;
        }

        if (!response.ok) {
          console.error(`Erro HTTP ${response.status}: ${JSON.stringify(data).slice(0, 200)}`);
          originalBatch.forEach((n: string) => errors.push(n));
          return;
        }

        const arr = Array.isArray(data)
          ? data
          : Array.isArray(data?.numbers)
          ? data.numbers
          : Array.isArray(data?.result)
          ? data.result
          : null;

        if (!arr) {
          console.error(`Formato desconhecido: ${JSON.stringify(data).slice(0, 300)}`);
          originalBatch.forEach((n: string) => errors.push(n));
          return;
        }

        arr.forEach((item: any, idx: number) => {
          processItem(item, originalBatch[idx] || batch[idx]);
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro desconhecido';
        console.error(`Erro no lote ${index}: ${msg}`);
        originalBatch.forEach((n: string) => errors.push(n));
      } finally {
        clearTimeout(timeoutId);
      }
    };

    // Process with limited concurrency
    for (let i = 0; i < batches.length; i += CONCURRENCY) {
      const slice = batches.slice(i, i + CONCURRENCY);
      await Promise.all(slice.map(processBatch));
    }

    return jsonResponse({
      valid,
      invalid,
      errors,
      total: numbers.length,
      total_valid: valid.length,
      total_invalid: invalid.length,
      total_errors: errors.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    return jsonResponse({ error: message }, 500);
  }
});
