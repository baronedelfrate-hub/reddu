import React from 'react';
import { BrowserFrame } from './Frames';

// Telas reais do sistema, com marca, nomes, locais e valores anonimizados
export default function HeroMockup() {
  return (
    <div className="relative mx-auto w-full max-w-xl pb-12 sm:pb-16">
      <div className="absolute -inset-6 bg-red-600/20 blur-3xl rounded-full" aria-hidden="true" />
      <BrowserFrame
        eager
        className="relative"
        src="/screens/dashboard.webp"
        width={1357}
        height={615}
        label="Painel · Visão geral do negócio"
        alt="Painel do Reddu com alertas de validade, estoque mínimo e indicadores de produção e vendas"
      />
      <BrowserFrame
        eager
        className="absolute bottom-0 right-0 sm:-right-6 w-[64%]"
        src="/screens/indicadores.webp"
        width={1357}
        height={615}
        label="Indicadores financeiros"
        alt="Indicadores financeiros do Reddu: faturamento, ticket médio, vendas por canal, giro de estoque e top mercados"
      />
    </div>
  );
}
