import React from 'react';
import { Info } from 'lucide-react';

export default function PrinterSelector() {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-3 items-start w-full">
      <Info className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
      <div className="text-sm text-blue-800">
        <p className="font-bold mb-1 text-blue-900">Impressão Nativa do Sistema</p>
        <p className="text-blue-800/90 leading-relaxed">
          Ao clicar em imprimir, a caixa de diálogo padrão do seu sistema será aberta. 
          Certifique-se de selecionar sua impressora térmica e ajustar o tamanho do papel para <strong>80mm x 50mm</strong> sem margens.
        </p>
      </div>
    </div>
  );
}