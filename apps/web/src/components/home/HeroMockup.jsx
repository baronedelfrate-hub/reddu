import React from 'react';
import { QrCode, Check, AlertTriangle } from 'lucide-react';

const bars = [38, 55, 44, 70, 62, 85, 74];
const lotes = [
  { nome: 'Coxinha de frango', info: 'vence em 2 dias', cor: 'bg-amber-400' },
  { nome: 'Pão de queijo', info: 'vence em 5 dias', cor: 'bg-emerald-400' },
  { nome: 'Empada de palmito', info: 'vence em 9 dias', cor: 'bg-emerald-400' },
];

// Ilustração do sistema feita em HTML/CSS (valores fictícios, só para demonstração)
export default function HeroMockup() {
  return (
    <div className="relative mx-auto w-full max-w-xl" aria-hidden="true">
      <div className="absolute -inset-6 bg-red-600/20 blur-3xl rounded-full" />

      <div className="relative rounded-2xl border border-white/10 bg-[#111c33] shadow-2xl shadow-black/40 overflow-hidden">
        <div className="flex items-center gap-1.5 px-4 py-3 border-b border-white/10 bg-white/5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
          <span className="ml-3 text-[11px] text-gray-400">Painel · Visão geral</span>
        </div>

        <div className="p-4 sm:p-5 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {[['Estoque', '2.633', 'itens'], ['Vendas hoje', '57', 'pedidos'], ['Alertas', '3', 'lotes']].map(([t, v, s]) => (
              <div key={t} className="rounded-xl bg-white/5 border border-white/10 p-3">
                <p className="text-[10px] uppercase tracking-wide text-gray-400">{t}</p>
                <p className="text-xl font-bold text-white leading-tight">{v}</p>
                <p className="text-[10px] text-gray-400">{s}</p>
              </div>
            ))}
          </div>

          <div className="rounded-xl bg-white/5 border border-white/10 p-3">
            <p className="text-[11px] text-gray-300 mb-3">Produção x vendas (semana)</p>
            <div className="flex items-end gap-2 h-20">
              {bars.map((h, i) => (
                <div key={i} className="flex-1 flex items-end gap-0.5 h-full">
                  <div className="flex-1 rounded-t bg-red-500" style={{ height: `${h}%` }} />
                  <div className="flex-1 rounded-t bg-white/25" style={{ height: `${Math.max(h - 15, 10)}%` }} />
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl bg-white/5 border border-white/10 divide-y divide-white/10">
            {lotes.map((l) => (
              <div key={l.nome} className="flex items-center gap-3 px-3 py-2.5 pr-3 sm:pr-24">
                <span className={`h-2 w-2 rounded-full ${l.cor}`} />
                <span className="text-xs text-white flex-1">{l.nome}</span>
                <span className="text-[11px] text-gray-400">{l.info}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Celular: leitura de QR Code */}
      <div className="absolute -bottom-8 -right-2 sm:-right-8 w-32 sm:w-36 rounded-[1.6rem] border-4 border-gray-800 bg-white shadow-2xl p-3 text-gray-900">
        <div className="mx-auto mb-2 h-1 w-8 rounded-full bg-gray-300" />
        <div className="flex items-center justify-center rounded-lg bg-gray-100 py-3 mb-2">
          <QrCode className="h-12 w-12 text-gray-800" />
        </div>
        <p className="text-[10px] font-semibold leading-tight">Coxinha de frango</p>
        <p className="text-[9px] text-gray-500">Lote L-0421 · Freezer 2</p>
        <p className="mt-1.5 flex items-center gap-1 text-[9px] font-semibold text-emerald-600">
          <Check className="h-3 w-3" /> Validade ok
        </p>
        <p className="mt-0.5 flex items-center gap-1 text-[9px] text-amber-600">
          <AlertTriangle className="h-3 w-3" /> 2 dias para vencer
        </p>
      </div>
    </div>
  );
}
