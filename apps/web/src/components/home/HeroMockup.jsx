import React from 'react';
import { BrowserFrame, PhoneFrame } from './Frames';

// Telas reais do sistema, com marca, nomes e locais anonimizados
export default function HeroMockup() {
  return (
    <div className="relative mx-auto w-full max-w-xl pb-10 sm:pb-12">
      <div className="absolute -inset-6 bg-red-600/20 blur-3xl rounded-full" aria-hidden="true" />
      <BrowserFrame
        eager
        className="relative"
        src="/screens/dashboard.webp"
        width={1357}
        height={615}
        label="Painel · Indicadores do negócio"
        alt="Painel do Reddu com faturamento, ticket médio, vendas por canal, giro de estoque e top mercados"
      />
      <PhoneFrame
        eager
        className="absolute -bottom-0 right-0 sm:-right-6 w-[34%] max-w-[170px]"
        src="/screens/cardapio.webp"
        width={336}
        height={615}
        alt="Cardápio digital no celular, com cashback, promoções e categorias"
      />
    </div>
  );
}
