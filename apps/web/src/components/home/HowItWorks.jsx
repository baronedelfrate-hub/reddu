import React from 'react';
import { PackagePlus, Factory, ShoppingCart } from 'lucide-react';

const steps = [
  { icon: PackagePlus, title: 'Cadastre seus produtos', desc: 'Informe produtos, locais (freezer, loja, mercados) e preços. Em poucos minutos o sistema está pronto para uso.' },
  { icon: Factory, title: 'Registre a produção', desc: 'Cada produção vira um lote com validade e etiqueta com QR Code, para rastrear de onde veio e onde está.' },
  { icon: ShoppingCart, title: 'Venda e acompanhe', desc: 'Venda no PDV, no cardápio online ou nos mercados e veja estoque, vendas e alertas atualizados em tempo real.' },
];

export default function HowItWorks() {
  return (
    <section id="como-funciona" className="py-24 bg-gray-50">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-16">
          <p className="text-red-600 text-sm font-semibold uppercase tracking-widest mb-3">Como funciona</p>
          <h2 className="font-bold tracking-tight text-3xl md:text-4xl text-gray-900 mb-4">Comece em três passos</h2>
          <p className="text-gray-600 text-lg max-w-2xl mx-auto">Sem planilhas e sem complicação: do cadastro à primeira venda.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {steps.map((s, i) => (
            <div key={s.title} className="relative bg-white rounded-2xl border border-gray-100 p-8 shadow-sm">
              <span className="absolute -top-4 left-8 h-8 w-8 rounded-full bg-red-600 text-white text-sm font-bold flex items-center justify-center">
                {i + 1}
              </span>
              <div className="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center mb-4">
                <s.icon className="h-6 w-6 text-red-600" />
              </div>
              <h3 className="font-semibold tracking-tight text-gray-900 mb-2">{s.title}</h3>
              <p className="text-gray-600 text-sm leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
