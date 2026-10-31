import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Minus, Plus } from 'lucide-react';

export default function CompactQuantidadeInput({ value, onChange, min = 0, max = 9999 }) {
  const handleDecrement = () => {
    if (value > min) {
      onChange(Math.max(min, value - 1));
    }
  };

  const handleIncrement = () => {
    if (value < max) {
      onChange(Math.min(max, value + 1));
    }
  };

  const handleChange = (e) => {
    const val = parseFloat(e.target.value);
    if (!isNaN(val)) {
      if (val >= min && val <= max) {
        onChange(val);
      } else if (val > max) {
        onChange(max);
      }
    }
  };

  return (
    <div className="flex items-center gap-0.5 bg-gray-50 rounded p-0.5 border border-gray-200 shadow-sm w-fit">
      <Button
        variant="ghost"
        size="icon"
        type="button"
        className="pdv-compact-btn text-gray-500 hover:text-red-600 hover:bg-red-50 bg-white shadow-sm border border-gray-100"
        onClick={handleDecrement}
        disabled={value <= min}
      >
        <Minus className="h-3.5 w-3.5" />
      </Button>
      
      <Input
        type="number"
        value={value < 1 ? value.toFixed(1) : Math.floor(value)}
        onChange={handleChange}
        className="w-10 h-7 text-center font-bold text-xs border-none bg-transparent p-0 hide-spin-button focus-visible:ring-0 focus-visible:ring-offset-0"
        min={min}
        max={max}
      />
      
      <Button
        variant="ghost"
        size="icon"
        type="button"
        className="pdv-compact-btn text-gray-500 hover:text-green-600 hover:bg-green-50 bg-white shadow-sm border border-gray-100"
        onClick={handleIncrement}
        disabled={value >= max}
      >
        <Plus className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}