import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/AuthContext';
import HeroMockup from '@/components/home/HeroMockup';
import HowItWorks from '@/components/home/HowItWorks';
import Segments from '@/components/home/Segments';
import Faq from '@/components/home/Faq';
import CardapioDigital from '@/components/home/CardapioDigital';
import SystemTour from '@/components/home/SystemTour';
import {
  Package, BarChart3, ShoppingCart, Truck, FileText,
  QrCode, MapPin, Check, ChevronRight, Menu, X,
  ArrowRight, Star, Zap, Shield, Users, MessageCircle
} from 'lucide-react';

const NAV_ITEMS = [
  { label: 'Cardápio', id: 'cardapio' },
  { label: 'Funcionalidades', id: 'funcionalidades' },
  { label: 'Como funciona', id: 'como-funciona' },
  { label: 'Planos', id: 'planos' },
  { label: 'Depoimentos', id: 'depoimentos' },
  { label: 'FAQ', id: 'faq' },
];

const WHATSAPP = '5519988992192';
const WHATSAPP_MSG = encodeURIComponent('Olá! Tenho interesse no Reddu. Pode me contar mais?');
const WHATSAPP_URL = `https://wa.me/${WHATSAPP}?text=${WHATSAPP_MSG}`;

// Símbolo Reddu: três pontos conectados (rede de mercados/operação)
const ReddulIcon = ({ className }) => (
  <svg viewBox="0 0 48 48" className={className} fill="none">
    <line x1="10" y1="24" x2="36" y2="10" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
    <line x1="10" y1="24" x2="36" y2="38" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
    <line x1="36" y1="10" x2="36" y2="38" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
    <circle cx="10" cy="24" r="7" fill="currentColor" />
    <circle cx="36" cy="10" r="5.2" fill="currentColor" />
    <circle cx="36" cy="38" r="5.2" fill="currentColor" />
  </svg>
);

