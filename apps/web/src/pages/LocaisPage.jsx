import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { MapPin, Plus, Pencil, Trash2, AlertCircle, Lock, Package } from 'lucide-react';
import { withEstoqueBandejas, STATIC_ESTOQUE_BANDEJAS_ID } from '@/lib/staticLocais';

const DEFAULT_FORM_DATA = { 
  nome: '', 
  tipo: 'Armazém',
  endereco: '',
  responsavel: '',
  telefone: '',
  equipamento_locado: '',
  data_inicio_parceria: '',
  controla_validade: true,
  controla_estoque: true,
  modelo_negocio: 'consignado',
  mostrar_no_pdv: false
};

export default function LocaisPage() {
  const [locais, setLocais] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editingLocal, setEditingLocal] = useState(null);
  const [deletingLocal, setDeletingLocal] = useState(null);
  const [formData, setFormData] = useState(DEFAULT_FORM_DATA);
  const { empresaId } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (empresaId) {
      fetchLocais();
    } else {
      setLoading(false);
    }
  }, [empresaId]);

  const fetchLocais = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('locais')
        .select('*')
        .eq('empresa_id', empresaId)
        .order('nome');

      if (error) throw error;
      setLocais(withEstoqueBandejas(data || []));
    } catch (error) {
      toast({
        title: 'Erro ao carregar locais',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenForm = (local = null) => {
    // Permitir a edição do local ESTOQUE BANDEJAS, mas bloquear os demais locais de sistema
    const isEstoqueBandejas = local?.nome?.trim().toUpperCase() === 'ESTOQUE BANDEJAS';

    if (local?.is_system && !isEstoqueBandejas) {
      toast({
        title: 'Ação não permitida',
        description: 'Local técnico ou estático não pode ser editado.',
        variant: 'destructive',
      });
      return;
    }

    setEditingLocal(local);
    setFormData(
      local ? { 
        nome: local.nome || '', 
        tipo: local.tipo || 'Armazém',
        endereco: local.endereco || '',
        responsavel: local.responsavel || '',
        telefone: local.telefone || '',
        equipamento_locado: local.equipamento_locado || '',
        data_inicio_parceria: local.data_inicio_parceria || '',
        controla_validade: local.controla_validade !== false,
        controla_estoque: local.controla_estoque !== false,
        modelo_negocio: local.modelo_negocio || 'consignado',
        mostrar_no_pdv: local.mostrar_no_pdv === true
      } : { ...DEFAULT_FORM_DATA }
    );
    setFormOpen(true);
  };

  const handleCloseForm = () => {
    setFormOpen(false);
    setEditingLocal(null);
    setFormData({ ...DEFAULT_FORM_DATA });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!empresaId) return;

    try {
      const payload = {
        nome: formData.nome,
        tipo: formData.tipo,
        empresa_id: empresaId,
        mostrar_no_pdv: formData.mostrar_no_pdv,
        ...(formData.tipo === 'Mercado' ? {
          endereco: formData.endereco,
          responsavel: formData.responsavel,
          telefone: formData.telefone,
          equipamento_locado: formData.equipamento_locado,
          data_inicio_parceria: formData.data_inicio_parceria || null,
          controla_validade: formData.controla_validade,
          controla_estoque: formData.controla_estoque,
          modelo_negocio: formData.modelo_negocio || 'consignado',
        } : {
          endereco: null,
          responsavel: null,
          telefone: null,
          equipamento_locado: null,
          data_inicio_parceria: null,
          controla_validade: true,
          controla_estoque: true,
        })
      };

      if (editingLocal) {
        const isEstoqueBandejas = editingLocal.nome?.trim().toUpperCase() === 'ESTOQUE BANDEJAS';

        if (editingLocal.is_system && !isEstoqueBandejas) {
          throw new Error('Locais de sistema não podem ser modificados.');
        }

        const { error } = await supabase
          .from('locais')
          .update(payload)
          .eq('id', editingLocal.id);

        if (error) throw error;

        toast({
          title: 'Local atualizado com sucesso!',
        });
      } else {
        const { error } = await supabase
          .from('locais')
          .insert(payload);

        if (error) throw error;

        toast({
          title: 'Local criado com sucesso!',
        });
      }

      handleCloseForm();
      fetchLocais();
    } catch (error) {
      toast({
        title: 'Erro ao salvar local',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const confirmDelete = (local) => {
    // Exclusão do ESTOQUE BANDEJAS continua bloqueada
    if (local?.is_system || local?.id === STATIC_ESTOQUE_BANDEJAS_ID) {
      toast({
        title: 'Ação não permitida',
        description: 'Local técnico ou estático não pode ser excluído.',
        variant: 'destructive',
      });
      return;
    }
    setDeletingLocal(local);
    setDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (!empresaId || !deletingLocal) return;

    try {
      const { error } = await supabase
        .from('locais')
        .delete()
        .eq('id', deletingLocal.id);

      if (error) throw error;

      toast({
        title: 'Local excluído com sucesso!',
      });

      setDeleteOpen(false);
      setDeletingLocal(null);
      fetchLocais();
    } catch (error) {
      toast({
        title: 'Erro ao excluir local',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const getTipoColor = (tipo) => {
    const t = tipo?.toLowerCase() || '';
    if (t.includes('armazém')) return 'bg-[var(--color-primary-light)]/20 text-[var(--color-primary-dark)] border-transparent';
    if (t.includes('loja')) return 'bg-green-100 text-green-800 border-transparent';
    if (t.includes('mercado')) return 'bg-purple-100 text-purple-800 border-transparent';
    if (t.includes('técnico') || t.includes('sistema')) return 'bg-gray-200 text-gray-800 border-transparent';
    return 'bg-gray-100 text-gray-800 border-transparent';
  };

  if (!empresaId) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center p-12 bg-white rounded-lg shadow border border-red-100 mt-6">
          <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Nenhuma empresa associada</h2>
          <p className="text-gray-600">Por favor, contate o administrador para associar sua conta a uma empresa.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <>
      <Helmet>
        <title>Locais - Sistema de Estoque</title>
        <meta name="description" content="Gerencie os locais de armazenamento" />
      </Helmet>

      <DashboardLayout>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Locais</h1>
              <p className="text-gray-600 mt-1">Gerencie os locais de armazenamento e mercados parceiros.</p>
            </div>
            <Button onClick={() => handleOpenForm()} className="gap-2">
              <Plus className="h-4 w-4" />
              Novo Local
            </Button>
          </div>

          <div className="bg-white rounded-lg shadow border border-gray-200">
            {loading ? (
              <div className="p-12 text-center flex flex-col items-center">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-[var(--color-primary)] border-r-transparent mb-4"></div>
                <p className="text-gray-600">Carregando locais...</p>
              </div>
            ) : locais.length === 0 ? (
              <div className="p-12 text-center">
                <MapPin className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">Nenhum local cadastrado</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-gray-50">
                    <TableRow>
                      <TableHead className="font-semibold">Nome</TableHead>
                      <TableHead className="font-semibold">Tipo</TableHead>
                      <TableHead className="font-semibold">Responsável / Contato</TableHead>
                      <TableHead className="font-semibold">Data de Criação</TableHead>
                      <TableHead className="text-right font-semibold">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {locais.map((local) => {
                      const isSystemStrict = local.is_system && local.id !== STATIC_ESTOQUE_BANDEJAS_ID;
                      const isEstoqueBandejas = local.nome?.replace(/\s+/g, ' ').trim().toUpperCase().includes('ESTOQUE BANDEJAS');
                      
                      return (
                        <TableRow key={local.id} className="hover:bg-gray-50">
                          <TableCell className="font-medium text-gray-900">
                            <div className="flex items-center gap-2">
                              {local.nome}
                              {local.is_system && (
                                <div title="Local de Sistema">
                                  <Lock className="h-3 w-3 text-gray-400" />
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={`${getTipoColor(local.tipo)} font-semibold`}>
                              {local.tipo}
                            </Badge>
                            {local.tipo === 'Mercado' && (
                              <Badge className={`ml-1.5 font-semibold ${local.modelo_negocio === 'venda_direta' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                                {local.modelo_negocio === 'venda_direta' ? 'Venda Direta' : 'Consignado'}
                              </Badge>
                            )}
                            {local.mostrar_no_pdv && (
                              <Badge className="ml-1.5 font-semibold bg-blue-600 text-white">
                                PDV
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-gray-600 text-sm">
                             {local.tipo === 'Mercado' ? (
                               <>
                                 {local.responsavel && <div>{local.responsavel}</div>}
                                 {local.telefone && <div className="text-gray-500">{local.telefone}</div>}
                                 {!local.responsavel && !local.telefone && <span className="text-gray-400">-</span>}
                               </>
                             ) : (
                               <span className="text-gray-400">-</span>
                             )}
                          </TableCell>
                          <TableCell className="text-gray-600">
                            {local.created_at ? new Date(local.created_at).toLocaleDateString('pt-BR') : '-'}
                          </TableCell>
                          <TableCell className="text-right space-x-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className={
                                local.is_system && !isEstoqueBandejas
                                  ? "border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed"
                                  : "border-gray-200 text-gray-700 hover:bg-gray-100"
                              }
                              onClick={() => handleOpenForm(local)}
                              disabled={local.is_system && !isEstoqueBandejas}
                              title={
                                local.is_system && !isEstoqueBandejas
                                  ? "Local de sistema não pode ser editado"
                                  : "Editar local"
                              }
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className={(local.is_system || local.id === STATIC_ESTOQUE_BANDEJAS_ID) ? "border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed" : "border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300"}
                              onClick={() => confirmDelete(local)}
                              disabled={local.is_system || local.id === STATIC_ESTOQUE_BANDEJAS_ID}
                              title={(local.is_system || local.id === STATIC_ESTOQUE_BANDEJAS_ID) ? "Local de sistema não pode ser excluído" : "Excluir local"}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>

        <Dialog open={formOpen} onOpenChange={setFormOpen}>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-gray-900">{editingLocal ? 'Editar Local' : 'Novo Local'}</DialogTitle>
              <DialogDescription className="text-gray-600">
                {editingLocal?.id === STATIC_ESTOQUE_BANDEJAS_ID 
                  ? 'Você está editando o local de sistema "ESTOQUE BANDEJAS". Apenas o tipo pode ser alterado.' 
                  : 'Preencha os dados do local de armazenamento ou mercado consignado.'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-6 py-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="nome" className="text-gray-900 font-medium">Nome do Local <span className="text-red-500">*</span></Label>
                  <Input
                    id="nome"
                    value={formData.nome}
                    onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                    placeholder="Ex: Depósito Central ou Mercado do Bairro"
                    required
                    disabled={editingLocal?.id === STATIC_ESTOQUE_BANDEJAS_ID}
                    className="bg-white text-gray-900 border-gray-300 disabled:bg-gray-100 disabled:text-gray-500"
                  />
                </div>
                
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="tipo" className="text-gray-900 font-medium">Tipo <span className="text-red-500">*</span></Label>
                  <Select
                    value={formData.tipo}
                    onValueChange={(value) => setFormData({ ...formData, tipo: value })}
                  >
                    <SelectTrigger className="bg-white text-gray-900 border-gray-300">
                      <SelectValue placeholder="Selecione o tipo..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Armazém">Armazém (Interno)</SelectItem>
                      <SelectItem value="Loja Própria">Loja Própria</SelectItem>
                      <SelectItem value="Mercado">Mercado Consignado</SelectItem>
                      <SelectItem value="Técnico">Técnico</SelectItem>
                      <SelectItem value="estoque">Estoque</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 md:col-span-2 bg-blue-50 p-4 rounded-lg border border-blue-200">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="mostrar_no_pdv"
                      checked={formData.mostrar_no_pdv}
                      onCheckedChange={(checked) => setFormData({ ...formData, mostrar_no_pdv: checked })}
                    />
                    <div className="grid gap-1.5 leading-none">
                      <label
                        htmlFor="mostrar_no_pdv"
                        className="text-sm font-medium leading-none text-gray-900"
                      >
                        Mostrar no PDV Rápido
                      </label>
                      <p className="text-xs text-gray-500">
                        Aparece como opção de estoque pra vender no PDV Rápido. Deixe desmarcado
                        pra locais que não devem aparecer lá (ex: estoque interno, devolução).
                      </p>
                    </div>
                  </div>
                </div>

                {formData.tipo === 'Mercado' && (
                  <>
                    <div className="space-y-3 md:col-span-2 pt-2 border-t border-gray-100">
                      <h4 className="font-semibold text-gray-900">Modelo de Negócio</h4>
                      <p className="text-xs text-gray-500 -mt-2">
                        Consignado: produto fica no mercado, e o pagamento é feito a cada fechamento de período
                        (baixa manual). Venda Direta: segue o fluxo normal de venda, sem esse controle de fechamento.
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, modelo_negocio: 'consignado' })}
                          className={`text-left p-3 rounded-xl border-2 transition-colors ${
                            formData.modelo_negocio === 'consignado'
                              ? 'border-teal-500 bg-teal-50'
                              : 'border-gray-200 hover:border-teal-300'
                          }`}
                        >
                          <p className={`text-sm font-bold ${formData.modelo_negocio === 'consignado' ? 'text-teal-700' : 'text-gray-700'}`}>Consignado</p>
                          <p className="text-xs text-gray-500 mt-0.5">Pagamento por fechamento de período</p>
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, modelo_negocio: 'venda_direta' })}
                          className={`text-left p-3 rounded-xl border-2 transition-colors ${
                            formData.modelo_negocio === 'venda_direta'
                              ? 'border-teal-500 bg-teal-50'
                              : 'border-gray-200 hover:border-teal-300'
                          }`}
                        >
                          <p className={`text-sm font-bold ${formData.modelo_negocio === 'venda_direta' ? 'text-teal-700' : 'text-gray-700'}`}>Venda Direta</p>
                          <p className="text-xs text-gray-500 mt-0.5">Segue o fluxo de venda normal</p>
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2 md:col-span-2 pt-2 border-t border-gray-100">
                      <h4 className="font-semibold text-gray-900">Informações do Mercado (Opcionais)</h4>
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="endereco" className="text-gray-900">Endereço Completo</Label>
                      <Input
                        id="endereco"
                        value={formData.endereco}
                        onChange={(e) => setFormData({ ...formData, endereco: e.target.value })}
                        placeholder="Ex: Rua das Flores, 123 - Centro"
                        className="bg-white text-gray-900 border-gray-300"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="responsavel" className="text-gray-900">Responsável</Label>
                      <Input
                        id="responsavel"
                        value={formData.responsavel}
                        onChange={(e) => setFormData({ ...formData, responsavel: e.target.value })}
                        placeholder="Nome do gerente/dono"
                        className="bg-white text-gray-900 border-gray-300"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="telefone" className="text-gray-900">Telefone</Label>
                      <Input
                        id="telefone"
                        value={formData.telefone}
                        onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
                        placeholder="(00) 00000-0000"
                        className="bg-white text-gray-900 border-gray-300"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="equipamento_locado" className="text-gray-900">Equipamento Locado</Label>
                      <Input
                        id="equipamento_locado"
                        value={formData.equipamento_locado}
                        onChange={(e) => setFormData({ ...formData, equipamento_locado: e.target.value })}
                        placeholder="Ex: Freezer expositor modelo X"
                        className="bg-white text-gray-900 border-gray-300"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="data_inicio_parceria" className="text-gray-900">Início da Parceria</Label>
                      <Input
                        id="data_inicio_parceria"
                        type="date"
                        value={formData.data_inicio_parceria}
                        onChange={(e) => setFormData({ ...formData, data_inicio_parceria: e.target.value })}
                        className="bg-white text-gray-900 border-gray-300"
                      />
                    </div>

                    <div className="space-y-4 md:col-span-2 bg-gray-50 p-4 rounded-lg border border-gray-200 mt-2">
                      <h4 className="font-semibold text-gray-900 text-sm">Configurações de Controle</h4>
                      
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="controla_estoque" 
                          checked={formData.controla_estoque}
                          onCheckedChange={(checked) => setFormData({...formData, controla_estoque: checked})}
                        />
                        <div className="grid gap-1.5 leading-none">
                          <label
                            htmlFor="controla_estoque"
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-gray-900"
                          >
                            Controlar Estoque Físico
                          </label>
                          <p className="text-xs text-gray-500">
                            Exigir registro de abastecimento e baixas para este mercado.
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="controla_validade" 
                          checked={formData.controla_validade}
                          onCheckedChange={(checked) => setFormData({...formData, controla_validade: checked})}
                        />
                        <div className="grid gap-1.5 leading-none">
                          <label
                            htmlFor="controla_validade"
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-gray-900"
                          >
                            Monitorar Validades (Alertas)
                          </label>
                          <p className="text-xs text-gray-500">
                            Incluir lotes deste mercado nos alertas de vencimento do sistema.
                          </p>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
              <DialogFooter className="pt-4 border-t border-gray-100">
                <Button type="button" variant="outline" onClick={handleCloseForm} className="text-[var(--color-secondary)] border-gray-300">
                  Cancelar
                </Button>
                <Button type="submit">
                  {editingLocal ? 'Salvar Alterações' : 'Criar Local'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-xl font-bold text-gray-900">Confirmar exclusão</AlertDialogTitle>
              <AlertDialogDescription className="text-gray-600">
                Tem certeza que deseja excluir o local "{deletingLocal?.nome}"? 
                Esta ação não poderá ser desfeita e pode afetar o histórico se houver movimentações vinculadas.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-gray-300 text-[var(--color-secondary)]">Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-[var(--color-error)] text-[var(--color-primary-foreground)] hover:bg-[var(--color-error)]/80 border-transparent">
                Sim, Excluir Local
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DashboardLayout>
    </>
  );
}