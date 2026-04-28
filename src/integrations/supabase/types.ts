export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      acionamento_agendamentos: {
        Row: {
          agendado_para: string
          created_at: string
          historico_data: Json
          id: string
          max_sec: number
          min_sec: number
          status: string
          total_enviados: number
          total_erros: number
          updated_at: string
          user_id: string
        }
        Insert: {
          agendado_para: string
          created_at?: string
          historico_data: Json
          id?: string
          max_sec?: number
          min_sec?: number
          status?: string
          total_enviados?: number
          total_erros?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          agendado_para?: string
          created_at?: string
          historico_data?: Json
          id?: string
          max_sec?: number
          min_sec?: number
          status?: string
          total_enviados?: number
          total_erros?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      acordos: {
        Row: {
          atualizado_em: string
          boleto_enviado: boolean
          cliente_cpf: string | null
          cliente_nome: string
          cliente_telefone: string | null
          comissao_total: number
          criado_em: string
          data_primeiro_pagamento: string
          dias_atraso: number
          duplicado_verificado: boolean
          empresa: string
          id: string
          observacoes: string | null
          parcelas: number
          percentual_comissao: number
          status: string
          user_id: string
          valor_parcela: number
          valor_total: number
        }
        Insert: {
          atualizado_em?: string
          boleto_enviado?: boolean
          cliente_cpf?: string | null
          cliente_nome: string
          cliente_telefone?: string | null
          comissao_total: number
          criado_em?: string
          data_primeiro_pagamento: string
          dias_atraso: number
          duplicado_verificado?: boolean
          empresa?: string
          id?: string
          observacoes?: string | null
          parcelas: number
          percentual_comissao: number
          status?: string
          user_id: string
          valor_parcela: number
          valor_total: number
        }
        Update: {
          atualizado_em?: string
          boleto_enviado?: boolean
          cliente_cpf?: string | null
          cliente_nome?: string
          cliente_telefone?: string | null
          comissao_total?: number
          criado_em?: string
          data_primeiro_pagamento?: string
          dias_atraso?: number
          duplicado_verificado?: boolean
          empresa?: string
          id?: string
          observacoes?: string | null
          parcelas?: number
          percentual_comissao?: number
          status?: string
          user_id?: string
          valor_parcela?: number
          valor_total?: number
        }
        Relationships: []
      }
      acordos_devedor: {
        Row: {
          criado_em: string
          criado_por: string
          data_primeiro_vencimento: string
          devedor_cpf: string
          id: string
          num_parcelas: number
          observacoes: string | null
          status: string
          valor_total: number
        }
        Insert: {
          criado_em?: string
          criado_por: string
          data_primeiro_vencimento: string
          devedor_cpf: string
          id?: string
          num_parcelas: number
          observacoes?: string | null
          status?: string
          valor_total: number
        }
        Update: {
          criado_em?: string
          criado_por?: string
          data_primeiro_vencimento?: string
          devedor_cpf?: string
          id?: string
          num_parcelas?: number
          observacoes?: string | null
          status?: string
          valor_total?: number
        }
        Relationships: []
      }
      ai_alerts_sent: {
        Row: {
          alert_type: string
          created_at: string
          data: string
          function_name: string | null
          id: string
          payload: Json | null
          phone: string | null
        }
        Insert: {
          alert_type: string
          created_at?: string
          data?: string
          function_name?: string | null
          id?: string
          payload?: Json | null
          phone?: string | null
        }
        Update: {
          alert_type?: string
          created_at?: string
          data?: string
          function_name?: string | null
          id?: string
          payload?: Json | null
          phone?: string | null
        }
        Relationships: []
      }
      ai_budget_config: {
        Row: {
          alert_phone: string
          alert_threshold_pct: number
          auto_block_on_limit: boolean
          daily_limit_calls: number
          daily_limit_chars: number
          hourly_limit_calls: number
          id: number
          updated_at: string
        }
        Insert: {
          alert_phone?: string
          alert_threshold_pct?: number
          auto_block_on_limit?: boolean
          daily_limit_calls?: number
          daily_limit_chars?: number
          hourly_limit_calls?: number
          id?: number
          updated_at?: string
        }
        Update: {
          alert_phone?: string
          alert_threshold_pct?: number
          auto_block_on_limit?: boolean
          daily_limit_calls?: number
          daily_limit_chars?: number
          hourly_limit_calls?: number
          id?: number
          updated_at?: string
        }
        Relationships: []
      }
      ai_daily_snapshot: {
        Row: {
          blocked_calls: number
          by_function: Json | null
          data: string
          top_function: string | null
          total_calls: number
          total_chars: number
          updated_at: string
        }
        Insert: {
          blocked_calls?: number
          by_function?: Json | null
          data?: string
          top_function?: string | null
          total_calls?: number
          total_chars?: number
          updated_at?: string
        }
        Update: {
          blocked_calls?: number
          by_function?: Json | null
          data?: string
          top_function?: string | null
          total_calls?: number
          total_chars?: number
          updated_at?: string
        }
        Relationships: []
      }
      ai_function_limits: {
        Row: {
          daily_limit: number
          enabled: boolean
          function_name: string
          updated_at: string
        }
        Insert: {
          daily_limit?: number
          enabled?: boolean
          function_name: string
          updated_at?: string
        }
        Update: {
          daily_limit?: number
          enabled?: boolean
          function_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_usage_log: {
        Row: {
          created_at: string
          error: string | null
          function_name: string
          id: string
          model: string | null
          prompt_chars: number | null
          status: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          error?: string | null
          function_name: string
          id?: string
          model?: string | null
          prompt_chars?: number | null
          status?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          error?: string | null
          function_name?: string
          id?: string
          model?: string | null
          prompt_chars?: number | null
          status?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      aquecimento_contatos_autosave: {
        Row: {
          ativo: boolean
          atualizado_em: string
          criado_em: string
          id: string
          nome: string | null
          numero: string
          respondeu_ultima: boolean
          total_respostas: number
          total_usos: number
          ultimo_uso_em: string | null
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          id?: string
          nome?: string | null
          numero: string
          respondeu_ultima?: boolean
          total_respostas?: number
          total_usos?: number
          ultimo_uso_em?: string | null
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          id?: string
          nome?: string | null
          numero?: string
          respondeu_ultima?: boolean
          total_respostas?: number
          total_usos?: number
          ultimo_uso_em?: string | null
        }
        Relationships: []
      }
      aquecimento_envios_autosave: {
        Row: {
          contato_id: string | null
          enviado_em: string
          id: string
          instancia_id: string
          mensagem_enviada: string
          numero_destino: string | null
          respondeu: boolean
          resposta_em: string | null
        }
        Insert: {
          contato_id?: string | null
          enviado_em?: string
          id?: string
          instancia_id: string
          mensagem_enviada: string
          numero_destino?: string | null
          respondeu?: boolean
          resposta_em?: string | null
        }
        Update: {
          contato_id?: string | null
          enviado_em?: string
          id?: string
          instancia_id?: string
          mensagem_enviada?: string
          numero_destino?: string | null
          respondeu?: boolean
          resposta_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aquecimento_envios_autosave_contato_id_fkey"
            columns: ["contato_id"]
            isOneToOne: false
            referencedRelation: "aquecimento_contatos_autosave"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aquecimento_envios_autosave_instancia_id_fkey"
            columns: ["instancia_id"]
            isOneToOne: false
            referencedRelation: "user_whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      aquecimento_notificacoes: {
        Row: {
          criado_em: string
          id: string
          instancia_id: string | null
          lida: boolean
          mensagem: string
          tipo: string
        }
        Insert: {
          criado_em?: string
          id?: string
          instancia_id?: string | null
          lida?: boolean
          mensagem: string
          tipo: string
        }
        Update: {
          criado_em?: string
          id?: string
          instancia_id?: string | null
          lida?: boolean
          mensagem?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "aquecimento_notificacoes_instancia_id_fkey"
            columns: ["instancia_id"]
            isOneToOne: false
            referencedRelation: "user_whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      auditoria_divergencias: {
        Row: {
          acordo_id: string | null
          arquivo_nome: string
          cpf_planilha: string
          criado_em: string
          data_planilha: string | null
          data_sistema: string | null
          id: string
          nome_planilha: string | null
          nome_sistema: string | null
          pagamento_id: string | null
          parcela_planilha: number | null
          parcela_sistema: number | null
          receita_planilha: number | null
          receita_sistema: number | null
          resolvido: boolean | null
          resolvido_em: string | null
          tipo_divergencia: string
          user_id: string
          valor_planilha: number | null
          valor_sistema: number | null
        }
        Insert: {
          acordo_id?: string | null
          arquivo_nome: string
          cpf_planilha: string
          criado_em?: string
          data_planilha?: string | null
          data_sistema?: string | null
          id?: string
          nome_planilha?: string | null
          nome_sistema?: string | null
          pagamento_id?: string | null
          parcela_planilha?: number | null
          parcela_sistema?: number | null
          receita_planilha?: number | null
          receita_sistema?: number | null
          resolvido?: boolean | null
          resolvido_em?: string | null
          tipo_divergencia: string
          user_id: string
          valor_planilha?: number | null
          valor_sistema?: number | null
        }
        Update: {
          acordo_id?: string | null
          arquivo_nome?: string
          cpf_planilha?: string
          criado_em?: string
          data_planilha?: string | null
          data_sistema?: string | null
          id?: string
          nome_planilha?: string | null
          nome_sistema?: string | null
          pagamento_id?: string | null
          parcela_planilha?: number | null
          parcela_sistema?: number | null
          receita_planilha?: number | null
          receita_sistema?: number | null
          resolvido?: boolean | null
          resolvido_em?: string | null
          tipo_divergencia?: string
          user_id?: string
          valor_planilha?: number | null
          valor_sistema?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "auditoria_divergencias_acordo_id_fkey"
            columns: ["acordo_id"]
            isOneToOne: false
            referencedRelation: "acordos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_divergencias_pagamento_id_fkey"
            columns: ["pagamento_id"]
            isOneToOne: false
            referencedRelation: "pagamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      automacao_comandos: {
        Row: {
          acao: string
          criado_em: string
          erro: string | null
          executado_em: string | null
          id: string
          parametros: Json
          resultado: Json | null
          status: string
          tempo_execucao_ms: number | null
          user_id: string
        }
        Insert: {
          acao: string
          criado_em?: string
          erro?: string | null
          executado_em?: string | null
          id?: string
          parametros?: Json
          resultado?: Json | null
          status?: string
          tempo_execucao_ms?: number | null
          user_id: string
        }
        Update: {
          acao?: string
          criado_em?: string
          erro?: string | null
          executado_em?: string | null
          id?: string
          parametros?: Json
          resultado?: Json | null
          status?: string
          tempo_execucao_ms?: number | null
          user_id?: string
        }
        Relationships: []
      }
      automacao_config: {
        Row: {
          atualizado_em: string
          cobmais_email: string
          cobmais_senha: string
          criado_em: string
          id: string
          server_url: string
          status: string
          user_id: string
        }
        Insert: {
          atualizado_em?: string
          cobmais_email?: string
          cobmais_senha?: string
          criado_em?: string
          id?: string
          server_url?: string
          status?: string
          user_id: string
        }
        Update: {
          atualizado_em?: string
          cobmais_email?: string
          cobmais_senha?: string
          criado_em?: string
          id?: string
          server_url?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      automacao_logs: {
        Row: {
          comando_id: string | null
          criado_em: string
          detalhes: Json | null
          id: string
          mensagem: string
          tipo: string
          user_id: string
        }
        Insert: {
          comando_id?: string | null
          criado_em?: string
          detalhes?: Json | null
          id?: string
          mensagem?: string
          tipo?: string
          user_id: string
        }
        Update: {
          comando_id?: string | null
          criado_em?: string
          detalhes?: Json | null
          id?: string
          mensagem?: string
          tipo?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automacao_logs_comando_id_fkey"
            columns: ["comando_id"]
            isOneToOne: false
            referencedRelation: "automacao_comandos"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_ia_mensagens: {
        Row: {
          content: string
          criado_em: string
          id: string
          image: string | null
          role: string
          user_id: string
        }
        Insert: {
          content: string
          criado_em?: string
          id?: string
          image?: string | null
          role: string
          user_id: string
        }
        Update: {
          content?: string
          criado_em?: string
          id?: string
          image?: string | null
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      chatbot_config: {
        Row: {
          ativo: boolean
          atualizado_em: string
          atualizado_por: string | null
          id: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          atualizado_por?: string | null
          id?: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          atualizado_por?: string | null
          id?: string
        }
        Relationships: []
      }
      chatbot_conversas: {
        Row: {
          atualizado_em: string
          criado_em: string
          dados: Json | null
          etapa: string
          id: string
          instance_token: string | null
          mensagens_pendentes: string[] | null
          server_url: string | null
          telefone: string
          ultimo_webhook_em: string | null
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          dados?: Json | null
          etapa?: string
          id?: string
          instance_token?: string | null
          mensagens_pendentes?: string[] | null
          server_url?: string | null
          telefone: string
          ultimo_webhook_em?: string | null
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          dados?: Json | null
          etapa?: string
          id?: string
          instance_token?: string | null
          mensagens_pendentes?: string[] | null
          server_url?: string | null
          telefone?: string
          ultimo_webhook_em?: string | null
        }
        Relationships: []
      }
      chatbot_regras: {
        Row: {
          ativo: boolean | null
          atualizado_em: string | null
          criado_em: string | null
          gatilho: string
          id: string
          resposta: string
        }
        Insert: {
          ativo?: boolean | null
          atualizado_em?: string | null
          criado_em?: string | null
          gatilho: string
          id?: string
          resposta: string
        }
        Update: {
          ativo?: boolean | null
          atualizado_em?: string | null
          criado_em?: string | null
          gatilho?: string
          id?: string
          resposta?: string
        }
        Relationships: []
      }
      chatbot_templates: {
        Row: {
          ativo: boolean | null
          atualizado_em: string | null
          descricao: string
          etapa: string
          id: string
          template: string
        }
        Insert: {
          ativo?: boolean | null
          atualizado_em?: string | null
          descricao: string
          etapa: string
          id?: string
          template: string
        }
        Update: {
          ativo?: boolean | null
          atualizado_em?: string | null
          descricao?: string
          etapa?: string
          id?: string
          template?: string
        }
        Relationships: []
      }
      cobmais_conhecimento: {
        Row: {
          acao: string
          criado_em: string
          descricao_tela: string | null
          id: string
          nome_fluxo: string
          passo_numero: number
          screenshot_description: string | null
          seletor: string | null
          sessao_id: string
          url_pagina: string | null
          valor: string | null
        }
        Insert: {
          acao: string
          criado_em?: string
          descricao_tela?: string | null
          id?: string
          nome_fluxo: string
          passo_numero: number
          screenshot_description?: string | null
          seletor?: string | null
          sessao_id: string
          url_pagina?: string | null
          valor?: string | null
        }
        Update: {
          acao?: string
          criado_em?: string
          descricao_tela?: string | null
          id?: string
          nome_fluxo?: string
          passo_numero?: number
          screenshot_description?: string | null
          seletor?: string | null
          sessao_id?: string
          url_pagina?: string | null
          valor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cobmais_conhecimento_sessao_id_fkey"
            columns: ["sessao_id"]
            isOneToOne: false
            referencedRelation: "cobmais_sessoes_gravadas"
            referencedColumns: ["id"]
          },
        ]
      }
      cobmais_sessoes_gravadas: {
        Row: {
          criado_em: string
          criado_por: string
          descricao: string | null
          finalizado_em: string | null
          id: string
          nome: string
          status: string
          total_passos: number
        }
        Insert: {
          criado_em?: string
          criado_por: string
          descricao?: string | null
          finalizado_em?: string | null
          id?: string
          nome: string
          status?: string
          total_passos?: number
        }
        Update: {
          criado_em?: string
          criado_por?: string
          descricao?: string | null
          finalizado_em?: string | null
          id?: string
          nome?: string
          status?: string
          total_passos?: number
        }
        Relationships: []
      }
      credor_relatorio_config: {
        Row: {
          ativo: boolean
          credor_slug: string
          criado_em: string
          frequencia: string
          id: string
          telefone: string
          ultimo_envio_mensal: string | null
          ultimo_envio_semanal: string | null
        }
        Insert: {
          ativo?: boolean
          credor_slug: string
          criado_em?: string
          frequencia?: string
          id?: string
          telefone: string
          ultimo_envio_mensal?: string | null
          ultimo_envio_semanal?: string | null
        }
        Update: {
          ativo?: boolean
          credor_slug?: string
          criado_em?: string
          frequencia?: string
          id?: string
          telefone?: string
          ultimo_envio_mensal?: string | null
          ultimo_envio_semanal?: string | null
        }
        Relationships: []
      }
      credor_tokens: {
        Row: {
          ativo: boolean
          credor_slug: string
          criado_em: string
          id: string
          token: string
        }
        Insert: {
          ativo?: boolean
          credor_slug: string
          criado_em?: string
          id?: string
          token: string
        }
        Update: {
          ativo?: boolean
          credor_slug?: string
          criado_em?: string
          id?: string
          token?: string
        }
        Relationships: []
      }
      devedor_eventos: {
        Row: {
          arquivo_nome: string | null
          arquivo_url: string | null
          criado_em: string
          criado_por: string
          descricao: string
          devedor_id: string
          id: string
          tipo: string
        }
        Insert: {
          arquivo_nome?: string | null
          arquivo_url?: string | null
          criado_em?: string
          criado_por: string
          descricao?: string
          devedor_id: string
          id?: string
          tipo: string
        }
        Update: {
          arquivo_nome?: string | null
          arquivo_url?: string | null
          criado_em?: string
          criado_por?: string
          descricao?: string
          devedor_id?: string
          id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "devedor_eventos_devedor_id_fkey"
            columns: ["devedor_id"]
            isOneToOne: false
            referencedRelation: "devedores"
            referencedColumns: ["id"]
          },
        ]
      }
      devedor_telefones: {
        Row: {
          ativo: boolean | null
          autorizado: boolean | null
          criado_em: string | null
          criado_por: string
          devedor_cpf: string
          id: string
          is_contato: boolean | null
          is_whatsapp: boolean | null
          numero: string
          observacao: string | null
          ramal: string | null
          tipo: string
        }
        Insert: {
          ativo?: boolean | null
          autorizado?: boolean | null
          criado_em?: string | null
          criado_por: string
          devedor_cpf: string
          id?: string
          is_contato?: boolean | null
          is_whatsapp?: boolean | null
          numero: string
          observacao?: string | null
          ramal?: string | null
          tipo?: string
        }
        Update: {
          ativo?: boolean | null
          autorizado?: boolean | null
          criado_em?: string | null
          criado_por?: string
          devedor_cpf?: string
          id?: string
          is_contato?: boolean | null
          is_whatsapp?: boolean | null
          numero?: string
          observacao?: string | null
          ramal?: string | null
          tipo?: string
        }
        Relationships: []
      }
      devedores: {
        Row: {
          arquivo_importacao: string | null
          ativo: boolean
          atualizado_em: string
          contrato: string | null
          cpf: string
          credor: string | null
          criado_em: string
          data_vencimento: string | null
          descricao: string | null
          estagio: string
          id: string
          importacao_id: string | null
          importado_por: string | null
          nome: string
          telefone: string | null
          valor_atualizado: number
          valor_original: number
        }
        Insert: {
          arquivo_importacao?: string | null
          ativo?: boolean
          atualizado_em?: string
          contrato?: string | null
          cpf: string
          credor?: string | null
          criado_em?: string
          data_vencimento?: string | null
          descricao?: string | null
          estagio?: string
          id?: string
          importacao_id?: string | null
          importado_por?: string | null
          nome: string
          telefone?: string | null
          valor_atualizado?: number
          valor_original?: number
        }
        Update: {
          arquivo_importacao?: string | null
          ativo?: boolean
          atualizado_em?: string
          contrato?: string | null
          cpf?: string
          credor?: string | null
          criado_em?: string
          data_vencimento?: string | null
          descricao?: string | null
          estagio?: string
          id?: string
          importacao_id?: string | null
          importado_por?: string | null
          nome?: string
          telefone?: string | null
          valor_atualizado?: number
          valor_original?: number
        }
        Relationships: [
          {
            foreignKeyName: "devedores_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "importacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      gastos_empresa: {
        Row: {
          categoria: string
          criado_em: string
          data_referencia: string
          descricao: string | null
          id: string
          recorrente: boolean
          user_id: string
          valor: number
        }
        Insert: {
          categoria: string
          criado_em?: string
          data_referencia: string
          descricao?: string | null
          id?: string
          recorrente?: boolean
          user_id: string
          valor?: number
        }
        Update: {
          categoria?: string
          criado_em?: string
          data_referencia?: string
          descricao?: string | null
          id?: string
          recorrente?: boolean
          user_id?: string
          valor?: number
        }
        Relationships: []
      }
      gastos_funcionarios: {
        Row: {
          categoria: string
          criado_em: string
          data_referencia: string
          descricao: string | null
          funcionario_id: string
          id: string
          recorrente: boolean
          user_id: string
          valor: number
        }
        Insert: {
          categoria: string
          criado_em?: string
          data_referencia: string
          descricao?: string | null
          funcionario_id: string
          id?: string
          recorrente?: boolean
          user_id: string
          valor?: number
        }
        Update: {
          categoria?: string
          criado_em?: string
          data_referencia?: string
          descricao?: string | null
          funcionario_id?: string
          id?: string
          recorrente?: boolean
          user_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "gastos_funcionarios_funcionario_id_fkey"
            columns: ["funcionario_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      grupo_empresarial_membros: {
        Row: {
          cpf_cnpj: string
          criado_em: string
          criado_por: string
          grupo_id: string
          id: string
          nome_grupo: string
        }
        Insert: {
          cpf_cnpj: string
          criado_em?: string
          criado_por: string
          grupo_id?: string
          id?: string
          nome_grupo: string
        }
        Update: {
          cpf_cnpj?: string
          criado_em?: string
          criado_por?: string
          grupo_id?: string
          id?: string
          nome_grupo?: string
        }
        Relationships: []
      }
      importacao_jobs: {
        Row: {
          atualizado_em: string
          credor: string
          criado_em: string
          dados_json: Json | null
          erro_mensagem: string | null
          id: string
          layout: string
          nome_arquivo: string
          registros_inseridos: number
          status: string
          total_registros: number
          user_id: string
        }
        Insert: {
          atualizado_em?: string
          credor?: string
          criado_em?: string
          dados_json?: Json | null
          erro_mensagem?: string | null
          id?: string
          layout?: string
          nome_arquivo: string
          registros_inseridos?: number
          status?: string
          total_registros?: number
          user_id: string
        }
        Update: {
          atualizado_em?: string
          credor?: string
          criado_em?: string
          dados_json?: Json | null
          erro_mensagem?: string | null
          id?: string
          layout?: string
          nome_arquivo?: string
          registros_inseridos?: number
          status?: string
          total_registros?: number
          user_id?: string
        }
        Relationships: []
      }
      importacoes: {
        Row: {
          credor: string
          criado_em: string
          id: string
          importado_por: string
          nome_arquivo: string
          total_registros: number
        }
        Insert: {
          credor: string
          criado_em?: string
          id?: string
          importado_por: string
          nome_arquivo: string
          total_registros?: number
        }
        Update: {
          credor?: string
          criado_em?: string
          id?: string
          importado_por?: string
          nome_arquivo?: string
          total_registros?: number
        }
        Relationships: []
      }
      lembrete_envio_progresso: {
        Row: {
          cliente_nome: string | null
          cliente_telefone: string | null
          criado_em: string
          data_envio: string
          enviado_em: string | null
          erro_mensagem: string | null
          id: string
          pagamento_id: string
          status: string
          user_id: string
        }
        Insert: {
          cliente_nome?: string | null
          cliente_telefone?: string | null
          criado_em?: string
          data_envio?: string
          enviado_em?: string | null
          erro_mensagem?: string | null
          id?: string
          pagamento_id: string
          status?: string
          user_id: string
        }
        Update: {
          cliente_nome?: string | null
          cliente_telefone?: string | null
          criado_em?: string
          data_envio?: string
          enviado_em?: string | null
          erro_mensagem?: string | null
          id?: string
          pagamento_id?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      lembrete_mensagens_templates: {
        Row: {
          ativo: boolean | null
          audio_url: string | null
          botoes_choices: Json | null
          botoes_texto: string | null
          created_at: string | null
          id: string
          mensagem: string
          ordem: number | null
          tipo_lembrete: string
          user_id: string
        }
        Insert: {
          ativo?: boolean | null
          audio_url?: string | null
          botoes_choices?: Json | null
          botoes_texto?: string | null
          created_at?: string | null
          id?: string
          mensagem: string
          ordem?: number | null
          tipo_lembrete: string
          user_id: string
        }
        Update: {
          ativo?: boolean | null
          audio_url?: string | null
          botoes_choices?: Json | null
          botoes_texto?: string | null
          created_at?: string | null
          id?: string
          mensagem?: string
          ordem?: number | null
          tipo_lembrete?: string
          user_id?: string
        }
        Relationships: []
      }
      lembretes_lidos: {
        Row: {
          criado_em: string
          id: string
          pagamento_id: string
          user_id: string
        }
        Insert: {
          criado_em?: string
          id?: string
          pagamento_id: string
          user_id: string
        }
        Update: {
          criado_em?: string
          id?: string
          pagamento_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lembretes_lidos_pagamento_id_fkey"
            columns: ["pagamento_id"]
            isOneToOne: false
            referencedRelation: "pagamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      mentor_conversas: {
        Row: {
          content: string
          criado_em: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          content: string
          criado_em?: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          content?: string
          criado_em?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      metas_funcionarios: {
        Row: {
          atualizado_em: string
          criado_em: string
          id: string
          mes_ano: string
          user_id: string
          valor_meta: number
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          id?: string
          mes_ano: string
          user_id: string
          valor_meta?: number
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          id?: string
          mes_ano?: string
          user_id?: string
          valor_meta?: number
        }
        Relationships: []
      }
      metas_mensais: {
        Row: {
          atualizado_em: string | null
          criado_em: string | null
          id: string
          mes_ano: string
          valor: number
        }
        Insert: {
          atualizado_em?: string | null
          criado_em?: string | null
          id?: string
          mes_ano: string
          valor?: number
        }
        Update: {
          atualizado_em?: string | null
          criado_em?: string | null
          id?: string
          mes_ano?: string
          valor?: number
        }
        Relationships: []
      }
      pagamentos: {
        Row: {
          acordo_id: string
          comissao_parcela: number
          criado_em: string
          data_paga: string | null
          data_prevista: string
          id: string
          numero_parcela: number
          status: string
          valor_parcela: number
        }
        Insert: {
          acordo_id: string
          comissao_parcela: number
          criado_em?: string
          data_paga?: string | null
          data_prevista: string
          id?: string
          numero_parcela: number
          status?: string
          valor_parcela: number
        }
        Update: {
          acordo_id?: string
          comissao_parcela?: number
          criado_em?: string
          data_paga?: string | null
          data_prevista?: string
          id?: string
          numero_parcela?: number
          status?: string
          valor_parcela?: number
        }
        Relationships: [
          {
            foreignKeyName: "pagamentos_acordo_id_fkey"
            columns: ["acordo_id"]
            isOneToOne: false
            referencedRelation: "acordos"
            referencedColumns: ["id"]
          },
        ]
      }
      parcelas_devedor: {
        Row: {
          acordo_id: string
          criado_em: string
          data_pagamento: string | null
          data_vencimento: string
          id: string
          numero_parcela: number
          pago: boolean
          valor: number
        }
        Insert: {
          acordo_id: string
          criado_em?: string
          data_pagamento?: string | null
          data_vencimento: string
          id?: string
          numero_parcela: number
          pago?: boolean
          valor: number
        }
        Update: {
          acordo_id?: string
          criado_em?: string
          data_pagamento?: string | null
          data_vencimento?: string
          id?: string
          numero_parcela?: number
          pago?: boolean
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "parcelas_devedor_acordo_id_fkey"
            columns: ["acordo_id"]
            isOneToOne: false
            referencedRelation: "acordos_devedor"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          ativo: boolean
          atualizado_em: string
          criado_em: string
          email: string
          id: string
          nome: string
          sidebar_order: Json | null
          whatsapp_lembrete_instance_token: string | null
          whatsapp_lembrete_server_url: string | null
          whatsapp_lembretes_habilitado: boolean
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          email: string
          id: string
          nome: string
          sidebar_order?: Json | null
          whatsapp_lembrete_instance_token?: string | null
          whatsapp_lembrete_server_url?: string | null
          whatsapp_lembretes_habilitado?: boolean
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          email?: string
          id?: string
          nome?: string
          sidebar_order?: Json | null
          whatsapp_lembrete_instance_token?: string | null
          whatsapp_lembrete_server_url?: string | null
          whatsapp_lembretes_habilitado?: boolean
        }
        Relationships: []
      }
      receitas_empresa: {
        Row: {
          categoria: string
          criado_em: string
          data_referencia: string
          descricao: string | null
          id: string
          recorrente: boolean
          user_id: string
          valor: number
        }
        Insert: {
          categoria: string
          criado_em?: string
          data_referencia: string
          descricao?: string | null
          id?: string
          recorrente?: boolean
          user_id: string
          valor?: number
        }
        Update: {
          categoria?: string
          criado_em?: string
          data_referencia?: string
          descricao?: string | null
          id?: string
          recorrente?: boolean
          user_id?: string
          valor?: number
        }
        Relationships: []
      }
      relatorio_diario_config: {
        Row: {
          ativo: boolean
          atualizado_em: string
          criado_em: string
          id: string
          instancia_id: string
          telefone_destino: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          id?: string
          instancia_id: string
          telefone_destino: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          id?: string
          instancia_id?: string
          telefone_destino?: string
        }
        Relationships: [
          {
            foreignKeyName: "relatorio_diario_config_instancia_id_fkey"
            columns: ["instancia_id"]
            isOneToOne: false
            referencedRelation: "user_whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      relatorios_diarios_enviados: {
        Row: {
          atualizado_em: string
          conteudo: string | null
          criado_em: string
          data: string
          enviado_em: string | null
          erro: string | null
          id: string
          instancia_utilizada_id: string | null
          instancia_utilizada_nome: string | null
          status: string
          tentativas: number
        }
        Insert: {
          atualizado_em?: string
          conteudo?: string | null
          criado_em?: string
          data: string
          enviado_em?: string | null
          erro?: string | null
          id?: string
          instancia_utilizada_id?: string | null
          instancia_utilizada_nome?: string | null
          status?: string
          tentativas?: number
        }
        Update: {
          atualizado_em?: string
          conteudo?: string | null
          criado_em?: string
          data?: string
          enviado_em?: string | null
          erro?: string | null
          id?: string
          instancia_utilizada_id?: string | null
          instancia_utilizada_nome?: string | null
          status?: string
          tentativas?: number
        }
        Relationships: []
      }
      retornos: {
        Row: {
          atualizado_em: string
          cliente_cpf: string
          cliente_nome: string
          cliente_telefone: string
          criado_em: string
          data_primeiro_pagamento: string | null
          data_retorno: string
          id: string
          numero_parcelas: number | null
          observacao: string | null
          status: string
          user_id: string
          valor_demais_parcelas: number | null
          valor_primeira_parcela: number | null
          valor_total: number | null
          whatsapp_enviado_em: string | null
        }
        Insert: {
          atualizado_em?: string
          cliente_cpf: string
          cliente_nome: string
          cliente_telefone: string
          criado_em?: string
          data_primeiro_pagamento?: string | null
          data_retorno: string
          id?: string
          numero_parcelas?: number | null
          observacao?: string | null
          status?: string
          user_id: string
          valor_demais_parcelas?: number | null
          valor_primeira_parcela?: number | null
          valor_total?: number | null
          whatsapp_enviado_em?: string | null
        }
        Update: {
          atualizado_em?: string
          cliente_cpf?: string
          cliente_nome?: string
          cliente_telefone?: string
          criado_em?: string
          data_primeiro_pagamento?: string | null
          data_retorno?: string
          id?: string
          numero_parcelas?: number | null
          observacao?: string | null
          status?: string
          user_id?: string
          valor_demais_parcelas?: number | null
          valor_primeira_parcela?: number | null
          valor_total?: number | null
          whatsapp_enviado_em?: string | null
        }
        Relationships: []
      }
      system_config: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      team_members: {
        Row: {
          criado_em: string
          funcionario_id: string
          gestor_id: string
          id: string
        }
        Insert: {
          criado_em?: string
          funcionario_id: string
          gestor_id: string
          id?: string
        }
        Update: {
          criado_em?: string
          funcionario_id?: string
          gestor_id?: string
          id?: string
        }
        Relationships: []
      }
      user_permissions: {
        Row: {
          abas_permitidas: string[]
          acordos_compartilhados: boolean
          atualizado_em: string
          concedido_por: string | null
          credores: string[]
          criado_em: string
          id: string
          inbox_compartilhado: boolean
          permite_cpf_duplicado: boolean
          user_id: string
          visivel_ranking: boolean
        }
        Insert: {
          abas_permitidas?: string[]
          acordos_compartilhados?: boolean
          atualizado_em?: string
          concedido_por?: string | null
          credores?: string[]
          criado_em?: string
          id?: string
          inbox_compartilhado?: boolean
          permite_cpf_duplicado?: boolean
          user_id: string
          visivel_ranking?: boolean
        }
        Update: {
          abas_permitidas?: string[]
          acordos_compartilhados?: boolean
          atualizado_em?: string
          concedido_por?: string | null
          credores?: string[]
          criado_em?: string
          id?: string
          inbox_compartilhado?: boolean
          permite_cpf_duplicado?: boolean
          user_id?: string
          visivel_ranking?: boolean
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          criado_em: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          criado_em?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          criado_em?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_whatsapp_config: {
        Row: {
          atualizado_em: string | null
          criado_em: string | null
          id: string
          instance_token: string
          provider: string
          server_url: string
          user_id: string
        }
        Insert: {
          atualizado_em?: string | null
          criado_em?: string | null
          id?: string
          instance_token: string
          provider?: string
          server_url: string
          user_id: string
        }
        Update: {
          atualizado_em?: string | null
          criado_em?: string | null
          id?: string
          instance_token?: string
          provider?: string
          server_url?: string
          user_id?: string
        }
        Relationships: []
      }
      user_whatsapp_instances: {
        Row: {
          apenas_lembretes: boolean
          ativo: boolean
          criado_em: string
          ia_responde: boolean
          id: string
          instance_token: string
          nome: string | null
          ordem: number | null
          robo: boolean
          server_url: string
          telefone: string | null
          tipo: string | null
          user_id: string
          webhook_configurado_em: string | null
          whatsapp_profile_address: string | null
          whatsapp_profile_description: string | null
          whatsapp_profile_email: string | null
          whatsapp_profile_name: string | null
          whatsapp_profile_photo_url: string | null
        }
        Insert: {
          apenas_lembretes?: boolean
          ativo?: boolean
          criado_em?: string
          ia_responde?: boolean
          id?: string
          instance_token: string
          nome?: string | null
          ordem?: number | null
          robo?: boolean
          server_url: string
          telefone?: string | null
          tipo?: string | null
          user_id: string
          webhook_configurado_em?: string | null
          whatsapp_profile_address?: string | null
          whatsapp_profile_description?: string | null
          whatsapp_profile_email?: string | null
          whatsapp_profile_name?: string | null
          whatsapp_profile_photo_url?: string | null
        }
        Update: {
          apenas_lembretes?: boolean
          ativo?: boolean
          criado_em?: string
          ia_responde?: boolean
          id?: string
          instance_token?: string
          nome?: string | null
          ordem?: number | null
          robo?: boolean
          server_url?: string
          telefone?: string | null
          tipo?: string | null
          user_id?: string
          webhook_configurado_em?: string | null
          whatsapp_profile_address?: string | null
          whatsapp_profile_description?: string | null
          whatsapp_profile_email?: string | null
          whatsapp_profile_name?: string | null
          whatsapp_profile_photo_url?: string | null
        }
        Relationships: []
      }
      voice_campaign_audios: {
        Row: {
          audio_url: string
          campaign_id: string
          created_at: string
          file_name: string
          id: string
        }
        Insert: {
          audio_url: string
          campaign_id: string
          created_at?: string
          file_name: string
          id?: string
        }
        Update: {
          audio_url?: string
          campaign_id?: string
          created_at?: string
          file_name?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_campaign_audios_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "voice_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_campaign_contacts: {
        Row: {
          answered_at: string | null
          call_id: string | null
          call_type: string | null
          campaign_id: string
          created_at: string
          duration: number | null
          enviado_em: string | null
          erro_mensagem: string | null
          id: string
          nome: string | null
          status: string
          telefone: string
        }
        Insert: {
          answered_at?: string | null
          call_id?: string | null
          call_type?: string | null
          campaign_id: string
          created_at?: string
          duration?: number | null
          enviado_em?: string | null
          erro_mensagem?: string | null
          id?: string
          nome?: string | null
          status?: string
          telefone: string
        }
        Update: {
          answered_at?: string | null
          call_id?: string | null
          call_type?: string | null
          campaign_id?: string
          created_at?: string
          duration?: number | null
          enviado_em?: string | null
          erro_mensagem?: string | null
          id?: string
          nome?: string | null
          status?: string
          telefone?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_campaign_contacts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "voice_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_campaigns: {
        Row: {
          audio_url: string | null
          campaign_type: string | null
          created_at: string
          finished_at: string | null
          id: string
          name: string
          started_at: string | null
          status: string
          total_contacts: number
          total_errors: number
          total_sent: number
          user_id: string
        }
        Insert: {
          audio_url?: string | null
          campaign_type?: string | null
          created_at?: string
          finished_at?: string | null
          id?: string
          name: string
          started_at?: string | null
          status?: string
          total_contacts?: number
          total_errors?: number
          total_sent?: number
          user_id: string
        }
        Update: {
          audio_url?: string | null
          campaign_type?: string | null
          created_at?: string
          finished_at?: string | null
          id?: string
          name?: string
          started_at?: string | null
          status?: string
          total_contacts?: number
          total_errors?: number
          total_sent?: number
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_aquecimento_agendamentos: {
        Row: {
          agendado_para: string
          conteudo: string | null
          created_at: string
          id: string
          instancia_destino_id: string
          instancia_origem_id: string
          interacao_id: string | null
          status: string
          tipo: string
        }
        Insert: {
          agendado_para: string
          conteudo?: string | null
          created_at?: string
          id?: string
          instancia_destino_id: string
          instancia_origem_id: string
          interacao_id?: string | null
          status?: string
          tipo: string
        }
        Update: {
          agendado_para?: string
          conteudo?: string | null
          created_at?: string
          id?: string
          instancia_destino_id?: string
          instancia_origem_id?: string
          interacao_id?: string | null
          status?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_aquecimento_agendamentos_instancia_destino_id_fkey"
            columns: ["instancia_destino_id"]
            isOneToOne: false
            referencedRelation: "user_whatsapp_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_aquecimento_agendamentos_instancia_origem_id_fkey"
            columns: ["instancia_origem_id"]
            isOneToOne: false
            referencedRelation: "user_whatsapp_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_aquecimento_agendamentos_interacao_id_fkey"
            columns: ["interacao_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_aquecimento_interacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_aquecimento_config: {
        Row: {
          chave: string
          descricao: string | null
          id: string
          updated_at: string
          valor: Json
        }
        Insert: {
          chave: string
          descricao?: string | null
          id?: string
          updated_at?: string
          valor: Json
        }
        Update: {
          chave?: string
          descricao?: string | null
          id?: string
          updated_at?: string
          valor?: Json
        }
        Relationships: []
      }
      whatsapp_aquecimento_dialogos: {
        Row: {
          ativo: boolean
          conteudo: string
          conteudo_resposta_esperada: string | null
          created_at: string
          fase_minima: number
          id: string
          tags: string[] | null
          tipo: string
        }
        Insert: {
          ativo?: boolean
          conteudo: string
          conteudo_resposta_esperada?: string | null
          created_at?: string
          fase_minima?: number
          id?: string
          tags?: string[] | null
          tipo: string
        }
        Update: {
          ativo?: boolean
          conteudo?: string
          conteudo_resposta_esperada?: string | null
          created_at?: string
          fase_minima?: number
          id?: string
          tags?: string[] | null
          tipo?: string
        }
        Relationships: []
      }
      whatsapp_aquecimento_grupo_membros: {
        Row: {
          adicionado_em: string | null
          atualizado_em: string
          criado_em: string
          erro_mensagem: string | null
          grupo_id: string
          id: string
          instancia_id: string
          invite_link: string | null
          status: string
          tentativas: number
          ultima_tentativa_em: string | null
        }
        Insert: {
          adicionado_em?: string | null
          atualizado_em?: string
          criado_em?: string
          erro_mensagem?: string | null
          grupo_id: string
          id?: string
          instancia_id: string
          invite_link?: string | null
          status?: string
          tentativas?: number
          ultima_tentativa_em?: string | null
        }
        Update: {
          adicionado_em?: string | null
          atualizado_em?: string
          criado_em?: string
          erro_mensagem?: string | null
          grupo_id?: string
          id?: string
          instancia_id?: string
          invite_link?: string | null
          status?: string
          tentativas?: number
          ultima_tentativa_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_aquecimento_grupo_membros_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_aquecimento_grupos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_aquecimento_grupo_membros_instancia_id_fkey"
            columns: ["instancia_id"]
            isOneToOne: false
            referencedRelation: "user_whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_aquecimento_grupos: {
        Row: {
          ativo: boolean
          atualizado_em: string
          auto_add_novas: boolean
          criado_em: string
          group_jid: string
          id: string
          instancia_admin_id: string
          nome: string
          ultimo_erro: string | null
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          auto_add_novas?: boolean
          criado_em?: string
          group_jid: string
          id?: string
          instancia_admin_id: string
          nome: string
          ultimo_erro?: string | null
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          auto_add_novas?: boolean
          criado_em?: string
          group_jid?: string
          id?: string
          instancia_admin_id?: string
          nome?: string
          ultimo_erro?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_aquecimento_grupos_instancia_admin_id_fkey"
            columns: ["instancia_admin_id"]
            isOneToOne: false
            referencedRelation: "user_whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_aquecimento_instancias: {
        Row: {
          created_at: string
          dias_na_fase: number
          fase: number
          fase_auto: boolean
          id: string
          instancia_id: string
          interacoes_hoje: number
          interacoes_total: number
          limite_diario: number
          respostas_recebidas: number
          status: string
          ultima_interacao: string | null
          ultimo_aviso_falha: string | null
          ultimo_parceiro_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          dias_na_fase?: number
          fase?: number
          fase_auto?: boolean
          id?: string
          instancia_id: string
          interacoes_hoje?: number
          interacoes_total?: number
          limite_diario?: number
          respostas_recebidas?: number
          status?: string
          ultima_interacao?: string | null
          ultimo_aviso_falha?: string | null
          ultimo_parceiro_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          dias_na_fase?: number
          fase?: number
          fase_auto?: boolean
          id?: string
          instancia_id?: string
          interacoes_hoje?: number
          interacoes_total?: number
          limite_diario?: number
          respostas_recebidas?: number
          status?: string
          ultima_interacao?: string | null
          ultimo_aviso_falha?: string | null
          ultimo_parceiro_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_aquecimento_instancias_instancia_id_fkey"
            columns: ["instancia_id"]
            isOneToOne: true
            referencedRelation: "user_whatsapp_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_aquecimento_instancias_ultimo_parceiro_id_fkey"
            columns: ["ultimo_parceiro_id"]
            isOneToOne: false
            referencedRelation: "user_whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_aquecimento_interacoes: {
        Row: {
          conteudo: string | null
          conteudo_resposta: string | null
          created_at: string
          entregue_em: string | null
          enviado_em: string | null
          id: string
          instancia_destino_id: string
          instancia_origem_id: string
          mensagem_id: string | null
          respondido_em: string | null
          status: string
          tempo_resposta_segundos: number | null
          tipo: string
          tipo_interacao: string
        }
        Insert: {
          conteudo?: string | null
          conteudo_resposta?: string | null
          created_at?: string
          entregue_em?: string | null
          enviado_em?: string | null
          id?: string
          instancia_destino_id: string
          instancia_origem_id: string
          mensagem_id?: string | null
          respondido_em?: string | null
          status?: string
          tempo_resposta_segundos?: number | null
          tipo: string
          tipo_interacao?: string
        }
        Update: {
          conteudo?: string | null
          conteudo_resposta?: string | null
          created_at?: string
          entregue_em?: string | null
          enviado_em?: string | null
          id?: string
          instancia_destino_id?: string
          instancia_origem_id?: string
          mensagem_id?: string | null
          respondido_em?: string | null
          status?: string
          tempo_resposta_segundos?: number | null
          tipo?: string
          tipo_interacao?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_aquecimento_interacoes_instancia_destino_id_fkey"
            columns: ["instancia_destino_id"]
            isOneToOne: false
            referencedRelation: "user_whatsapp_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_aquecimento_interacoes_instancia_origem_id_fkey"
            columns: ["instancia_origem_id"]
            isOneToOne: false
            referencedRelation: "user_whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_aquecimento_status_log: {
        Row: {
          conteudo: string | null
          conteudo_url: string | null
          id: string
          instancia_id: string
          postado_em: string
          resultado: string
          tipo: string
        }
        Insert: {
          conteudo?: string | null
          conteudo_url?: string | null
          id?: string
          instancia_id: string
          postado_em?: string
          resultado?: string
          tipo?: string
        }
        Update: {
          conteudo?: string | null
          conteudo_url?: string | null
          id?: string
          instancia_id?: string
          postado_em?: string
          resultado?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_aquecimento_status_log_instancia_id_fkey"
            columns: ["instancia_id"]
            isOneToOne: false
            referencedRelation: "user_whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_contato_etiquetas: {
        Row: {
          contato_id: string
          criado_em: string
          etiqueta_id: string
          id: string
        }
        Insert: {
          contato_id: string
          criado_em?: string
          etiqueta_id: string
          id?: string
        }
        Update: {
          contato_id?: string
          criado_em?: string
          etiqueta_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_contato_etiquetas_contato_id_fkey"
            columns: ["contato_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_contatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_contato_etiquetas_etiqueta_id_fkey"
            columns: ["etiqueta_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_etiquetas"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_contatos: {
        Row: {
          arquivado: boolean
          criado_em: string
          fixado: boolean
          id: string
          instancia_id: string
          nao_lido: number
          nome: string | null
          telefone: string
          ultima_mensagem: string | null
          ultima_mensagem_em: string | null
        }
        Insert: {
          arquivado?: boolean
          criado_em?: string
          fixado?: boolean
          id?: string
          instancia_id: string
          nao_lido?: number
          nome?: string | null
          telefone: string
          ultima_mensagem?: string | null
          ultima_mensagem_em?: string | null
        }
        Update: {
          arquivado?: boolean
          criado_em?: string
          fixado?: boolean
          id?: string
          instancia_id?: string
          nao_lido?: number
          nome?: string | null
          telefone?: string
          ultima_mensagem?: string | null
          ultima_mensagem_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_contatos_instancia_id_fkey"
            columns: ["instancia_id"]
            isOneToOne: false
            referencedRelation: "user_whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_contatos_agenda_salvos: {
        Row: {
          instancia_id: string
          nome_salvo: string | null
          numero_destino: string
          salvo_em: string
        }
        Insert: {
          instancia_id: string
          nome_salvo?: string | null
          numero_destino: string
          salvo_em?: string
        }
        Update: {
          instancia_id?: string
          nome_salvo?: string | null
          numero_destino?: string
          salvo_em?: string
        }
        Relationships: []
      }
      whatsapp_conversas_auditoria: {
        Row: {
          created_at: string
          etapa: string
          http_status: number | null
          id: string
          instancia_destino_id: string | null
          instancia_origem_id: string | null
          mensagem_original: string | null
          motivo: string | null
          numero_destino: string | null
          numero_origem: string | null
          resposta_gerada: string | null
          status: string
          tempo_resposta_ms: number | null
        }
        Insert: {
          created_at?: string
          etapa: string
          http_status?: number | null
          id?: string
          instancia_destino_id?: string | null
          instancia_origem_id?: string | null
          mensagem_original?: string | null
          motivo?: string | null
          numero_destino?: string | null
          numero_origem?: string | null
          resposta_gerada?: string | null
          status: string
          tempo_resposta_ms?: number | null
        }
        Update: {
          created_at?: string
          etapa?: string
          http_status?: number | null
          id?: string
          instancia_destino_id?: string | null
          instancia_origem_id?: string | null
          mensagem_original?: string | null
          motivo?: string | null
          numero_destino?: string | null
          numero_origem?: string | null
          resposta_gerada?: string | null
          status?: string
          tempo_resposta_ms?: number | null
        }
        Relationships: []
      }
      whatsapp_conversas_ia: {
        Row: {
          historico: Json
          id: string
          inicio_em: string
          instancia_destino_id: string | null
          instancia_origem_id: string | null
          max_trocas: number
          status: string
          total_trocas: number
          ultima_msg_em: string
        }
        Insert: {
          historico?: Json
          id?: string
          inicio_em?: string
          instancia_destino_id?: string | null
          instancia_origem_id?: string | null
          max_trocas?: number
          status?: string
          total_trocas?: number
          ultima_msg_em?: string
        }
        Update: {
          historico?: Json
          id?: string
          inicio_em?: string
          instancia_destino_id?: string | null
          instancia_origem_id?: string | null
          max_trocas?: number
          status?: string
          total_trocas?: number
          ultima_msg_em?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_conversas_ia_instancia_destino_id_fkey"
            columns: ["instancia_destino_id"]
            isOneToOne: false
            referencedRelation: "user_whatsapp_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversas_ia_instancia_origem_id_fkey"
            columns: ["instancia_origem_id"]
            isOneToOne: false
            referencedRelation: "user_whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_dialogos_pool: {
        Row: {
          ativo: boolean
          contexto: string
          created_at: string
          fase_minima: number
          gatilho: string[]
          id: string
          peso: number
          resposta: string
          tipo: string
          vezes_utilizada: number
        }
        Insert: {
          ativo?: boolean
          contexto: string
          created_at?: string
          fase_minima?: number
          gatilho?: string[]
          id?: string
          peso?: number
          resposta: string
          tipo?: string
          vezes_utilizada?: number
        }
        Update: {
          ativo?: boolean
          contexto?: string
          created_at?: string
          fase_minima?: number
          gatilho?: string[]
          id?: string
          peso?: number
          resposta?: string
          tipo?: string
          vezes_utilizada?: number
        }
        Relationships: []
      }
      whatsapp_dialogos_uso: {
        Row: {
          dialogo_id: string
          id: string
          numero_destino: string
          usado_em: string
        }
        Insert: {
          dialogo_id: string
          id?: string
          numero_destino: string
          usado_em?: string
        }
        Update: {
          dialogo_id?: string
          id?: string
          numero_destino?: string
          usado_em?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_dialogos_uso_dialogo_id_fkey"
            columns: ["dialogo_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_dialogos_pool"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_etiquetas: {
        Row: {
          cor: string
          criado_em: string
          id: string
          nome: string
          user_id: string
        }
        Insert: {
          cor?: string
          criado_em?: string
          id?: string
          nome: string
          user_id: string
        }
        Update: {
          cor?: string
          criado_em?: string
          id?: string
          nome?: string
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_fila: {
        Row: {
          agendado_para: string
          cliente_nome: string | null
          criado_em: string | null
          enviado_em: string | null
          erro_mensagem: string | null
          id: string
          instance_token: string | null
          mensagem: string
          pagamento_id: string
          server_url: string | null
          status: string | null
          telefone: string
          tipo_lembrete: string
        }
        Insert: {
          agendado_para: string
          cliente_nome?: string | null
          criado_em?: string | null
          enviado_em?: string | null
          erro_mensagem?: string | null
          id?: string
          instance_token?: string | null
          mensagem: string
          pagamento_id: string
          server_url?: string | null
          status?: string | null
          telefone: string
          tipo_lembrete: string
        }
        Update: {
          agendado_para?: string
          cliente_nome?: string | null
          criado_em?: string | null
          enviado_em?: string | null
          erro_mensagem?: string | null
          id?: string
          instance_token?: string | null
          mensagem?: string
          pagamento_id?: string
          server_url?: string | null
          status?: string | null
          telefone?: string
          tipo_lembrete?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_fila_pagamento_id_fkey"
            columns: ["pagamento_id"]
            isOneToOne: false
            referencedRelation: "pagamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_lembretes_log: {
        Row: {
          enviado_em: string | null
          erro_mensagem: string | null
          id: string
          pagamento_id: string
          sucesso: boolean | null
          tipo_lembrete: string
        }
        Insert: {
          enviado_em?: string | null
          erro_mensagem?: string | null
          id?: string
          pagamento_id: string
          sucesso?: boolean | null
          tipo_lembrete: string
        }
        Update: {
          enviado_em?: string | null
          erro_mensagem?: string | null
          id?: string
          pagamento_id?: string
          sucesso?: boolean | null
          tipo_lembrete?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_lembretes_log_pagamento_id_fkey"
            columns: ["pagamento_id"]
            isOneToOne: false
            referencedRelation: "pagamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_mensagens: {
        Row: {
          conteudo: string
          criado_em: string
          direcao: string
          id: string
          instancia_id: string
          lida: boolean
          media_url: string | null
          nome_contato: string | null
          telefone_remoto: string
          timestamp_msg: string
          tipo_conteudo: string
          whatsapp_msg_id: string | null
        }
        Insert: {
          conteudo?: string
          criado_em?: string
          direcao?: string
          id?: string
          instancia_id: string
          lida?: boolean
          media_url?: string | null
          nome_contato?: string | null
          telefone_remoto: string
          timestamp_msg?: string
          tipo_conteudo?: string
          whatsapp_msg_id?: string | null
        }
        Update: {
          conteudo?: string
          criado_em?: string
          direcao?: string
          id?: string
          instancia_id?: string
          lida?: boolean
          media_url?: string | null
          nome_contato?: string | null
          telefone_remoto?: string
          timestamp_msg?: string
          tipo_conteudo?: string
          whatsapp_msg_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_mensagens_instancia_id_fkey"
            columns: ["instancia_id"]
            isOneToOne: false
            referencedRelation: "user_whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_mensagens_rapidas: {
        Row: {
          arquivado: boolean
          audio_url: string | null
          botoes_choices: Json | null
          botoes_texto: string | null
          conteudo: string | null
          criado_em: string
          id: string
          ordem: number | null
          tipo: string
          titulo: string
          user_id: string
        }
        Insert: {
          arquivado?: boolean
          audio_url?: string | null
          botoes_choices?: Json | null
          botoes_texto?: string | null
          conteudo?: string | null
          criado_em?: string
          id?: string
          ordem?: number | null
          tipo?: string
          titulo: string
          user_id: string
        }
        Update: {
          arquivado?: boolean
          audio_url?: string | null
          botoes_choices?: Json | null
          botoes_texto?: string | null
          conteudo?: string | null
          criado_em?: string
          id?: string
          ordem?: number | null
          tipo?: string
          titulo?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      buscar_devedores_por_documento: {
        Args: { p_credor?: string; p_doc: string }
        Returns: {
          contrato: string
          cpf: string
          credor: string
          data_vencimento: string
          descricao: string
          estagio: string
          id: string
          nome: string
          telefone: string
          valor_atualizado: number
          valor_original: number
        }[]
      }
      chatbot_append_buffer: {
        Args: { p_telefone: string; p_texto: string; p_timestamp: string }
        Returns: undefined
      }
      comparativo_mensal_global: {
        Args: {
          p_fim_anterior: string
          p_fim_atual: string
          p_inicio_anterior: string
          p_inicio_atual: string
        }
        Returns: Json
      }
      consultar_acordo_ativo_por_cpf: {
        Args: { p_cpf: string }
        Returns: {
          acordo_criado_em: string
          acordo_status: string
          funcionario_nome: string
        }[]
      }
      consultar_debitos_por_cpf: {
        Args: { p_cpf: string }
        Returns: {
          contrato: string
          cpf: string
          credor: string
          data_vencimento: string
          descricao: string
          id: string
          nome: string
          valor_atualizado: number
          valor_original: number
        }[]
      }
      consultar_parcelas_acordo_por_cpf: {
        Args: { p_cpf: string }
        Returns: {
          data_paga: string
          data_prevista: string
          numero_parcela: number
          status: string
          total_parcelas: number
          valor_parcela: number
          valor_total_acordo: number
        }[]
      }
      contar_acordos_hoje: { Args: never; Returns: number }
      contar_acordos_hoje_por_usuario: {
        Args: { p_user_id?: string }
        Returns: number
      }
      cpf_acordo_funcionario_nome: { Args: { p_cpf: string }; Returns: string }
      cpf_has_acordo: { Args: { p_cpf: string }; Returns: boolean }
      cpf_normalize: { Args: { cpf_input: string }; Returns: string }
      cpf_ultimo_acordo_quebrado: { Args: { p_cpf: string }; Returns: boolean }
      delete_acordo_atomico: {
        Args: { p_acordo_id: string }
        Returns: undefined
      }
      delete_importacao_em_lotes: {
        Args: { p_importacao_id: string }
        Returns: Json
      }
      get_acordos_compartilhados_admin: {
        Args: { _user_id: string }
        Returns: string
      }
      has_inbox_compartilhado: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin_user: { Args: { uid: string }; Returns: boolean }
      listar_credores_distintos: {
        Args: never
        Returns: {
          credor: string
        }[]
      }
      listar_devedores_por_credor: {
        Args: { p_credor: string }
        Returns: {
          contrato: string
          cpf: string
          credor: string
          data_vencimento: string
          descricao: string
          estagio: string
          id: string
          nome: string
          telefone: string
          tem_acordo: boolean
          valor_atualizado: number
          valor_original: number
        }[]
      }
      listar_funcionarios: {
        Args: never
        Returns: {
          nome: string
          user_id: string
        }[]
      }
      owns_whatsapp_instance: { Args: { inst_id: string }; Returns: boolean }
      ranking_mensal: {
        Args: { p_mes_ano?: string }
        Returns: {
          nome: string
          total_recebido: number
          user_id: string
        }[]
      }
    }
    Enums: {
      app_role: "funcionario" | "gestor" | "admin"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["funcionario", "gestor", "admin"],
    },
  },
} as const
