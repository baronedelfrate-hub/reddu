import React from 'react';
import { 
  Popover, 
  PopoverContent, 
  PopoverTrigger 
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, XCircle, FileText, AlertCircle, RefreshCw } from 'lucide-react';

export default function NFCeStatusBadge({ 
  status_fiscal, 
  nfe_chave, 
  nfe_erro_mensagem, 
  nfe_id, 
  onRetry 
}) {
  if (!status_fiscal) return null;

  const isPending = status_fiscal === 'pendente' || status_fiscal === 'emitting';
  const isEmitted = status_fiscal === 'emitido' || status_fiscal === 'success';
  const isError = status_fiscal === 'erro' || status_fiscal === 'error';

  let config = {
    icon: Clock,
    text: 'Processando NFC-e...',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200',
    iconClass: 'text-amber-600 animate-pulse'
  };

  if (isEmitted) {
    config = {
      icon: CheckCircle2,
      text: 'NFC-e Emitida',
      badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200',
      iconClass: 'text-emerald-600'
    };
  } else if (isError) {
    config = {
      icon: XCircle,
      text: 'Erro na NFC-e',
      badgeClass: 'bg-rose-100 text-rose-800 border-rose-300 hover:bg-rose-200',
      iconClass: 'text-rose-600'
    };
  }

  const Icon = config.icon;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-slate-400 rounded-full transition-transform hover:scale-105 active:scale-95">
          <Badge variant="outline" className={`px-2.5 py-1 gap-1.5 shadow-sm cursor-pointer select-none transition-colors border ${config.badgeClass}`}>
            <Icon className={`w-3.5 h-3.5 ${config.iconClass}`} strokeWidth={2.5} />
            <span className="font-bold text-[10px] tracking-wide uppercase">{config.text}</span>
          </Badge>
        </button>
      </PopoverTrigger>
      
      <PopoverContent className="w-80 p-4 rounded-xl shadow-lg border-slate-200" align="end" sideOffset={8}>
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-full mt-0.5 ${isEmitted ? 'bg-emerald-100 text-emerald-700' : isError ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
              <Icon className="w-5 h-5" strokeWidth={2.5} />
            </div>
            <div className="flex-1">
              <h4 className="font-bold text-slate-900 leading-none mb-1 text-sm">
                Status Fiscal: {isEmitted ? 'Autorizado' : isError ? 'Rejeitado' : 'Processando'}
              </h4>
              <p className="text-xs text-slate-500 leading-snug">
                {isEmitted 
                  ? 'A nota fiscal foi autorizada pela SEFAZ.' 
                  : isError 
                    ? 'Houve uma falha ao tentar emitir o cupom.' 
                    : 'Aguardando retorno da integração fiscal.'}
              </p>
            </div>
          </div>

          <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 space-y-2.5">
            {nfe_id && (
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                  <FileText className="w-3 h-3" /> Ref. Pedido (ID)
                </span>
                <span className="text-xs font-medium text-slate-900 font-mono bg-white px-2 py-1 rounded border border-slate-200 break-all select-all">
                  {nfe_id}
                </span>
              </div>
            )}
            
            {isEmitted && nfe_chave && (
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider flex items-center gap-1">
                  Chave de Acesso
                </span>
                <span className="text-[11px] font-semibold text-slate-800 font-mono bg-emerald-50 px-2 py-1.5 rounded border border-emerald-100 break-all select-all leading-relaxed">
                  {nfe_chave}
                </span>
              </div>
            )}

            {isError && nfe_erro_mensagem && (
              <div className="flex flex-col gap-1 mt-1">
                <span className="text-[10px] font-bold text-rose-600 uppercase tracking-wider flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> Detalhe do Erro
                </span>
                <div className="bg-rose-50 border border-rose-100 p-2 rounded text-xs text-rose-800 font-medium leading-relaxed max-h-32 overflow-y-auto">
                  {nfe_erro_mensagem}
                </div>
              </div>
            )}
          </div>

          {isError && onRetry && (
            <Button 
              onClick={onRetry} 
              variant="outline" 
              className="w-full gap-2 bg-white hover:bg-slate-50 border-slate-300 text-slate-700 shadow-sm"
            >
              <RefreshCw className="w-4 h-4 text-slate-500" />
              Tentar Novamente
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}