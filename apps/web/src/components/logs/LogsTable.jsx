import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import ExpandableJSON from './ExpandableJSON';

export default function LogsTable({ logs }) {
  
  const getAcaoBadge = (acao) => {
    switch (acao) {
      case 'criar': return <Badge className="bg-green-100 text-green-800 border-none hover:bg-green-200">Criar</Badge>;
      case 'editar': return <Badge className="bg-blue-100 text-blue-800 border-none hover:bg-blue-200">Editar</Badge>;
      case 'deletar': return <Badge className="bg-red-100 text-red-800 border-none hover:bg-red-200">Deletar</Badge>;
      default: return <Badge variant="outline">{acao}</Badge>;
    }
  };

  const getEntidadeBadge = (entidade) => {
    switch (entidade) {
      case 'producao': return <Badge variant="outline" className="bg-purple-50">Produção</Badge>;
      case 'venda': return <Badge variant="outline" className="bg-emerald-50">Venda</Badge>;
      case 'transferencia': return <Badge variant="outline" className="bg-orange-50">Transferência</Badge>;
      case 'ajuste_manual': return <Badge variant="outline" className="bg-gray-100">Ajuste</Badge>;
      case 'produto': return <Badge variant="outline" className="bg-cyan-50">Produto</Badge>;
      case 'lote': return <Badge variant="outline" className="bg-indigo-50">Lote</Badge>;
      case 'usuario': return <Badge variant="outline" className="bg-rose-50">Usuário</Badge>;
      default: return <Badge variant="outline">{entidade}</Badge>;
    }
  };

  if (!logs || logs.length === 0) {
    return (
      <div className="text-center p-8 bg-white rounded-lg border border-gray-200">
        <p className="text-gray-500">Nenhum registro de auditoria encontrado para os filtros selecionados.</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-gray-200 bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-gray-50/50">
            <TableRow>
              <TableHead className="w-[180px]">Data e Hora</TableHead>
              <TableHead className="min-w-[150px]">Usuário</TableHead>
              <TableHead>Ação</TableHead>
              <TableHead>Entidade</TableHead>
              <TableHead className="min-w-[200px]">Dados Antes</TableHead>
              <TableHead className="min-w-[200px]">Dados Depois</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map((log) => (
              <TableRow key={log.id} className="hover:bg-gray-50/50">
                <TableCell className="text-sm font-medium text-gray-700 whitespace-nowrap">
                  {new Date(log.created_at).toLocaleString('pt-BR')}
                </TableCell>
                <TableCell className="text-sm text-gray-600">
                  {log.usuarios?.nome || <span className="text-gray-400 italic">Sistema/Desconhecido</span>}
                </TableCell>
                <TableCell>{getAcaoBadge(log.acao)}</TableCell>
                <TableCell>{getEntidadeBadge(log.entidade)}</TableCell>
                <TableCell>
                  <ExpandableJSON data={log.dados_antes} label="Antes" />
                </TableCell>
                <TableCell>
                  <ExpandableJSON data={log.dados_depois} label="Depois" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}