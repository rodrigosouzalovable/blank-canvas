import { Link } from 'react-router-dom';
import { ArrowLeft, Phone, MessageCircle, MapPin, Shield } from 'lucide-react';
import logoGrupoAltum from '@/assets/logo-grupo-altum.png';
import logoSouzaRibeiro from '@/assets/logo-souza-ribeiro.png';

const PHONE = '5562982183144';
const PHONE_DISPLAY = '(62) 98218-3144';
const EMPRESA = 'SOUZA E RIBEIRO SOCIEDADE DE ADVOGADOS';

export default function PoliticaPrivacidade() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#f7f8fa' }}>
      {/* Header */}
      <header className="px-4 py-3" style={{ background: 'linear-gradient(135deg, #001a33 0%, #002b55 100%)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4 sm:gap-6">
            <img src={logoSouzaRibeiro} alt="Souza e Ribeiro" className="h-14 sm:h-20 w-auto" style={{ filter: 'brightness(0) invert(1)' }} />
            <div className="h-8 w-px" style={{ background: 'rgba(255,255,255,0.25)' }} />
            <img src={logoGrupoAltum} alt="Grupo Altum" className="h-12 sm:h-16 w-auto" />
          </div>
          <div className="flex items-center gap-4">
            <a href={`https://wa.me/${PHONE}`} target="_blank" rel="noopener noreferrer" className="hidden sm:flex items-center gap-2 text-sm font-medium" style={{ color: '#00a86b' }}>
              <Phone className="h-4 w-4" />
              {PHONE_DISPLAY}
            </a>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 px-4 py-10 sm:py-16">
        <div className="max-w-4xl mx-auto">
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-medium mb-8 hover:opacity-80 transition-opacity" style={{ color: '#003366' }}>
            <ArrowLeft className="h-4 w-4" />
            Voltar ao Portal
          </Link>

          <div className="rounded-2xl p-6 sm:p-10" style={{ background: '#fff', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <div className="flex items-center gap-3 mb-6">
              <div className="h-10 w-10 rounded-lg flex items-center justify-center" style={{ background: 'rgba(0,51,102,0.1)' }}>
                <Shield className="h-5 w-5" style={{ color: '#003366' }} />
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold" style={{ color: '#1a1a2e' }}>Política de Privacidade</h1>
            </div>

            <div className="prose prose-sm sm:prose-base max-w-none" style={{ color: '#444' }}>
              <p>
                A <strong>{EMPRESA}</strong> trata Dados Pessoais dos Titulares para execução de suas atividades. Estes Dados Pessoais podem ter diferentes características e ser classificados sob os seguintes tipos:
              </p>

              <h2 className="text-lg font-bold mt-8 mb-3" style={{ color: '#1a1a2e' }}>1. Tipos de Dados Pessoais Tratados</h2>

              <p><strong>a) Identificação e Informações de contato:</strong> qualquer dado que nos permite contatá-lo ou verificar seu cadastro, tais como: nome completo, números de telefone e endereço de e-mail, RG, CPF, dentre outros que possam ser necessários;</p>

              <p><strong>b) Informações de navegação:</strong> algumas informações coletadas enquanto você navega em nosso website, tais como endereço IP, informações sobre dispositivo, data e hora de acesso etc.;</p>

              <p><strong>c) Dados relacionados a situação financeira:</strong> em algumas situações autorizadas por lei, a {EMPRESA} poderá ter acesso a dados sobre sua situação financeira, tais como renda, patrimônio, negativação, dados do cadastro positivo, dados sobre dívidas e pagamentos (número da dívida, cedente, produto, tempo de atraso, saldo devedor, quantidade de parcelas, valor das parcelas), dentre outros;</p>

              <p><strong>d) Outras informações fornecidas:</strong> quaisquer Dados Pessoais e informações voluntariamente fornecidos à {EMPRESA} para que esta preste seus serviços, tais como cargo, poderes, nome da empresa, profissão; estado civil; regime de casamento; nome do cônjuge etc.;</p>

              <p><strong>e) Cookies:</strong> Os cookies permitem que um site identifique o dispositivo de um usuário sempre que ele acessar ou retornar a este website e são normalmente utilizados para que os websites funcionem de maneira mais eficiente e aprimorem sua experiência.</p>

              <p>A {EMPRESA} se compromete a realizar o Tratamento de Dados Pessoais limitado ao mínimo necessário para as suas atividades, assim como manter íntegras e seguras as informações e os Dados Pessoais.</p>

              <p>Os Dados Pessoais serão utilizados apenas para viabilizar as atividades da {EMPRESA}, respeitando as finalidades para as quais foram coletados.</p>

              <p>Os Dados Pessoais poderão ser anonimizados, sem que seja possível, portanto, individualização do Titular, para fins de composições de análises estatísticas e comportamentais.</p>

              <h2 className="text-lg font-bold mt-8 mb-3" style={{ color: '#1a1a2e' }}>2. Como os Dados Pessoais são Obtidos</h2>

              <p>Os Dados Pessoais em tratamento na {EMPRESA} são obtidos nas seguintes situações:</p>

              <p><strong>a)</strong> Em decorrência de operações lícitas de aquisição de créditos perante as principais instituições financeiras e empresas do país, conforme admitido pela legislação vigente;</p>

              <p><strong>b)</strong> Quando inseridos ou submetidos voluntariamente por você no acesso e uso do site e demais canais de contato com a {EMPRESA}, como central de atendimento, aplicativos de mensagens e redes sociais;</p>

              <p><strong>c)</strong> Mediante coleta automática de informações de navegação, incluindo, mas não se limitando, a: criação de conta de acesso, navegação, visitas realizadas, registros eletrônicos de acesso;</p>

              <p><strong>d)</strong> Quando a {EMPRESA} é contratada para gestão e recuperação de crédito em prol de outras empresas clientes e parceiras;</p>

              <p><strong>e)</strong> Quando fornecidos por outros Titulares sobre você ou por você sobre outros Titulares;</p>

              <p><strong>f)</strong> Por coleta de informações por meio de fontes públicas e privadas confiáveis e legítimas, inclusive para fins de enriquecimento de sua base de dados, como bureaus de crédito, cartórios, Juntas Comerciais, dentre outras.</p>

              <h2 className="text-lg font-bold mt-8 mb-3" style={{ color: '#1a1a2e' }}>3. Finalidades do Tratamento</h2>

              <p>O Tratamento de Dados Pessoais é realizado com a finalidade principal de satisfação do crédito da {EMPRESA} e de seus parceiros. Adicionalmente, a {EMPRESA} poderá tratar seus Dados Pessoais para as seguintes finalidades:</p>

              <ul className="list-disc pl-6 space-y-1">
                <li>Transação, conciliação e como parte do relacionamento decorrente do contrato ou outro negócio jurídico;</li>
                <li>Para prestação de nossos serviços aos clientes e parceiros;</li>
                <li>Sanar dúvidas e prestar suporte sobre o uso do site;</li>
                <li>Prestar os serviços e cumprir as obrigações decorrentes dos referidos serviços, no âmbito dos contratos firmados;</li>
                <li>Informar sobre novidades, serviços, funcionalidades, conteúdos, benefícios, campanhas e demais atividades relevantes e de relacionamento com você e os Titulares;</li>
                <li>Conferir sua autenticidade, bem como para cadastro dos usuários no site;</li>
                <li>Combate às fraudes e condutas ilícitas;</li>
                <li>Para elucidar eventuais reclamações e denúncias;</li>
                <li>Para manter atualizados os Dados Pessoais e demais informações constantes em nosso banco de dados;</li>
                <li>Colaborar e/ou cumprir ordem judicial ou requisição por autoridade administrativa;</li>
                <li>Para propositura de ações ou defesa;</li>
                <li>Prevenção à lavagem de dinheiro;</li>
                <li>Qualquer outra finalidade previamente informada a você, se aplicável, quando coletarmos seus Dados Pessoais;</li>
                <li>Qualquer outra hipótese permitida por lei.</li>
              </ul>

              <h2 className="text-lg font-bold mt-8 mb-3" style={{ color: '#1a1a2e' }}>4. Bases Legais</h2>

              <p>Os Dados Pessoais sempre serão utilizados de acordo com as Bases Legais previstas nas leis aplicáveis. O consentimento poderá ser solicitado pela {EMPRESA}, porém será dispensável quando forem aplicáveis outras Bases Legais, como, por exemplo, para cumprimento de obrigações legais e regulatórias; para o exercício regular de direitos em processos; execução de contrato; proteção do crédito; para atender os interesses legítimos da {EMPRESA} e de terceiros, como os nossos clientes e parceiros.</p>

              <h2 className="text-lg font-bold mt-8 mb-3" style={{ color: '#1a1a2e' }}>5. Comunicação e Canais</h2>

              <p>A {EMPRESA} poderá lhe enviar comunicação acerca de seus contratos e informações institucionais e/ou qualquer outra que lhe auxilie no relacionamento com a {EMPRESA}. A comunicação pode ser feita por meio de diferentes canais, tais como:</p>

              <ul className="list-disc pl-6 space-y-1">
                <li>E-mail</li>
                <li>Contato Telefônico</li>
                <li>SMS</li>
                <li>Aplicativos de comunicação (Ex.: WhatsApp e outros)</li>
                <li>Post em Redes Sociais (Ex.: Facebook e outras)</li>
                <li>Plataformas Digitais (Ex. Website) e outros</li>
              </ul>

              <h2 className="text-lg font-bold mt-8 mb-3" style={{ color: '#1a1a2e' }}>6. Compartilhamento de Dados com Terceiros</h2>

              <p>O uso compartilhado de Dados Pessoais está condicionado ao compromisso, por quem detém e transmite o Dado Pessoal, de que, de fato, possui base legal para fazê-lo e que pode prestar contas nesse sentido mediante oportuna solicitação do Titular.</p>

              <p>A {EMPRESA} pode realizar uso compartilhado dos Dados Pessoais que trata sobre os usuários deste site e Titulares dos Dados Pessoais, com parceiros, empresas contratadas pela {EMPRESA}, exclusivamente para desempenho de suas atividades e para poder oferecer seus serviços e por empresas contratantes de seus serviços de gestão e recuperação de crédito.</p>

              <p>Com o intuito de dar transparência ao Tratamento de Dados que realiza, a {EMPRESA} informa que poderá realizar uso compartilhado de Dados Pessoais, com os seguintes entes públicos e privados:</p>

              <ul className="list-disc pl-6 space-y-1">
                <li>Entes públicos, por motivos legais para cumprir uma ordem ou procedimento legal e/ou responder a solicitações de autoridades públicas e governamentais;</li>
                <li>Áreas internas da {EMPRESA};</li>
                <li>Prestadores de serviços (call centers, agentes de relacionamento, backoffice, consultores nas áreas de tecnologia e informática etc.);</li>
                <li>Parceiros comerciais da {EMPRESA}, contratados exclusivamente para cobrança e recuperação de crédito;</li>
                <li>Pessoas expressamente autorizadas por você;</li>
                <li>Autoridades, órgãos reguladores, tribunais e agências governamentais, quando exigido por lei;</li>
                <li>Empresas de auditoria;</li>
                <li>Empresas que fazem parte do Grupo Econômico;</li>
                <li>Bureaus de crédito, inclusive de acordo com o disposto na legislação aplicável;</li>
                <li>Instituições financeiras, inclusive quando necessário, para viabilizar alguma transação;</li>
                <li>Empresas contratantes de seus serviços de gestão e recuperação de crédito.</li>
              </ul>

              <p>Ao compartilhar Dados Pessoais com terceiros ou parceiros, a {EMPRESA} exigirá a adequação aos padrões de privacidade, segurança e proteção de dados, em conformidade com todas as obrigações legais, regulatórias e contratuais aplicáveis.</p>

              <h2 className="text-lg font-bold mt-8 mb-3" style={{ color: '#1a1a2e' }}>7. Direitos do Titular</h2>

              <p>De acordo com a Lei Geral de Proteção de Dados (LGPD - Lei nº 13.709/2018), você, como titular dos dados, possui os seguintes direitos:</p>

              <ul className="list-disc pl-6 space-y-1">
                <li>Confirmação da existência de tratamento de seus dados;</li>
                <li>Acesso aos seus dados pessoais;</li>
                <li>Correção de dados incompletos, inexatos ou desatualizados;</li>
                <li>Anonimização, bloqueio ou eliminação de dados desnecessários ou excessivos;</li>
                <li>Portabilidade dos dados a outro fornecedor de serviço;</li>
                <li>Eliminação dos dados pessoais tratados com o consentimento do titular;</li>
                <li>Informação sobre compartilhamento de dados com entidades públicas e privadas;</li>
                <li>Informação sobre a possibilidade de não fornecer consentimento e sobre as consequências da negativa;</li>
                <li>Revogação do consentimento.</li>
              </ul>

              <h2 className="text-lg font-bold mt-8 mb-3" style={{ color: '#1a1a2e' }}>8. Contato do Encarregado (DPO)</h2>

              <p>Para exercer seus direitos ou esclarecer dúvidas relacionadas ao tratamento de seus Dados Pessoais, entre em contato com nosso Encarregado de Proteção de Dados (DPO) através dos seguintes canais:</p>

              <ul className="list-disc pl-6 space-y-1">
                <li><strong>WhatsApp:</strong> {PHONE_DISPLAY}</li>
                <li><strong>Localização:</strong> Goiânia - GO</li>
              </ul>

              <p className="mt-6 text-sm" style={{ color: '#999' }}>
                Esta política pode ser atualizada periodicamente. Recomendamos que você consulte esta página regularmente para se manter informado sobre como protegemos seus dados.
              </p>

              <p className="text-sm" style={{ color: '#999' }}>
                Última atualização: Fevereiro de 2026.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer style={{ background: '#1a1a2e' }}>
        <div className="px-4 py-10" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="max-w-5xl mx-auto">
            <div className="flex items-center justify-center gap-6 sm:gap-10 mb-8">
              <img src={logoSouzaRibeiro} alt="Souza e Ribeiro" className="h-12 sm:h-14 w-auto" style={{ filter: 'brightness(0) invert(1)' }} />
              <div className="h-8 w-px" style={{ background: 'rgba(255,255,255,0.2)' }} />
              <img src={logoGrupoAltum} alt="Grupo Altum" className="h-12 sm:h-14 w-auto" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 text-center sm:text-left">
              <div>
                <h4 className="font-semibold text-sm mb-3" style={{ color: 'rgba(255,255,255,0.9)' }}>Links</h4>
                <div className="flex flex-col gap-2">
                  <Link to="/politica-de-privacidade" className="text-sm hover:opacity-80 transition-opacity" style={{ color: 'rgba(255,255,255,0.6)' }}>Política de Privacidade</Link>
                  <Link to="/antifraude" className="text-sm hover:opacity-80 transition-opacity" style={{ color: 'rgba(255,255,255,0.6)' }}>Antifraude</Link>
                </div>
              </div>
              <div>
                <h4 className="font-semibold text-sm mb-3" style={{ color: 'rgba(255,255,255,0.9)' }}>Central de Atendimento</h4>
                <a href={`https://wa.me/${PHONE}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm" style={{ color: '#00a86b' }}>
                  <Phone className="h-4 w-4" />
                  {PHONE_DISPLAY}
                </a>
                <div className="flex items-center gap-2 mt-2 justify-center sm:justify-start">
                  <MapPin className="h-4 w-4" style={{ color: 'rgba(255,255,255,0.5)' }} />
                  <span className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>Goiânia - GO</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="px-4 py-5">
          <div className="max-w-5xl mx-auto text-center">
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Portal de Acordos é um serviço da SOUZA E RIBEIRO ADVOGADOS</p>
            <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>© {new Date().getFullYear()} Grupo Altum — Todos os direitos reservados</p>
          </div>
        </div>
      </footer>

      {/* WhatsApp Floating Button */}
      <a href={`https://wa.me/${PHONE}`} target="_blank" rel="noopener noreferrer" className="fixed bottom-6 right-6 z-50 flex items-center justify-center h-14 w-14 rounded-full shadow-lg hover:scale-110 transition-transform" style={{ background: '#25D366' }} aria-label="WhatsApp">
        <MessageCircle className="h-7 w-7" style={{ color: '#fff' }} />
      </a>
    </div>
  );
}
