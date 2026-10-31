import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Clock, Settings, CheckCircle2, XCircle } from 'lucide-react';

export default function PedidoStatusBadge({ status }) {
  switch (status) {
    case 'pendente':
      return (
        <Badge className="bg-yellow-500 hover:bg-yellow-600 text-white border-none gap-1.5 px-2.5 py-0.5">
          <Clock className="h-3.5 w-3.5" /> Pendente
        </Badge>
      );
    case 'em_producao':
      return (
        <Badge className="bg-blue-500 hover:bg-blue-600 text-white border-none gap-1.5 px-2.5 py-0.5">
          <Settings className="h-3.5 w-3.5" /> Em Produção
        </Badge>
      );
    case 'concluido':
      return (
        <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white border-none gap-1.5 px-2.5 py-0.5">
          <CheckCircle2 className="h-3.5 w-3.5" /> Concluído
        </Badge>
      );
    case 'cancelado':
      return (
        <Badge variant="destructive" className="bg-red-500 hover:bg-red-600 text-white border-none gap-1.5 px-2.5 py-0.5">
          <XCircle className="h-3.5 w-3.5" /> Cancelado
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="text-slate-500 gap-1.5 px-2.5 py-0.5">
          Desconhecido
        </Badge>
      );
  }
}