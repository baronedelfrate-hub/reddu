import React from 'react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

export default function LoteTypeSelector({ 
  loteType, 
  onLoteTypeChange, 
  numeroLote, 
  onNumeroLoteChange, 
  validationError 
}) {
  
  const handleManualChange = (e) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
    onNumeroLoteChange(val);
  };

  return (
    <div className="space-y-4 bg-slate-50 p-4 rounded-lg border border-slate-100">
      <Label className="text-gray-900 font-medium text-base">Tipo de Lote</Label>
      <RadioGroup 
        value={loteType} 
        onValueChange={onLoteTypeChange} 
        className="flex gap-6 mt-2"
      >
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="automatico" id="automatico" />
          <Label htmlFor="automatico" className="cursor-pointer">Automático</Label>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="manual" id="manual" />
          <Label htmlFor="manual" className="cursor-pointer">Manual</Label>
        </div>
      </RadioGroup>

      {loteType === 'manual' && (
        <div className="space-y-2 mt-4 pt-4 border-t border-slate-200">
          <Label htmlFor="manual-lote" className="text-gray-900 font-medium text-sm">
            Número do Lote (Máx 6 dígitos) <span className="text-red-500">*</span>
          </Label>
          <Input
            id="manual-lote"
            placeholder="000123"
            value={numeroLote}
            onChange={handleManualChange}
            className={`bg-white text-gray-900 focus:ring-blue-500 max-w-[200px] ${validationError ? 'border-red-500 focus-visible:ring-red-500' : 'border-slate-200'}`}
          />
          {validationError && (
            <p className="text-sm text-red-500 mt-1 font-medium">{validationError}</p>
          )}
        </div>
      )}
    </div>
  );
}