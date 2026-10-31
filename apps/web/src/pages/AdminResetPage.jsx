import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { AlertTriangle, Download, RotateCcw, ShieldAlert, CheckCircle2, Loader2, Database, Search, XCircle, Clock, Info, PackageX } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { verifyResetResults, OPERATIONAL_TABLES } from '@/utils/verifyResetResults';

export default function AdminResetPage() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  
  const [empresaId, setEmpresaId] = useState('');
  const [empresaNome, setEmpresaNome] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupDone, setBackupDone] = useState(false);
  
  const [isResetting, setIsResetting] = useState(false);
  const [showFirstConfirm, setShowFirstConfirm] = useState(false);
  const [showSecondConfirm, setShowSecondConfirm] = useState(false);
  
  // Reset Results from RPC
  const [rpcResult, setRpcResult] = useState(null);
  const [rpcErrors, setRpcErrors] = useState([]);
  
  // Verification State
  const [isVerifying, setIsVerifying] = useState(false);
  const [countsBefore, setCountsBefore] = useState(null);
  const [countsAfter, setCountsAfter] = useState(null);
  const [verificationTime, setVerificationTime] = useState(null);
  const [isFullyClean, setIsFullyClean] = useState(null);

  // Integrity Check State
  const [isCheckingIntegrity, setIsCheckingIntegrity] = useState(false);
  const [orphanedBandejas, setOrphanedBandejas] = useState(null);

  const validateEmpresa = async () => {
    if (!empresaId || empresaId.trim() === '') {
      toast({ title: 'Aviso', description: 'Digite um ID de empresa.', variant: 'destructive' });
      return;
    }

    setIsValidating(true);
    setRpcResult(null);
    setRpcErrors([]);
    setBackupDone(false);
    setCountsBefore(null);
    setCountsAfter(null);
    setIsFullyClean(null);
    setOrphanedBandejas(null);

    try {
      const { data, error } = await supabase
        .from('empresas')
        .select('*')
        .eq('id', empresaId.trim());

      if (error) throw error;
      if (!data || data.length === 0) {
        setEmpresaNome('');
        toast({ title: 'Erro', description: 'Empresa não encontrada.', variant: 'destructive' });
        return;
      }

      setEmpresaNome(data[0].nome);
      toast({ title: 'Empresa Encontrada', description: `Iniciando contagem de dados para ${data[0].nome}...` });
      
      await runVerification(true);
      
    } catch (error) {
      toast({ title: 'Erro', description: 'ID inválido ou ocorreu uma falha inesperada.', variant: 'destructive' });
    } finally {
      setIsValidating(false);
    }
  };

  const runVerification = async (isInitial = false) => {
    setIsVerifying(true);
    try {
      const res = await verifyResetResults(empresaId.trim());
      
      if (isInitial) {
        setCountsBefore(res.counts);
      } else {
        setCountsAfter(res.counts);
        setIsFullyClean(res.allEmpty);
      }
      setVerificationTime(new Date());
      
      if (!isInitial) {
        if (res.allEmpty) {
          toast({ title: 'Limpeza Confirmada', description: 'Todas as tabelas operacionais estão vazias!', className: 'bg-green-600 text-white border-none' });
        } else {
          toast({ title: 'Atenção', description: 'Ainda existem dados em algumas tabelas. Verifique os detalhes.', variant: 'destructive' });
        }
      }
    } catch (error) {
      console.error(error);
      toast({ title: 'Erro na Verificação', description: 'Não foi possível contar os registros.', variant: 'destructive' });
    } finally {
      setIsVerifying(false);
    }
  };

  const runIntegrityCheck = async () => {
    setIsCheckingIntegrity(true);
    try {
      const { data, error } = await supabase
        .from('lotes')
        .select('id, numero_lote, created_at')
        .eq('empresa_id', empresaId.trim())
        .eq('tipo_lote', 'bandeja')
        .is('lote_origem_id', null);
      
      if (error) throw error;
      setOrphanedBandejas(data || []);
      
      if (data && data.length > 0) {
        data.forEach(b => console.warn(`Data Integrity Warning: Bandeja Orfã Encontrada: ${b.numero_lote} (ID: ${b.id})`));
        toast({ title: 'Aviso de Integridade', description: `Encontradas ${data.length} bandejas sem lote de origem.`, variant: 'destructive' });
      } else {
        toast({ title: 'Integridade OK', description: 'Todas as bandejas possuem lote de origem vinculado.', className: 'bg-green-600 text-white border-none' });
      }
    } catch (err) {
      toast({ title: 'Erro de Integridade', description: 'Falha ao verificar as bandejas.', variant: 'destructive' });
    } finally {
      setIsCheckingIntegrity(false);
    }
  };

  const handleBackup = async () => {
    setIsBackingUp(true);
    try {
      const { data, error } = await supabase.functions.invoke('backup-empresa', {
        body: { empresa_id: empresaId.trim() }
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.message);

      const blob = new Blob([data.backup_file], { type: 'text/sql' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup_${empresaNome.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${new Date().toISOString().split('T')[0]}.sql`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setBackupDone(true);
      toast({ title: 'Backup concluído', description: 'O arquivo SQL foi baixado.', className: 'bg-green-600 text-white border-none' });
    } catch (error) {
      toast({ title: 'Erro no Backup', description: error.message, variant: 'destructive' });
    } finally {
      setIsBackingUp(false);
    }
  };

  const executeReset = async () => {
    setShowSecondConfirm(false);
    setIsResetting(true);
    setRpcResult(null);
    setRpcErrors([]);
    
    try {
      const { data, error } = await supabase.rpc('reset_operacional_rpc', {
        p_empresa_id: empresaId.trim()
      });

      if (error) throw error;
      
      setRpcResult(data.deleted_records);
      
      if (data.errors && data.errors.length > 0) {
        setRpcErrors(data.errors);
        toast({ title: 'Reset Concluído com Erros', description: 'Algumas tabelas falharam ao ser limpas. Verifique o log.', variant: 'destructive' });
      } else if (!data.success) {
        toast({ title: 'Aviso de Reset', description: data.message || 'Falha parcial no reset.', variant: 'destructive' });
      } else {
        toast({ title: 'Reset Executado', description: 'Função de limpeza finalizou com sucesso. Verificando resultados...', className: 'bg-green-600 text-white border-none' });
      }
      
      await runVerification(false);
      
    } catch (error) {
      console.error("Exceção na chamada RPC:", error);
      toast({ title: 'Erro Crítico no Reset', description: error.message || 'Falha ao executar a RPC.', variant: 'destructive' });
    } finally {
      setIsResetting(false);
    }
  };

  if (!isAdmin()) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center p-12 bg-white rounded-lg shadow border border-red-100 mt-6">
          <ShieldAlert className="h-16 w-16 text-red-500 mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Acesso Negado</h2>
          <p className="text-gray-600 text-center max-w-md">Você não tem permissão para acessar esta página. Apenas administradores do sistema podem realizar o reset operacional.</p>
        </div>
      </DashboardLayout>
    );
  }

  const currentDisplayCounts = countsAfter || countsBefore || {};
  const hasVerificationData = Object.keys(currentDisplayCounts).length > 0;
  const hasRpcErrors = rpcErrors.length > 0;

  let headerIcon = <Database className="h-6 w-6 text-blue-600" />;
  let headerTitleClass = "text-blue-800";
  let headerTitleText = "Análise de Pré-Reset";
  let headerBgClass = "bg-blue-50 border-blue-200";

  if (countsAfter !== null) {
    if (isFullyClean) {
      headerIcon = <CheckCircle2 className="h-6 w-6 text-green-600" />;
      headerTitleClass = "text-green-800";
      headerTitleText = "Limpeza Total Confirmada";
      headerBgClass = "bg-green-50 border-green-200";
    } else {
      headerIcon = <AlertTriangle className="h-6 w-6 text-red-600" />;
      headerTitleClass = "text-red-800";
      headerTitleText = "Atenção: Resíduos Detectados";
      headerBgClass = "bg-red-50 border-red-200";
    }
  }

  return (
    <>
      <Helmet><title>Reset Operacional - Administração</title></Helmet>
      
      <div className="space-y-6 max-w-5xl mx-auto pb-12 mt-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <ShieldAlert className="h-8 w-8 text-red-600" /> Reset Operacional Avançado
          </h1>
          <p className="text-gray-600 mt-1">Painel de controle com validação profunda para zerar completamente a base de dados operacionais.</p>
        </div>

        <Card className="border-red-200 shadow-sm">
          <CardHeader className="bg-red-50/50 border-b border-red-100 pb-4">
            <CardTitle className="text-red-800 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" /> ZONA DE PERIGO
            </CardTitle>
            <CardDescription className="text-red-600/80">
              O processo de deleção é rastreado em detalhes. A deleção obedece a hierarquia de restrições do banco para evitar conflitos.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-6">

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="empresa_id">ID da Empresa (UUID)</Label>
                <div className="flex gap-2">
                  <Input 
                    id="empresa_id" 
                    placeholder="Ex: 123e4567-e89b-12d3-a456-426614174000" 
                    value={empresaId}
                    onChange={(e) => setEmpresaId(e.target.value)}
                    className="font-mono max-w-md"
                  />
                  <Button variant="secondary" onClick={validateEmpresa} disabled={isValidating}>
                    {isValidating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Validar e Contar Dados'}
                  </Button>
                </div>
              </div>

              {empresaNome && (
                <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg flex flex-col space-y-4">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                      <p className="text-sm text-gray-500 font-medium uppercase tracking-wider">Empresa Selecionada</p>
                      <p className="text-xl font-bold text-gray-900">{empresaNome}</p>
                    </div>
                    
                    <div className="flex gap-3 w-full sm:w-auto flex-wrap">
                      <Button variant="outline" onClick={() => runVerification(false)} disabled={isVerifying || isResetting} className="gap-2 bg-white">
                        {isVerifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} 
                        Atualizar Contagem
                      </Button>

                      <Button variant="outline" onClick={handleBackup} disabled={isBackingUp || isResetting} className="gap-2 bg-white border-blue-200 text-blue-700 hover:bg-blue-50">
                        {isBackingUp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} 
                        Gerar Backup
                      </Button>
                      
                      <Button variant="destructive" onClick={() => setShowFirstConfirm(true)} disabled={isResetting || isBackingUp} className="gap-2 shadow-sm">
                        {isResetting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                        {countsAfter ? 'Tentar Reset Novamente' : 'Iniciar Reset Total'}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {hasRpcErrors && (
                <Alert className="bg-red-50 border-red-300">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  <AlertTitle className="text-red-800 font-bold">Erros durante a execução do banco de dados</AlertTitle>
                  <AlertDescription className="text-red-700 mt-2">
                    <ul className="list-disc pl-5 space-y-1 text-sm font-mono">
                      {rpcErrors.map((err, i) => (
                        <li key={i}><strong>{err.table}:</strong> {err.error}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              {hasVerificationData && (
                <div className="mt-8 border border-gray-200 rounded-xl overflow-hidden shadow-sm bg-white">
                  <div className={`p-4 border-b flex items-center justify-between ${headerBgClass}`}>
                    <div className="flex items-center gap-3">
                      {headerIcon}
                      <div>
                        <h3 className={`font-bold text-lg ${headerTitleClass}`}>
                          {headerTitleText}
                        </h3>
                        {verificationTime && (
                          <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                            <Clock className="h-3 w-3" /> Última verificação: {verificationTime.toLocaleTimeString('pt-BR')}
                          </p>
                        )}
                      </div>
                    </div>
                    {isVerifying && <Loader2 className="h-5 w-5 animate-spin text-gray-400" />}
                  </div>
                  
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-gray-50">
                        <TableRow>
                          <TableHead className="w-1/3">Tabela Operacional</TableHead>
                          <TableHead className="text-right">Registros Antes</TableHead>
                          {countsAfter && (
                            <>
                              <TableHead className="text-right">Ação RPC (Deletados)</TableHead>
                              <TableHead className="text-right font-bold">Registros Agora</TableHead>
                              <TableHead className="text-center">Status Final</TableHead>
                            </>
                          )}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {OPERATIONAL_TABLES.map((table) => {
                          const before = countsBefore ? countsBefore[table] : null;
                          const after = countsAfter ? countsAfter[table] : null;
                          const rpcDeleted = rpcResult && rpcResult[table] !== undefined ? rpcResult[table] : null;
                          
                          const current = after !== null ? after : before;
                          const isError = current === -1;
                          const isEmpty = current === 0;

                          const isAlertRow = countsAfter !== null && !isEmpty && !isError;
                          const rowClass = isAlertRow ? 'bg-red-50/30' : '';

                          let beforeText = '-';
                          if (before !== null) {
                            beforeText = before === -1 ? 'Erro' : String(before);
                          }

                          let deletedText = '-';
                          if (rpcDeleted !== null) {
                            deletedText = '-' + rpcDeleted;
                          }

                          let currentText = String(current);
                          if (isError) {
                            currentText = 'Erro L.';
                          }

                          let currentClass = 'text-right font-bold ';
                          if (isEmpty) {
                            currentClass += 'text-gray-400';
                          } else if (isError) {
                            currentClass += 'text-orange-500';
                          } else {
                            currentClass += 'text-red-600 text-lg';
                          }

                          return (
                            <TableRow key={table} className={rowClass}>
                              <TableCell className="font-medium text-gray-700 font-mono text-xs">
                                {table}
                              </TableCell>
                              <TableCell className="text-right text-gray-500">
                                {beforeText}
                              </TableCell>
                              
                              {countsAfter !== null && (
                                <>
                                  <TableCell className="text-right text-blue-600 font-mono text-xs">
                                    {deletedText}
                                  </TableCell>
                                  <TableCell className={currentClass}>
                                    {currentText}
                                  </TableCell>
                                  <TableCell className="text-center">
                                    {isError && (
                                      <span className="inline-flex items-center gap-1 text-orange-700 bg-orange-50 px-2 py-1 rounded-full text-xs font-semibold">
                                        <AlertTriangle className="h-3 w-3" /> Falha
                                      </span>
                                    )}
                                    {!isError && isEmpty && (
                                      <span className="inline-flex items-center gap-1 text-green-700 bg-green-50 px-2 py-1 rounded-full text-xs font-semibold">
                                        <CheckCircle2 className="h-3 w-3" /> Limpa
                                      </span>
                                    )}
                                    {!isError && !isEmpty && (
                                      <span className="inline-flex items-center gap-1 text-red-700 bg-red-100 px-2 py-1 rounded-full text-xs font-bold border border-red-200">
                                        <XCircle className="h-3 w-3" /> Restante
                                      </span>
                                    )}
                                  </TableCell>
                                </>
                              )}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  
                  {countsAfter !== null && !isFullyClean && (
                    <div className="p-4 bg-amber-50 border-t border-amber-200 text-amber-800 text-sm flex items-start gap-2">
                       <Info className="h-5 w-5 flex-shrink-0 text-amber-600" />
                       <p>
                         <strong>Atenção:</strong> Algumas tabelas ainda contêm dados. Isso geralmente ocorre devido a restrições de chave estrangeira (Foreign Keys) circulares ou complexas não previstas. Tente clicar em <strong>"Tentar Reset Novamente"</strong>. A repetição do processo pode forçar a exclusão dos dados órfãos.
                       </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {empresaNome && (
          <Card className="border-blue-200 shadow-sm mt-6">
            <CardHeader className="bg-blue-50/50 border-b border-blue-100 pb-4">
               <CardTitle className="text-blue-800 flex items-center gap-2 text-lg">
                  <PackageX className="h-5 w-5" /> Integridade de Dados de Lotes (Bandejas)
               </CardTitle>
               <CardDescription>
                 Verifique a consistência dos registros de lotes identificando lotes do tipo "bandeja" que não possuem vínculo de origem.
               </CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              <Button onClick={runIntegrityCheck} disabled={isCheckingIntegrity || !empresaId} variant="outline" className="gap-2 border-blue-200 text-blue-700 hover:bg-blue-50">
                {isCheckingIntegrity ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Verificar Bandejas Órfãs
              </Button>
              
              {orphanedBandejas && orphanedBandejas.length > 0 && (
                 <div className="mt-4 p-4 border border-red-200 bg-red-50 rounded-lg">
                   <h4 className="text-red-800 font-bold mb-2 flex items-center gap-2">
                     <AlertTriangle className="h-4 w-4" /> Bandejas com problemas ({orphanedBandejas.length}):
                   </h4>
                   <ul className="list-disc pl-5 text-sm text-red-700 space-y-1">
                     {orphanedBandejas.map(b => (
                       <li key={b.id}>Lote: <strong>{b.numero_lote}</strong> (ID: {b.id.substring(0, 8)}... - Criado em: {new Date(b.created_at).toLocaleDateString()})</li>
                     ))}
                   </ul>
                   <p className="text-xs text-red-600 mt-3 font-semibold">Estes registros podem causar problemas de exibição nos relatórios. Uma intervenção manual ou execução do Reset Operacional pode ser necessária.</p>
                 </div>
              )}
              {orphanedBandejas && orphanedBandejas.length === 0 && (
                 <div className="mt-4 p-4 border border-green-200 bg-green-50 rounded-lg text-green-800 flex items-center gap-2 font-medium">
                   <CheckCircle2 className="h-5 w-5 text-green-600" />
                   Nenhuma bandeja órfã encontrada. A integridade estrutural dos lotes de bandeja está perfeita.
                 </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <AlertDialog open={showFirstConfirm} onOpenChange={setShowFirstConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-600 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" /> Autorizar Reset Operacional?
            </AlertDialogTitle>
            <AlertDialogDescription>
              A função <code className="bg-gray-100 px-1 rounded text-red-500">reset_operacional_rpc</code> será invocada no servidor para limpar a empresa <strong>{empresaNome}</strong>.
              {!backupDone && (
                <span className="block mt-4 p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded font-medium">
                  Aviso: Backup SQL não foi gerado nesta sessão. Se desejar salvar os dados antes, cancele agora.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => {
                setShowFirstConfirm(false);
                setTimeout(() => setShowSecondConfirm(true), 200);
              }}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Prosseguir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showSecondConfirm} onOpenChange={setShowSecondConfirm}>
        <AlertDialogContent className="border-red-300 bg-red-50">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-800 font-bold text-xl flex items-center gap-2">
              <ShieldAlert className="h-6 w-6" /> CONFIRMAÇÃO FINAL DE EXECUÇÃO
            </AlertDialogTitle>
            <AlertDialogDescription className="text-red-900 text-base font-medium mt-4 leading-relaxed">
              ATENÇÃO: A limpeza via banco de dados será executada AGORA.
              <br/><br/>
              Todos os registros listados na tabela serão marcados para <strong className="text-black uppercase">Exclusão Permanente (DELETE)</strong>. Esta operação causará perda de todos os relatórios, históricos e inventários.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-6">
            <AlertDialogCancel className="bg-white hover:bg-gray-100 text-gray-900">Abortar</AlertDialogCancel>
            <Button 
              variant="destructive"
              onClick={executeReset}
              className="gap-2 bg-red-700 hover:bg-red-800 text-white shadow-lg"
            >
              <RotateCcw className="h-4 w-4" /> CONFIRMAR DELEÇÃO
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}