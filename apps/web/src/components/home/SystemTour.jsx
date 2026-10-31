import React from 'react';
import { BrowserFrame } from './Frames';

export default function SystemTour() {
  return (
    <section id="sistema" className="py-24 bg-[#0F172A]">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-14">
          <p className="text-red-500 text-sm font-semibold uppercase tracking-widest mb-3">Por dentro do sistema</p>
          <h2 className="font-bold tracking-tight text-3xl md:text-4xl text-white mb-4">Tudo em um painel só</h2>
          <p className="text-gray-300 text-lg max-w-2xl mx-auto">
            Veja o que vence, o que está acabando e como seu negócio está indo, sem abrir planilha.
          </p>
        </div>
        <div className="grid lg:grid-cols-5 gap-8 items-start">
          <figure className="lg:col-span-3">
            <BrowserFrame
              src="/screens/dashboard.webp"
              width={1357}
              height={615}
              label="Visão geral do negócio"
              alt="Painel do Reddu: alertas operacionais de lotes vencidos, vencendo em 7 dias e estoque mínimo, com indicadores do período"
            />
            <figcaption className="mt-4 text-sm text-gray-400">
              <span className="font-semibold text-white">Visão geral.</span> Alertas de validade e estoque mínimo e os números do período, num só lugar.
            </figcaption>
          </figure>
          <figure className="lg:col-span-2">
            <BrowserFrame
              src="/screens/alertas.webp"
              width={598}
              height={328}
              label="Alertas de estoque"
              alt="Tela de alertas de estoque com totais de lotes vencidos, vencendo em breve e estoque crítico, e gráficos"
            />
            <figcaption className="mt-4 text-sm text-gray-400">
              <span className="font-semibold text-white">Alertas de estoque.</span> Lotes vencidos, vencendo e abaixo do mínimo, com filtros por local.
            </figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}
