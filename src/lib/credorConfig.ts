import logoGrupoAltum from '@/assets/logo-grupo-altum.png';
import logoGrupoAltumNegociacao from '@/assets/logo-grupo-altum-negociacao.png';
import logoSouzaRibeiro from '@/assets/logo-souza-ribeiro.png';
import logoNovoMundo from '@/assets/logo-novo-mundo.png';

export interface CredorConfig {
  slug: string;
  nome: string;
  phone: string;
  phoneDisplay: string;
  logos: {
    principal: string;
    negociacao: string;
    parceiro: string;
  };
  quemSomos: string;
  footerTexto: string;
  copyrightTexto: string;
  /** Valor usado para filtrar devedores por credor no banco */
  credorFiltro: string;
}

export const CREDORES: Record<string, CredorConfig> = {
  grupoaltum: {
    slug: 'grupoaltum',
    nome: 'Grupo Altum',
    phone: '5562982183144',
    phoneDisplay: '(62) 98218-3144',
    logos: {
      principal: logoGrupoAltum,
      negociacao: logoGrupoAltumNegociacao,
      parceiro: logoSouzaRibeiro,
    },
    quemSomos:
      'O Portal de Acordos é a plataforma de gestão e recuperação de crédito da Souza e Ribeiro Advogados, autorizada e homologada pelo Grupo Altum, com foco nas melhores oportunidades de negociação para seus clientes. Todo o processo é online, de forma rápida e segura.',
    footerTexto: 'Portal de Acordos é um serviço da SOUZA E RIBEIRO ADVOGADOS',
    copyrightTexto: 'Grupo Altum',
    credorFiltro: 'GRUPO ALTUM',
  },
  novomundo: {
    slug: 'novomundo',
    nome: 'Novo Mundo',
    phone: '5562982183144',
    phoneDisplay: '(62) 98218-3144',
    logos: {
      principal: logoNovoMundo,
      negociacao: logoNovoMundo,
      parceiro: logoSouzaRibeiro,
    },
    quemSomos:
      'O Portal de Acordos é a plataforma de gestão e recuperação de crédito da Souza e Ribeiro Advogados, autorizada e homologada pelo Novo Mundo, com foco nas melhores oportunidades de negociação para seus clientes. Todo o processo é online, de forma rápida e segura.',
    footerTexto: 'Portal de Acordos é um serviço da SOUZA E RIBEIRO ADVOGADOS',
    copyrightTexto: 'Novo Mundo',
    credorFiltro: 'ume_novo_mundo',
  },
};

export const CREDOR_SLUGS = Object.keys(CREDORES);

export function getCredorConfig(slug: string): CredorConfig | undefined {
  return CREDORES[slug];
}

export function isValidCredorSlug(slug: string): boolean {
  return slug in CREDORES;
}
