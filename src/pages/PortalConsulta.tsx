import { useState } from 'react';
import { useNavigate, useParams, Navigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Phone, Search, FileText, MessageCircle, Shield, HandshakeIcon, Clock, HelpCircle, Star, MapPin, Lock } from 'lucide-react';
import { getCredorConfig, isValidCredorSlug } from '@/lib/credorConfig';

function formatCpfInput(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function isValidCpf(cpf: string) {
  const digits = cpf.replace(/\D/g, '');
  return digits.length === 11;
}

const FAQ_ITEMS = [
  { q: 'Qual o objetivo do Portal de Acordos?', a: 'O Portal de Acordos tem como objetivo facilitar a renegociação de débitos de forma online, rápida e segura, oferecendo condições especiais para que você regularize sua situação financeira.' },
  { q: 'Recebi um contato sobre uma oportunidade de negociação. Como consulto?', a: 'Basta digitar seu CPF no campo de consulta na página inicial. Se houver débitos disponíveis para negociação, eles serão exibidos com todos os detalhes para você avaliar.' },
  { q: 'Meus dados estão seguros?', a: 'Sim. Todas as consultas são sigilosas e seus dados são tratados com total segurança, seguindo as diretrizes da LGPD (Lei Geral de Proteção de Dados).' },
  { q: 'Como faço para negociar meu débito?', a: 'Após consultar seu CPF e visualizar seus débitos, entre em contato pelo nosso WhatsApp para negociar condições especiais de pagamento diretamente com nossa equipe.' },
  { q: 'Qual o prazo de resposta?', a: 'Nossa equipe responde em até 24 horas úteis após o contato via WhatsApp.' },
  { q: 'Quem pode renegociar no portal?', a: 'Qualquer pessoa física que possua débitos registrados em nosso sistema pode consultar e renegociar através do portal.' },
];

export default function PortalConsulta() {
  const { creditor } = useParams<{ creditor: string }>();
  const [cpf, setCpf] = useState('');
  const [faqSearch, setFaqSearch] = useState('');
  const navigate = useNavigate();

  if (!creditor || !isValidCredorSlug(creditor)) {
    return <Navigate to="/" replace />;
  }

  const config = getCredorConfig(creditor)!;
  const PHONE = config.phone;
  const PHONE_DISPLAY = config.phoneDisplay;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const digits = cpf.replace(/\D/g, '');
    if (isValidCpf(cpf)) {
      navigate(`/consulta/${creditor}/${digits}`);
    }
  };

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  const filteredFaqs = FAQ_ITEMS.filter(
    (faq) =>
      faq.q.toLowerCase().includes(faqSearch.toLowerCase()) ||
      faq.a.toLowerCase().includes(faqSearch.toLowerCase())
  );

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(135deg, #001a33 0%, #003366 50%, #004080 100%)' }}>
      {/* Header */}
      <header className="px-4 py-3" style={{ background: 'linear-gradient(135deg, #001a33 0%, #002b55 100%)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4 sm:gap-6">
            <img src={config.logos.parceiro} alt="Souza e Ribeiro" className="h-14 sm:h-20 w-auto" style={{ filter: 'brightness(0) invert(1)' }} />
            <div className="h-8 w-px" style={{ background: 'rgba(255,255,255,0.25)' }} />
            {config.logos.principal ? (
              <img src={config.logos.principal} alt={config.nome} className="h-14 sm:h-20 w-auto max-w-[160px] sm:max-w-[220px] object-contain" />
            ) : (
              <span className="text-lg sm:text-xl font-black" style={{ color: '#00a86b' }}>{config.nome.toUpperCase()}</span>
            )}
          </div>
          <nav className="hidden md:flex items-center gap-6">
            <button onClick={() => scrollTo('beneficios')} className="text-sm font-medium hover:opacity-80 transition-opacity" style={{ color: 'rgba(255,255,255,0.85)' }}>Benefícios</button>
            <button onClick={() => scrollTo('quem-somos')} className="text-sm font-medium hover:opacity-80 transition-opacity" style={{ color: 'rgba(255,255,255,0.85)' }}>Quem somos</button>
            <button onClick={() => scrollTo('como-funciona')} className="text-sm font-medium hover:opacity-80 transition-opacity" style={{ color: 'rgba(255,255,255,0.85)' }}>Como funciona</button>
            <button onClick={() => scrollTo('duvidas')} className="text-sm font-medium hover:opacity-80 transition-opacity" style={{ color: 'rgba(255,255,255,0.85)' }}>Dúvidas</button>
          </nav>
          <div className="flex items-center gap-4">
            <a href={`https://wa.me/${PHONE}`} target="_blank" rel="noopener noreferrer" className="hidden sm:flex items-center gap-2 text-sm font-medium" style={{ color: '#00a86b' }}>
              <Phone className="h-4 w-4" />
              {PHONE_DISPLAY}
            </a>
            <a href="/auth" className="hover:opacity-80 transition-opacity" style={{ color: 'rgba(255,255,255,0.5)' }} title="Área Restrita" aria-label="Área Restrita">
              <Lock className="h-5 w-5" />
            </a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="flex-1 flex items-center px-4 py-12 sm:py-20">
        <div className="max-w-6xl mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          <div className="text-center lg:text-left">
            <div className="inline-flex items-center gap-3 rounded-2xl px-6 py-4 mb-8" style={{ background: 'rgba(0,168,107,0.15)', border: '2px solid rgba(0,168,107,0.3)' }}>
              <div className="h-12 w-12 rounded-xl flex items-center justify-center" style={{ background: '#00a86b' }}>
                <HandshakeIcon className="h-7 w-7" style={{ color: '#fff' }} />
              </div>
              <span className="text-xl sm:text-2xl font-bold" style={{ color: '#00a86b' }}>Portal de Acordos</span>
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight mb-4" style={{ color: '#fff' }}>
              Aproveite e coloque sua{' '}
              <span style={{ color: '#00a86b' }}>vida financeira</span>{' '}
              em dia.
            </h1>
            <p className="text-lg sm:text-xl mb-6" style={{ color: 'rgba(255,255,255,0.75)' }}>
              Negocie seus débitos com condições especiais e recupere seu nome.
            </p>
            <div className="inline-flex items-center gap-2 rounded-full px-5 py-2.5" style={{ background: 'rgba(0,168,107,0.2)', border: '1px solid rgba(0,168,107,0.4)' }}>
              <Star className="h-5 w-5" style={{ color: '#00a86b' }} />
              <span className="text-base font-semibold" style={{ color: '#00a86b' }}>Condições Imperdíveis</span>
            </div>
          </div>
          <div className="flex justify-center lg:justify-end">
            <Card className="w-full max-w-md border-0 shadow-2xl" style={{ background: '#fff' }}>
              <CardContent className="p-8">
                <div className="text-center mb-6">
                  <div className="inline-flex items-center justify-center h-14 w-14 rounded-full mb-4" style={{ background: 'rgba(0,51,102,0.1)' }}>
                    <Search className="h-7 w-7" style={{ color: '#003366' }} />
                  </div>
                  <h2 className="text-2xl font-bold mb-1" style={{ color: '#1a1a2e' }}>Consulte suas dívidas</h2>
                  <p className="text-sm" style={{ color: '#666' }}>Digite seu CPF para verificar débitos em aberto</p>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <Label htmlFor="cpf" className="text-sm font-medium" style={{ color: '#333' }}>CPF</Label>
                    <Input id="cpf" placeholder="000.000.000-00" value={cpf} onChange={(e) => setCpf(formatCpfInput(e.target.value))} className="h-12 text-center text-lg mt-1.5 border-2" style={{ borderColor: '#e0e0e0', color: '#1a1a2e' }} />
                  </div>
                  <Button type="submit" disabled={!isValidCpf(cpf)} className="w-full h-12 text-base font-semibold rounded-lg" style={{ background: '#00a86b', color: '#fff' }}>
                    <Search className="h-5 w-5 mr-2" />
                    Consultar
                  </Button>
                </form>
                <div className="flex items-center gap-2 mt-4 justify-center">
                  <Shield className="h-4 w-4" style={{ color: '#999' }} />
                  <span className="text-xs" style={{ color: '#999' }}>Consulta segura e sigilosa</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Benefícios */}
      <section id="beneficios" className="px-4 py-16">
        <div className="max-w-5xl mx-auto">
          <h3 className="text-2xl font-bold text-center mb-10" style={{ color: '#fff' }}>Por que negociar conosco?</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: HandshakeIcon, title: 'Negociação facilitada', desc: 'Processo simples e direto pelo WhatsApp.' },
               { icon: Clock, title: 'Atendimento rápido', desc: 'Resposta em até 10 minutos.' },
               { icon: Shield, title: 'Sigilo garantido', desc: 'Seus dados são tratados com total segurança.' },
            ].map((item) => (
              <div key={item.title} className="flex items-start gap-4 p-5 rounded-xl" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <div className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(0,168,107,0.15)' }}>
                  <item.icon className="h-5 w-5" style={{ color: '#00a86b' }} />
                </div>
                <div>
                  <h4 className="font-semibold mb-1" style={{ color: '#fff' }}>{item.title}</h4>
                  <p className="text-sm" style={{ color: 'rgba(255,255,255,0.65)' }}>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Quem Somos */}
      <section id="quem-somos" className="px-4 py-16" style={{ background: '#fff' }}>
        <div className="max-w-5xl mx-auto">
          <h3 className="text-2xl font-bold text-center mb-8" style={{ color: '#1a1a2e' }}>Quem somos</h3>
          <p className="text-center text-base sm:text-lg max-w-3xl mx-auto mb-10" style={{ color: '#444', lineHeight: 1.8 }}>
            {config.quemSomos}
          </p>
          <div className="flex items-center justify-center gap-8 sm:gap-12">
            <img src={config.logos.parceiro} alt="Souza e Ribeiro Advogados" className="h-16 sm:h-20 w-auto" />
            <div className="h-12 w-px" style={{ background: '#ddd' }} />
            {config.logos.principal ? (
              <img src={config.logos.principal} alt={config.nome} className="h-16 sm:h-20 w-auto max-w-[180px] sm:max-w-[240px] object-contain" style={{ filter: 'brightness(0)' }} />
            ) : (
              <span className="text-2xl font-black" style={{ color: '#1a1a2e' }}>{config.nome.toUpperCase()}</span>
            )}
          </div>
        </div>
      </section>

      {/* Como funciona */}
      <section id="como-funciona" className="px-4 py-16" style={{ background: 'rgba(0,0,0,0.2)' }}>
        <div className="max-w-5xl mx-auto">
          <h3 className="text-2xl font-bold text-center mb-10" style={{ color: '#fff' }}>Como funciona</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { icon: Search, title: '1. Consulte seu CPF', desc: 'Digite seu CPF no campo acima para verificar débitos em aberto.' },
              { icon: FileText, title: '2. Veja seus débitos', desc: 'Confira os detalhes dos seus débitos: valores, contratos e vencimentos.' },
              { icon: MessageCircle, title: '3. Entre em contato', desc: 'Negocie condições especiais diretamente pelo WhatsApp.' },
            ].map((step) => (
              <Card key={step.title} className="border-0" style={{ background: 'rgba(255,255,255,0.07)' }}>
                <CardContent className="p-6 text-center">
                  <div className="inline-flex items-center justify-center h-14 w-14 rounded-full mb-4" style={{ background: 'rgba(0,168,107,0.15)' }}>
                    <step.icon className="h-7 w-7" style={{ color: '#00a86b' }} />
                  </div>
                  <h4 className="font-semibold text-lg mb-2" style={{ color: '#fff' }}>{step.title}</h4>
                  <p className="text-sm" style={{ color: 'rgba(255,255,255,0.65)' }}>{step.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Dúvidas Frequentes */}
      <section id="duvidas" className="px-4 py-16" style={{ background: '#f7f8fa' }}>
        <div className="max-w-3xl mx-auto">
          <h3 className="text-2xl font-bold text-center mb-2" style={{ color: '#1a1a2e' }}>Perguntas Frequentes</h3>
          <p className="text-center text-sm mb-8" style={{ color: '#666' }}>Tire suas dúvidas sobre o Portal de Acordos</p>

          <div className="mb-6">
            <Input
              placeholder="Buscar pergunta..."
              value={faqSearch}
              onChange={(e) => setFaqSearch(e.target.value)}
              className="h-11 border-2"
              style={{ borderColor: '#e0e0e0', color: '#1a1a2e', background: '#fff' }}
            />
          </div>

          <Accordion type="single" collapsible className="space-y-3">
            {filteredFaqs.map((faq, idx) => (
              <AccordionItem
                key={idx}
                value={`faq-${idx}`}
                className="rounded-xl border-0 px-5 overflow-hidden"
                style={{ background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
              >
                <AccordionTrigger className="text-left font-semibold text-sm sm:text-base hover:no-underline py-4" style={{ color: '#1a1a2e' }}>
                  <div className="flex items-center gap-3">
                    <HelpCircle className="h-5 w-5 shrink-0" style={{ color: '#00a86b' }} />
                    {faq.q}
                  </div>
                </AccordionTrigger>
                <AccordionContent className="text-sm pb-4" style={{ color: '#555' }}>
                  {faq.a}
                </AccordionContent>
              </AccordionItem>
            ))}
            {filteredFaqs.length === 0 && (
              <p className="text-center text-sm py-6" style={{ color: '#999' }}>Nenhuma pergunta encontrada.</p>
            )}
          </Accordion>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ background: '#1a1a2e' }}>
        <div className="px-4 py-10" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="max-w-5xl mx-auto">
            <div className="flex items-center justify-center gap-6 sm:gap-10 mb-8">
              <img src={config.logos.parceiro} alt="Souza e Ribeiro" className="h-12 sm:h-14 w-auto" style={{ filter: 'brightness(0) invert(1)' }} />
              <div className="h-8 w-px" style={{ background: 'rgba(255,255,255,0.2)' }} />
              {config.logos.principal ? (
                <img src={config.logos.principal} alt={config.nome} className="h-12 sm:h-14 w-auto max-w-[150px] sm:max-w-[200px] object-contain" />
              ) : (
                <span className="text-xl font-black" style={{ color: '#00a86b' }}>{config.nome.toUpperCase()}</span>
              )}
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
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
              {config.footerTexto}
            </p>
            <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
              © {new Date().getFullYear()} {config.copyrightTexto} — Todos os direitos reservados
            </p>
          </div>
        </div>
      </footer>

      {/* WhatsApp Floating Button */}
      <a
        href={`https://wa.me/${PHONE}`}
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 right-6 z-50 flex items-center justify-center h-14 w-14 rounded-full shadow-lg hover:scale-110 transition-transform"
        style={{ background: '#25D366' }}
        aria-label="WhatsApp"
      >
        <MessageCircle className="h-7 w-7" style={{ color: '#fff' }} />
      </a>
    </div>
  );
}
