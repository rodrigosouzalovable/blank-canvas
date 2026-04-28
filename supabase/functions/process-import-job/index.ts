import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { job_id } = await req.json();
    if (!job_id) {
      return new Response(JSON.stringify({ error: "job_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Fetch the job
    const { data: job, error: jobError } = await supabase
      .from("importacao_jobs")
      .select("*")
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return new Response(
        JSON.stringify({ error: "Job not found", details: jobError?.message }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (job.status !== "pendente") {
      return new Response(
        JSON.stringify({ error: "Job already processed", status: job.status }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Mark as processing
    await supabase
      .from("importacao_jobs")
      .update({ status: "processando" })
      .eq("id", job_id);

    const dados = job.dados_json as any;
    const layout = job.layout as string;
    const userId = job.user_id as string;
    const fileName = job.nome_arquivo as string;
    const credor = job.credor as string;

    let totalInserted = 0;

    try {
      if (layout === "devedores") {
        // Standard devedores insert
        const records = dados.records as any[];
        if (!records || records.length === 0) throw new Error("No records");

        // Create importacao entry
        const { data: importacao } = await supabase
          .from("importacoes")
          .insert({
            nome_arquivo: fileName,
            credor: credor,
            total_registros: records.length,
            importado_por: userId,
          })
          .select("id")
          .single();

        const importacaoId = importacao?.id;

        // Batch insert
        const BATCH = 500;
        for (let i = 0; i < records.length; i += BATCH) {
          const batch = records.slice(i, i + BATCH).map((r: any) => ({
            ...r,
            importado_por: userId,
            arquivo_importacao: fileName,
            importacao_id: importacaoId,
          }));
          const { error } = await supabase.from("devedores").insert(batch);
          if (error) throw new Error(`Batch insert error: ${error.message}`);
          totalInserted += batch.length;

          // Update progress
          await supabase
            .from("importacao_jobs")
            .update({ registros_inseridos: totalInserted })
            .eq("id", job_id);
        }

        // Insert telefones if provided
        if (dados.telefones && dados.telefones.length > 0) {
          const PHONE_BATCH = 500;
          for (let i = 0; i < dados.telefones.length; i += PHONE_BATCH) {
            const batch = dados.telefones.slice(i, i + PHONE_BATCH);
            await supabase.from("devedor_telefones").insert(batch);
          }
        }
      } else if (layout === "acordos") {
        // UME Aporte: create acordos + pagamentos
        const groups = dados.groups as any[];
        if (!groups || groups.length === 0) throw new Error("No groups");

        const { data: importacao } = await supabase
          .from("importacoes")
          .insert({
            nome_arquivo: fileName,
            credor: credor,
            total_registros: groups.length,
            importado_por: userId,
          })
          .select("id")
          .single();

        for (const group of groups) {
          const { data: acordo, error: acordoError } = await supabase
            .from("acordos")
            .insert({
              cliente_nome: group.cliente_nome,
              cliente_cpf: group.cliente_cpf,
              cliente_telefone: group.cliente_telefone || null,
              valor_total: group.valor_total,
              parcelas: group.parcelas,
              valor_parcela: group.valor_parcela,
              data_primeiro_pagamento: group.data_primeiro_pagamento,
              dias_atraso: group.dias_atraso,
              percentual_comissao: group.percentual_comissao,
              comissao_total: group.comissao_total,
              empresa: group.empresa || "ume_novo_mundo",
              user_id: userId,
              status: "ativo",
              duplicado_verificado: true,
            })
            .select("id")
            .single();

          if (acordoError || !acordo) {
            console.error("Erro ao criar acordo:", acordoError);
            continue;
          }

          const pagamentos = group.pagamentos.map((p: any) => ({
            acordo_id: acordo.id,
            numero_parcela: p.numero_parcela,
            data_prevista: p.data_prevista,
            valor_parcela: p.valor_parcela,
            comissao_parcela: p.comissao_parcela,
            status: "pendente",
          }));

          await supabase.from("pagamentos").insert(pagamentos);
          totalInserted++;

          await supabase
            .from("importacao_jobs")
            .update({ registros_inseridos: totalInserted })
            .eq("id", job_id);
        }
      } else if (layout === "pagamentos") {
        // Update pagamentos to pago
        const updates = dados.updates as any[];
        if (!updates || updates.length === 0) throw new Error("No updates");

        for (const upd of updates) {
          const { error } = await supabase
            .from("pagamentos")
            .update({ status: "pago", data_paga: upd.data_paga })
            .eq("id", upd.pagamento_id);
          if (!error) totalInserted++;

          await supabase
            .from("importacao_jobs")
            .update({ registros_inseridos: totalInserted })
            .eq("id", job_id);
        }
      }

      // Mark as done, clear dados_json to save space
      await supabase
        .from("importacao_jobs")
        .update({
          status: "concluido",
          registros_inseridos: totalInserted,
          dados_json: null,
        })
        .eq("id", job_id);
    } catch (err: any) {
      console.error("Import job error:", err);
      await supabase
        .from("importacao_jobs")
        .update({
          status: "erro",
          erro_mensagem: err.message || "Erro desconhecido",
          registros_inseridos: totalInserted,
          dados_json: null,
        })
        .eq("id", job_id);
    }

    return new Response(
      JSON.stringify({ success: true, inserted: totalInserted }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    console.error("Function error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
