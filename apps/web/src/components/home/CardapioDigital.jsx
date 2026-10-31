import React from 'react';
import { Check, ArrowRight, Wallet, CalendarClock, Ticket } from 'lucide-react';
import { PhoneFrame } from './Frames';

const benefits = [
  'Seu cardápio online com fotos, categorias, busca e promoções do dia',
  'Cashback para fazer o cliente voltar e pedir de novo',
  'Cupons de desconto e pedido mínimo configuráveis',
  'Pedidos agendados quando a loja está fechada',
  'Entrega com taxa por bairro e pagamento online',
  'Atendimento pelo WhatsApp integrado ao mesmo sistema',
];

export default function CardapioDigital({ whatsappUrl }) {
  return (
    <section id="cardapio" className="py-24 bg-gradient-to-b from-red-50 to-white overflow-hidden">
      <div className="max-w-6xl mx-auto px-6 grid lg:grid-cols-2 gap-16 items-center">
        <div>
          <p className="text-red-600 text-sm font-semibold uppercase tracking-widest mb-3">Cardápio digital</p>
          <h2 className="font-bold tracking-tight text-3xl md:text-4xl text-gray-900 mb-4">
            Seus clientes pedem sozinhos, a qualquer hora
          </h2>
          <p className="text-gray-600 text-lg mb-8 leading-relaxed">
            Cada empresa ganha um cardápio próprio, com a sua marca, ligado direto ao estoque e ao PDV. O pedido
            chega pronto no painel, sem anotar nada à mão.
          </p>
          <ul className="space-y-3 mb-10">
            {benefits.map((b) => (
              <li key={b} className="flex items-start gap-3 text-gray-700">
                <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-red-600">
                  <Check className="h-3 w-3 text-white" />
                </span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
          <a href={whatsappUrl} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold px-7 py-3.5 rounded-xl transition-colors shadow-lg shadow-red-600/20">
            Quero meu cardápio digital <ArrowRight className="h-5 w-5" />
          </a>
        </div>

        <div className="relative mx-auto w-full max-w-[300px] order-first lg:order-last">
          <div className="absolute -inset-10 rounded-full bg-red-200/60 blur-3xl" aria-hidden="true" />
          <PhoneFrame
            className="relative"
            src="/screens/cardapio.webp"
            width={336}
            height={615}
            alt="Cardápio digital no celular: banner da loja, cashback de 5%, itens para pedir de novo e promoção do dia"
          />
          <div className="absolute -left-14 top-24 hidden sm:flex items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-xl ring-1 ring-black/5">
            <Wallet className="h-4 w-4 text-emerald-600" />
            <span className="text-xs font-semibold text-gray-800">Cashback</span>
          </div>
          <div className="absolute -right-12 top-1/2 hidden sm:flex items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-xl ring-1 ring-black/5">
            <CalendarClock className="h-4 w-4 text-red-600" />
            <span className="text-xs font-semibold text-gray-800">Pedido agendado</span>
          </div>
          <div className="absolute -left-12 bottom-24 hidden sm:flex items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-xl ring-1 ring-black/5">
            <Ticket className="h-4 w-4 text-amber-600" />
            <span className="text-xs font-semibold text-gray-800">Cupons</span>
          </div>
        </div>
      </div>
    </section>
  );
}
