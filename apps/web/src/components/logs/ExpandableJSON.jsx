import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ExpandableJSON({ data, label = "Dados" }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!data) return <span className="text-gray-400 italic text-sm">Vazio</span>;

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="border border-gray-200 rounded-md overflow-hidden bg-gray-50 max-w-sm">
      <div 
        className="flex items-center justify-between px-3 py-2 bg-gray-100 cursor-pointer hover:bg-gray-200 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          {label}
        </div>
        {isExpanded && (
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-6 w-6 text-gray-500 hover:text-gray-700" 
            onClick={(e) => { e.stopPropagation(); handleCopy(); }}
            title="Copiar JSON"
          >
            {copied ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
          </Button>
        )}
      </div>
      
      {isExpanded && (
        <div className="p-3 border-t border-gray-200 overflow-auto max-h-60 bg-white">
          <pre className="text-xs text-gray-800 font-mono whitespace-pre-wrap break-all">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}