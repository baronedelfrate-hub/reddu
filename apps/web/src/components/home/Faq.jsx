import React from 'react';
import { ChevronDown } from 'lucide-react';

const faqs = [
  { q: 'Preciso instalar algum programa?', a: 'Não. O Reddu funciona direto no navegador, no computador ou no celular. Para os operadores de mercado há também o app PWA, que se adiciona à tela inicial sem passar por loja de aplicativos.' },
  { q: 'O sistema emite nota fiscal?', a: 'Sim. A emissão de NFC-e é integrada via Focus NFe, com CPF ou CNPJ na nota. Ela está incluída nos planos Profissional e Enterprise.' },
  { q: 'Funciona no celular?', a: 'Sim. A operação nos mercados é pensada para o celular, com leitor de código de barras pela câmera, e os QR Codes das etiquetas mostram produto, validade e localização.' },
  { q: 'Tenho uma loja com cardápio online. O Reddu atende?', a: 'Sim. Há cardápio digital com pedidos, cupons, cashback e atendimento pelo WhatsApp, tudo ligado ao mesmo estoque.' },
  { q: 'Já uso planilhas. Consigo migrar?', a: 'Sim. Fale com a gente pelo WhatsApp e explique como você controla hoje: ajudamos a organizar o cadastro inicial.' },
  { q: 'Posso cancelar quando quiser?', a: 'Sim. Os planos são mensais e podem ser cancelados a qualquer momento.' },
];

export default function Faq() {
  return (
    <section id="faq" className="py-24 bg-gray-50">
      <div className="max-w-3xl mx-auto px-6">
        <div className="text-center mb-12">
          <p className="text-red-600 text-sm font-semibold uppercase tracking-widest mb-3">Perguntas frequentes</p>
          <h2 className="font-bold tracking-tight text-3xl md:text-4xl text-gray-900">Ficou com alguma dúvida?</h2>
        </div>
        <div className="space-y-3">
          {faqs.map((f) => (
            <details key={f.q} className="group bg-white rounded-xl border border-gray-100 px-5 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-gray-900 text-sm md:text-base [&::-webkit-details-marker]:hidden">
                {f.q}
                <ChevronDown className="h-5 w-5 flex-shrink-0 text-red-600 transition-transform group-open:rotate-180" />
              </summary>
              <p className="mt-3 text-sm text-gray-600 leading-relaxed">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
