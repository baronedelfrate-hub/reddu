import React from 'react';
import { Button } from '@/components/ui/button';
import { Minus, Plus, Tag } from 'lucide-react';
import { Input } from '@/components/ui/input';

export default function CupomInput({ value, onChange }) {
  const handleDecrement = () => {
    if (value >= 0.5) onChange(value - 0.5);
    else if (value > 0) onChange(0);
  };

  const handleIncrement = () => {
    onChange(value + 0.5);
  };

  const handleChange = (e) => {
    if (e.target.value === '') {
      onChange(0);
      return;
    }
    const val = parseFloat(e.target.value);
    if (!isNaN(val) && val >= 0) {
      onChange(val);
    }
  };

  return (
    <div className="space-y-1 w-full">
      <label className="text-[10px] font-bold text-gray-600 uppercase tracking-wider flex items-center gap-1">
        <Tag className="h-3 w-3" /> Desconto (R$)
      </label>
      <div className="flex items-center gap-0.5 bg-white border border-gray-200 rounded p-0.5 shadow-sm w-full transition-colors focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-400">
        <Button 
          variant="ghost" 
          size="icon" 
          type="button"
          className="h-7 w-7 rounded-sm hover:bg-red-50 hover:text-red-600 transition-colors" 
          onClick={handleDecrement} 
          disabled={value <= 0}
        >
          <Minus className="h-3.5 w-3.5" />
        </Button>
        <Input 
          type="number" 
          step="0.5" 
          className="flex-1 h-7 text-center font-bold text-xs border-none p-0 hide-spin-button focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent" 
          value={value || ''} 
          onChange={handleChange} 
          placeholder="0,00" 
        />
        <Button 
          variant="ghost" 
          size="icon" 
          type="button"
          className="h-7 w-7 rounded-sm hover:bg-green-50 hover:text-green-600 transition-colors" 
          onClick={handleIncrement}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}