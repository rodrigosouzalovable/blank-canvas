import { Link } from 'react-router-dom';
import { ArrowLeft, Phone, MessageCircle, MapPin, ShieldAlert, AlertTriangle, CreditCard, Mail, Eye, CheckCircle } from 'lucide-react';
import logoGrupoAltum from '@/assets/logo-grupo-altum.png';
import logoSouzaRibeiro from '@/assets/logo-souza-ribeiro.png';

const PHONE = '5562982183144';
const PHONE_DISPLAY = '(62) 98218-3144';

export default function Antifraude() {
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
              <div className="h-10 w-10 rounded-lg flex items-center justify-center" style={{ background: 'rgba(220,53,69,0.1)' }}>
                <ShieldAlert className="h-5 w-5" style={{ color: '#dc3545' }} />
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold" style={{ color: '#1a1a2e' }}>Antifraude</h1>
            </div>

            <div className="prose prose-sm sm:prose-base max-w-none" style={{ color: '#444' }}>
              {/* Empréstimos */}
              <div className="rounded-xl p-5 sm:p-6 mb-6" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
                <div className="flex items-center gap-3 mb-3">
                  <AlertTriangle className="h-5 w-5 shrink-0" style={{ color: '#dc3545' }} />
                  <h2 className="text-lg font-bold m-0" style={{ color: '#dc3545' }}>Empréstimos</h2>
                </div>
                <p className="mb-3">Deixamos claro para todos os fins de direito que:</p>
                <ul className="list-none pl-0 space-y-3">
                  <li className="flex gap-3 items-start">
                    <span style={{ color: '#dc3545' }} className="shrink-0 font-bold text-lg">✕</span>
                    <div className="pt-0.5">
                      <strong>NÃO oferecemos empréstimos</strong> ou concedemos crédito de qualquer espécie nesta plataforma;
                    </div>
                  </li>
                  <li className="flex gap-3 items-start">
                    <span style={{ color: '#dc3545' }} className="shrink-0 font-bold text-lg">✕</span>
                    <div className="pt-0.5">
                      Qualquer contato dessa finalidade é <strong>ilegítimo, fraudulento</strong> e não apresenta qualquer vínculo com esta plataforma;
                    </div>
                  </li>
                  <li className="flex gap-3 items-start">
                    <span style={{ color: '#dc3545' }} className="shrink-0 font-bold text-lg">✕</span>
                    <div className="pt-0.5">
                      <strong>NÃO exigimos qualquer tipo de depósito prévio</strong> ou fazemos solicitações desse tipo por meio de correspondentes ou intermediários.
                    </div>
                  </li>
                </ul>
              </div>

              {/* Boletos */}
              <div className="rounded-xl p-5 sm:p-6 mb-6" style={{ background: '#fff7ed', border: '1px solid #fed7aa' }}>
                <div className="flex items-center gap-3 mb-3">
                  <CreditCard className="h-5 w-5 shrink-0" style={{ color: '#d97706' }} />
                  <h2 className="text-lg font-bold m-0" style={{ color: '#d97706' }}>Boletos</h2>
                </div>
                <p>Todos os boletos emitidos pelo <strong>GRUPO ALTUM</strong> possuem beneficiários que contenham, em parte, o mesmo titular. <strong>Sempre que for efetuar um pagamento de boleto, verifique o beneficiário!</strong></p>
              </div>

              {/* Golpes Comuns */}
              <h2 className="text-lg font-bold mt-8 mb-3" style={{ color: '#1a1a2e' }}>Golpes Comuns — Fique Atento!</h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                {[
                  { icon: Mail, title: 'Phishing por e-mail', desc: 'E-mails falsos se passando por nossa empresa, solicitando dados ou pagamentos. Nunca clique em links suspeitos.' },
                  { icon: MessageCircle, title: 'Mensagens falsas', desc: 'Golpistas podem enviar SMS ou WhatsApp com links fraudulentos. Nosso número oficial é o exibido nesta página.' },
                  { icon: CreditCard, title: 'Boletos adulterados', desc: 'Boletos com dados de beneficiário alterados. Sempre confira o nome do beneficiário antes de pagar.' },
                  { icon: Phone, title: 'Ligações fraudulentas', desc: 'Pessoas se passando por funcionários pedindo dados bancários ou senhas. Nunca forneça essas informações por telefone.' },
                ].map((item) => (
                  <div key={item.title} className="rounded-xl p-4" style={{ background: '#f8f9fa', border: '1px solid #e9ecef' }}>
                    <div className="flex items-center gap-2 mb-2">
                      <item.icon className="h-4 w-4" style={{ color: '#dc3545' }} />
                      <h3 className="font-semibold text-sm m-0" style={{ color: '#1a1a2e' }}>{item.title}</h3>
                    </div>
                    <p className="text-sm m-0" style={{ color: '#666' }}>{item.desc}</p>
                  </div>
                ))}
              </div>

              {/* Como verificar */}
              <h2 className="text-lg font-bold mt-8 mb-3" style={{ color: '#1a1a2e' }}>Como Verificar a Autenticidade de um Contato</h2>

              <div className="space-y-3 mb-6">
                {[
                  'Verifique se o número de contato é o nosso número oficial: ' + PHONE_DISPLAY,
                  'Acesse diretamente nosso portal digitando o endereço no navegador — nunca clique em links recebidos por e-mail ou mensagem',
                  'Confira sempre o nome do beneficiário em boletos antes de efetuar pagamentos',
                  'Nunca forneça senhas, dados bancários completos ou códigos de verificação por telefone, e-mail ou mensagem',
                  'Em caso de dúvida, entre em contato diretamente pelo nosso WhatsApp oficial',
                ].map((tip, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-3 rounded-lg" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                    <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: '#16a34a' }} />
                    <span className="text-sm" style={{ color: '#333' }}>{tip}</span>
                  </div>
                ))}
              </div>

              {/* Canais oficiais */}
              <h2 className="text-lg font-bold mt-8 mb-3" style={{ color: '#1a1a2e' }}>Canais Oficiais de Atendimento</h2>

              <div className="rounded-xl p-5" style={{ background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                <p className="mb-3"><strong>Utilize apenas os canais abaixo para se comunicar conosco:</strong></p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <MessageCircle className="h-4 w-4" style={{ color: '#25D366' }} />
                    <span className="text-sm"><strong>WhatsApp:</strong> {PHONE_DISPLAY}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Eye className="h-4 w-4" style={{ color: '#003366' }} />
                    <span className="text-sm"><strong>Portal:</strong> Este site que você está acessando</span>
                  </div>
                </div>
              </div>

              {/* Dicas de Segurança */}
              <h2 className="text-lg font-bold mt-8 mb-3" style={{ color: '#1a1a2e' }}>Dicas de Segurança</h2>

              <ul className="list-disc pl-6 space-y-2">
                <li>Mantenha seus dispositivos e aplicativos sempre atualizados;</li>
                <li>Utilize senhas fortes e diferentes para cada serviço;</li>
                <li>Ative a verificação em duas etapas no WhatsApp e demais aplicativos;</li>
                <li>Desconfie de ofertas com condições muito vantajosas ou urgentes;</li>
                <li>Nunca compartilhe códigos de verificação recebidos por SMS;</li>
                <li>Em caso de suspeita de fraude, registre um Boletim de Ocorrência e nos comunique imediatamente.</li>
              </ul>

              <p className="mt-6 text-sm" style={{ color: '#999' }}>
                Se você recebeu algum contato suspeito em nome da Souza e Ribeiro Advogados ou do Grupo Altum, denuncie pelo nosso WhatsApp oficial: {PHONE_DISPLAY}.
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
