import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Minus, Plus } from 'lucide-react';

export default function QuantidadeInput({ value, onChange, min = 0, max = 9999 }) {
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
    <div className="flex items-center gap-1 bg-gray-50 rounded-lg p-1 border border-gray-200 shadow-sm w-fit">
      <Button
        variant="ghost"
        size="icon"
        type="button"
        className="h-10 w-10 md:h-11 md:w-11 rounded-md text-gray-500 hover:text-red-600 hover:bg-red-50 bg-white shadow-sm border border-gray-100 touch-target"
        onClick={handleDecrement}
        disabled={value <= min}
      >
        <Minus className="h-4 w-4 md:h-5 md:w-5" />
      </Button>
      
      <Input
        type="number"
        value={value < 1 ? value.toFixed(1) : Math.floor(value)}
        onChange={handleChange}
        className="w-12 md:w-14 h-10 md:h-11 text-center font-bold text-sm md:text-base border-none bg-transparent p-0 hide-spin-button focus-visible:ring-0 focus-visible:ring-offset-0"
        min={min}
        max={max}
      />
      
      <Button
        variant="ghost"
        size="icon"
        type="button"
        className="h-10 w-10 md:h-11 md:w-11 rounded-md text-gray-500 hover:text-green-600 hover:bg-green-50 bg-white shadow-sm border border-gray-100 touch-target"
        onClick={handleIncrement}
        disabled={value >= max}
      >
        <Plus className="h-4 w-4 md:h-5 md:w-5" />
      </Button>
    </div>
  );
}