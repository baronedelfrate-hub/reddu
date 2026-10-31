import React from 'react';
import { Cookie, Utensils, Snowflake, Store } from 'lucide-react';

const segments = [
  { icon: Utensils, title: 'Salgadeiras', desc: 'Controle de lotes e validade de salgados congelados e fritos na hora.' },
  { icon: Cookie, title: 'Doceiras e confeitarias', desc: 'Produção, etiquetas e vendas no balcão, por encomenda e pelo cardápio online.' },
  { icon: Snowflake, title: 'Congelados e pequenas indústrias', desc: 'Rastreio por lote, estoque por local e tabela nutricional nas etiquetas.' },
  { icon: Store, title: 'Quem vende em mercados', desc: 'Consignado, auditoria de freezers, reposição e fechamento por ponto de venda.' },
];

export default function Segments() {
  return (
    <section className="py-24 bg-white">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-16">
          <p className="text-red-600 text-sm font-semibold uppercase tracking-widest mb-3">Para quem é</p>
          <h2 className="font-bold tracking-tight text-3xl md:text-4xl text-gray-900 mb-4">Feito para o seu tipo de negócio</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {segments.map((s) => (
            <div key={s.title} className="rounded-2xl border border-gray-100 p-6 hover:border-red-200 transition-colors">
              <s.icon className="h-8 w-8 text-red-600 mb-4" />
              <h3 className="font-semibold tracking-tight text-gray-900 mb-2">{s.title}</h3>
              <p className="text-gray-600 text-sm leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
