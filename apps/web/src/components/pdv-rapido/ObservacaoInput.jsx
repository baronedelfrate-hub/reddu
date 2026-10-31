import React, { useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { MessageSquare, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ObservacaoInput({ value, onChange }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="w-full flex flex-col">
      <Button 
        variant="ghost" 
        size="sm" 
        className="w-full justify-between h-8 px-2 text-[10px] font-bold text-gray-600 uppercase tracking-wider bg-gray-50 border border-gray-200 hover:bg-gray-100"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="flex items-center gap-1">
          <MessageSquare className="h-3 w-3" /> Observações {value ? '(1)' : ''}
        </span>
        {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </Button>
      
      {isOpen && (
        <div className="relative mt-1">
          <Textarea 
            placeholder="Anotações..." 
            value={value} 
            onChange={(e) => onChange(e.target.value)} 
            className="h-16 min-h-[64px] w-full resize-none bg-white border-gray-200 text-xs placeholder:text-gray-400 shadow-sm focus-visible:ring-1 focus-visible:ring-blue-400 rounded p-2 pb-5"
            maxLength={200}
          />
          <div className="absolute bottom-1 right-1 text-[9px] text-gray-400 font-medium">
            {value.length}/200
          </div>
        </div>
      )}
    </div>
  );
}