export default function HomePage() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activePlan, setActivePlan] = useState(1);
  const heroRef = useRef(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (currentUser) navigate('/dashboard');
  }, [currentUser, navigate]);

  const features = [
    { icon: Package, title: 'Controle de Estoque', desc: 'Gerencie lotes, validades e movimentações em tempo real. Nunca perca um produto por vencimento.' },
    { icon: ShoppingCart, title: 'PDV Completo', desc: 'Venda com velocidade. Carrinho, descontos, múltiplas formas de pagamento e emissão de NFC-e.' },
    { icon: FileText, title: 'NF-e / NFC-e', desc: 'Emissão de nota fiscal eletrônica integrada com a SEFAZ via Focus NFe. CPF e CNPJ na nota.' },
    { icon: MapPin, title: 'Mercados & Consignado', desc: 'Controle de pontos de venda, auditorias de freezer, cálculo automático de vendas consignadas.' },
    { icon: Truck, title: 'Estoque Móvel', desc: 'Rastreie bandejas do estoque central até cada mercado. Transferências automáticas por lote.' },
    { icon: QrCode, title: 'Etiquetas com QR Code', desc: 'Gere etiquetas com QR Code para rastreamento. Leitura pelo celular mostra produto, validade e localização.' },
    { icon: BarChart3, title: 'Relatórios Inteligentes', desc: 'Dashboard executivo, comparativo de mercados, ranking de produtos e indicadores de giro de estoque.' },
    { icon: Zap, title: 'Operação Mobile', desc: 'App PWA para operadores de mercado. Funciona no celular, sem instalação, com leitor de código de barras.' },
    { icon: MessageCircle, title: 'WhatsApp Integrado', desc: 'Atenda clientes direto pelo sistema: conversas em tempo real, disparo em massa com lista importada e resposta automática de boas-vindas.' },
  ];

  const plans = [
    {
      name: 'Starter',
      price: 97,
      desc: 'Para começar com o pé direito',
      color: 'from-gray-800 to-gray-900',
      accent: '#9ca3af',
      items: [
        '1 usuário',
        'PDV completo',
        'Controle de estoque',
        'Etiquetas com QR Code',
        'Relatórios básicos',
        'Suporte por WhatsApp',
      ],
    },
    {
      name: 'Profissional',
      price: 197,
      desc: 'O mais popular — tudo que você precisa',
      color: 'from-red-600 to-red-800',
      accent: '#ef4444',
      highlight: true,
      items: [
        'Até 3 usuários',
        'Tudo do Starter',
        'NF-e / NFC-e',
        'Módulo de Mercados',
        'Estoque Móvel',
        'App Mobile (PWA)',
        'Relatórios avançados',
        'Suporte prioritário',
      ],
    },
    {
      name: 'Enterprise',
      price: 397,
      desc: 'Para operações maiores e equipes completas',
      color: 'from-gray-900 to-black',
      accent: '#6366f1',
      items: [
        'Usuários ilimitados',
        'Tudo do Profissional',
        'Múltiplos CNPJs',
        'API personalizada',
        'Onboarding dedicado',
        'Suporte 24h',
        'SLA garantido',
        'Consultoria mensal',
      ],
    },
  ];

  const testimonials = [
    { name: 'Fernanda M.', role: 'Produtora de salgados', text: 'Antes eu anotava tudo em planilha e sempre perdia produto vencido. Hoje o sistema me avisa antes de acontecer.' },
    { name: 'Carlos R.', role: 'Dono de doceria', text: 'O PDV é rápido demais. Em dia de pico consigo atender o dobro de clientes sem erro.' },
    { name: 'Ana P.', role: 'Gestora de mercadinhos', text: 'O controle de consignado mudou minha vida. Agora sei exatamente o que cada mercado vendeu.' },
  ];

  return (
    <>
      <Helmet>
        <title>Reddu — Gestão inteligente para quem produz e vende</title>
        <meta name="description" content="Sistema completo de gestão de estoque, PDV, NF-e, mercados e atendimento via WhatsApp para produtores de alimentos e pequenas indústrias." />
        <meta property="og:title" content="Reddu — Gestão inteligente para quem produz e vende" />
        <meta property="og:description" content="Estoque por lote, PDV com NF-e, mercados consignados e WhatsApp integrado em um só sistema." />
        <meta property="og:image" content="/icon-512x512.png" />
        <meta property="og:type" content="website" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;900&display=swap" rel="stylesheet" />
      </Helmet>

      <div style={{ fontFamily: "'DM Sans', sans-serif" }} className="bg-white text-gray-900 overflow-x-hidden">

        {/* NAV */}
        <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'bg-white/95 backdrop-blur-sm shadow-sm' : 'bg-transparent'}`}>
          <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 bg-red-600 rounded-lg flex items-center justify-center">
                <ReddulIcon className="h-7 w-7 text-white" />
              </div>
              <span className={`font-bold tracking-tight text-2xl lowercase ${scrolled ? 'text-gray-900' : 'text-white'}`}>reddu</span>
            </div>
            <div className="hidden lg:flex items-center gap-8">
              {NAV_ITEMS.map(item => (
                <a key={item.id} href={`#${item.id}`}
                  className={`text-sm font-medium transition-colors ${scrolled ? 'text-gray-600 hover:text-red-600' : 'text-gray-300 hover:text-white'}`}>
                  {item.label}
                </a>
              ))}
              <a href={WHATSAPP_URL} target="_blank" rel="noreferrer"
                className={`text-sm font-medium transition-colors ${scrolled ? 'text-gray-600 hover:text-red-600' : 'text-gray-300 hover:text-white'}`}>
                Contato
              </a>
            </div>
            <div className="hidden lg:flex items-center gap-3">
              <Link to="/login" className={`text-sm font-medium transition-colors px-4 py-2 ${scrolled ? 'text-gray-600 hover:text-gray-900' : 'text-gray-300 hover:text-white'}`}>
                Entrar
              </Link>
              <a href={WHATSAPP_URL} target="_blank" rel="noreferrer"
                className="bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-5 py-2 rounded-xl transition-colors">
                Começar agora
              </a>
            </div>
            <button
              className={`lg:hidden p-2 transition-colors ${scrolled ? 'text-gray-900' : 'text-white'}`}
              aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(!menuOpen)}>
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
          {menuOpen && (
            <div className="lg:hidden bg-white border-t border-gray-100 px-6 py-4 space-y-4">
              {NAV_ITEMS.map(item => (
                <a key={item.id} href={`#${item.id}`} onClick={() => setMenuOpen(false)}
                  className="block text-sm font-medium text-gray-700 py-1">{item.label}</a>
              ))}
              <Link to="/login" onClick={() => setMenuOpen(false)} className="block text-sm font-medium text-gray-700 py-1">Entrar</Link>
              <a href={WHATSAPP_URL} target="_blank" rel="noreferrer" onClick={() => setMenuOpen(false)}
                className="block bg-red-600 text-white text-center text-sm font-semibold px-5 py-2.5 rounded-xl">
                Começar agora
              </a>
            </div>
          )}
        </nav>

        {/* HERO */}
        <section ref={heroRef} className="relative min-h-screen flex items-center bg-[#0F172A] overflow-hidden">
          {/* Background elements */}
          <div className="absolute inset-0">
            <div className="absolute top-20 right-0 w-96 h-96 bg-red-600/20 rounded-full blur-3xl" />
            <div className="absolute bottom-20 left-0 w-64 h-64 bg-red-800/10 rounded-full blur-3xl" />
            <div className="absolute inset-0 opacity-5"
              style={{ backgroundImage: 'radial-gradient(circle, #ffffff 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
          </div>

          <div className="relative max-w-6xl mx-auto px-6 pt-28 pb-20 grid lg:grid-cols-2 gap-14 items-center w-full">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 bg-red-600/10 border border-red-600/20 text-red-400 text-xs font-semibold px-3 py-1.5 rounded-full mb-6">
                <Zap className="h-3 w-3" /> Sistema completo para sua produção
              </div>
              <h1 style={{ lineHeight: 1.15 }}
                className="font-black tracking-tight text-3xl sm:text-4xl lg:text-5xl text-white mb-6 break-words">
                Gestão inteligente{' '}
                <br className="hidden sm:block" />
                para quem{' '}
                <span className="text-red-500">produz</span>
                {' '}e{' '}
                <span className="text-red-500">vende.</span>
              </h1>
              <p className="text-lg md:text-xl text-gray-400 mb-10 max-w-2xl leading-relaxed">
                Do freezer até a venda — controle de estoque por lote, PDV com NF-e, cardápio digital com pedidos online, mercados consignados e relatórios que realmente ajudam a decidir.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <a href={WHATSAPP_URL} target="_blank" rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 bg-red-600 hover:bg-red-500 text-white font-semibold text-base px-8 py-4 rounded-2xl transition-all active:scale-95 shadow-lg shadow-red-600/30">
                  Falar com um especialista <ArrowRight className="h-5 w-5" />
                </a>
                <a href="#planos"
                  className="inline-flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold text-base px-8 py-4 rounded-2xl transition-all">
                  Ver planos <ChevronRight className="h-5 w-5" />
                </a>
              </div>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3 mt-10">
                {[['Sem instalação', Shield], ['Suporte via WhatsApp', Users], ['Dados na nuvem', Zap]].map(([label, Icon]) => (
                  <div key={label} className="flex items-center gap-2 text-gray-400 text-sm">
                    <Icon className="h-4 w-4 text-red-500" />
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="pb-10 lg:pb-0">
              <HeroMockup />
            </div>
          </div>
        </section>

        {/* STATS */}
        <section className="bg-red-600 py-12">
          <div className="max-w-6xl mx-auto px-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
              {[
                ['PDV + Estoque', 'em um só sistema'],
                ['NF-e / NFC-e', 'integrado à SEFAZ'],
                ['QR Code', 'por lote rastreável'],
                ['Mobile', 'sem instalação'],
              ].map(([val, label]) => (
                <div key={val}>
                  <p className="font-bold tracking-tight text-2xl text-white">{val}</p>
                  <p className="text-red-100 text-sm mt-1">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <CardapioDigital whatsappUrl={WHATSAPP_URL} />

        {/* FEATURES */}
        <section id="funcionalidades" className="py-24 bg-white">
          <div className="max-w-6xl mx-auto px-6">
            <div className="text-center mb-16">
              <p className="text-red-600 text-sm font-semibold uppercase tracking-widest mb-3">Funcionalidades</p>
              <h2 className="font-bold tracking-tight text-3xl md:text-4xl text-gray-900 mb-4">
                Tudo que sua operação precisa
              </h2>
              <p className="text-gray-500 text-lg max-w-2xl mx-auto">
                Desenvolvido especialmente para produtores de alimentos, doceiras, salgadeiras e quem vende em mercados e pontos de venda.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {features.map((f, i) => (
                <div key={i} className="group p-6 rounded-2xl border border-gray-100 hover:border-red-200 hover:shadow-lg hover:shadow-red-50 transition-all">
                  <div className="w-12 h-12 bg-red-50 group-hover:bg-red-600 rounded-xl flex items-center justify-center mb-4 transition-colors">
                    <f.icon className="h-6 w-6 text-red-600 group-hover:text-white transition-colors" />
                  </div>
                  <h3 className="font-semibold tracking-tight text-gray-900 mb-2">{f.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <SystemTour />
        <HowItWorks />
        <Segments />

        {/* PLANS */}
        <section id="planos" className="py-24 bg-[#0F172A]">
          <div className="max-w-6xl mx-auto px-6">
            <div className="text-center mb-16">
              <p className="text-red-500 text-sm font-semibold uppercase tracking-widest mb-3">Planos</p>
              <h2 className="font-bold tracking-tight text-3xl md:text-4xl text-white mb-4">
                Simples e transparente
              </h2>
              <p className="text-gray-400 text-lg">Comece com o plano certo para o seu negócio. Cancele quando quiser.</p>
            </div>

            {/* Mobile: carousel buttons */}
            <div className="flex justify-center gap-2 mb-6 md:hidden">
              {plans.map((p, i) => (
                <button key={i} onClick={() => setActivePlan(i)}
                  className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${activePlan === i ? 'bg-red-600 text-white' : 'bg-white/10 text-gray-400'}`}>
                  {p.name}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {plans.map((plan, i) => (
                <div key={i}
                  className={`relative rounded-3xl overflow-hidden transition-all ${
                    plan.highlight ? 'ring-2 ring-red-500 scale-105 shadow-2xl shadow-red-900/50' : ''
                  } ${!plan.highlight && i !== activePlan ? 'hidden md:block' : ''}`}>
                  {plan.highlight && (
                    <div className="bg-red-500 text-white text-xs font-bold text-center py-2 tracking-widest uppercase">
                      ⭐ Mais Popular
                    </div>
                  )}
                  <div className={`bg-gradient-to-br ${plan.color} p-8 h-full`}>
                    <div className="mb-6">
                      <p className="font-bold tracking-tight text-white/80 text-sm mb-1">{plan.name}</p>
                      <div className="flex items-end gap-1 mb-2">
                        <span className="text-white/70 text-lg">R$</span>
                        <span className="font-black tracking-tight text-5xl text-white">{plan.price}</span>
                        <span className="text-white/70 text-sm mb-1">/mês</span>
                      </div>
                      <p className="text-white/70 text-sm">{plan.desc}</p>
                    </div>
                    <ul className="space-y-3 mb-8">
                      {plan.items.map((item, j) => (
                        <li key={j} className="flex items-center gap-3 text-sm text-white/80">
                          <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: plan.accent + '33' }}>
                            <Check className="h-3 w-3" style={{ color: plan.accent }} />
                          </div>
                          {item}
                        </li>
                      ))}
                    </ul>
                    <a href={WHATSAPP_URL} target="_blank" rel="noreferrer"
                      className={`block text-center font-semibold py-3.5 rounded-xl transition-all text-sm ${
                        plan.highlight
                          ? 'bg-red-500 hover:bg-red-400 text-white shadow-lg'
                          : 'bg-white/10 hover:bg-white/20 text-white'
                      }`}>
                      Quero este plano
                    </a>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-center text-gray-400 text-sm mt-8">
              Não tem certeza qual escolher?{' '}
              <a href={WHATSAPP_URL} target="_blank" rel="noreferrer" className="text-red-400 hover:text-red-300 font-semibold">
                Fale conosco no WhatsApp →
              </a>
            </p>
          </div>
        </section>

        {/* TESTIMONIALS */}
        <section id="depoimentos" className="py-24 bg-white">
          <div className="max-w-6xl mx-auto px-6">
            <div className="text-center mb-16">
              <p className="text-red-600 text-sm font-semibold uppercase tracking-widest mb-3">Depoimentos</p>
              <h2 className="font-bold tracking-tight text-3xl md:text-4xl text-gray-900 mb-4">
                Quem usa, recomenda
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {testimonials.map((t, i) => (
                <div key={i} className="bg-gray-50 rounded-2xl p-6 border border-gray-100">
                  <div className="flex gap-1 mb-4">
                    {[...Array(5)].map((_, j) => (
                      <Star key={j} className="h-4 w-4 text-yellow-400 fill-yellow-400" />
                    ))}
                  </div>
                  <p className="text-gray-700 text-sm leading-relaxed mb-4">"{t.text}"</p>
                  <div>
                    <p className="font-semibold tracking-tight text-gray-900 text-sm">{t.name}</p>
                    <p className="text-gray-500 text-xs">{t.role}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <Faq />

        {/* CTA */}
        <section className="py-24 bg-red-600">
          <div className="max-w-4xl mx-auto px-6 text-center">
            <h2 className="font-black tracking-tight text-2xl sm:text-3xl md:text-4xl text-white mb-4">
              Pronto para ter controle total do seu negócio?
            </h2>
            <p className="text-red-100 text-lg mb-8 max-w-2xl mx-auto">
              Fale com a gente agora pelo WhatsApp e comece ainda hoje.
            </p>
            <a href={WHATSAPP_URL} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-3 bg-white text-red-600 font-bold text-lg px-10 py-5 rounded-2xl hover:bg-red-50 transition-all shadow-2xl active:scale-95">
              <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                <path d="M12 0C5.373 0 0 5.373 0 12c0 2.122.554 4.118 1.524 5.855L.055 23.454a.75.75 0 00.919.92l5.647-1.484A11.944 11.944 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75a9.728 9.728 0 01-4.993-1.373l-.358-.214-3.714.976.992-3.628-.234-.373A9.718 9.718 0 012.25 12C2.25 6.615 6.615 2.25 12 2.25S21.75 6.615 21.75 12 17.385 21.75 12 21.75z"/>
              </svg>
              Falar no WhatsApp
            </a>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="bg-[#0F172A] py-10 border-t border-white/5">
          <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center">
                <ReddulIcon className="h-5 w-5 text-white" />
              </div>
              <span className="font-bold tracking-tight text-white text-base lowercase">reddu</span>
            </div>
            <p className="text-gray-400 text-xs">© 2026 Reddu. Todos os direitos reservados.</p>
            <Link to="/login" className="text-gray-400 hover:text-white text-sm transition-colors">
              Área do cliente →
            </Link>
          </div>
        </footer>

      </div>
    </>
  );
}