import React from 'react';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

export default function ItemTypeSelector({ value, onChange, disabled }) {
  return (
    <div className="space-y-3 pt-2 pb-1">
      <Label className="text-gray-700 font-semibold">Tipo do Item</Label>
      <RadioGroup 
        value={value} 
        onValueChange={onChange}
        className="flex gap-4"
        disabled={disabled}
      >
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="NORMAL" id="tipo-normal" />
          <Label htmlFor="tipo-normal" className="cursor-pointer text-gray-800">Normal</Label>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="BRINDE" id="tipo-brinde" />
          <Label htmlFor="tipo-brinde" className="cursor-pointer text-emerald-600">Brinde</Label>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="PERDA" id="tipo-perda" />
          <Label htmlFor="tipo-perda" className="cursor-pointer text-red-600">Perda/Quebra</Label>
        </div>
      </RadioGroup>
    </div>
  );
}