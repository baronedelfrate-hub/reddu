// /src/pages/GestorEmpresasPage.jsx
//
// Painel de Gestor — visão de plataforma, acima das empresas.
// Acesso restrito a usuarios.is_super_admin = true (protegido pela
// rota via SuperAdminGuard).
//
// Rota sugerida: /dashboard/gestor/empresas

import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Building2, Users, MapPin, Plus, UserPlus } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const STATUS_OPTIONS = [
  { value: 'ativo', label: 'Ativo' },
  { value: 'trial', label: 'Trial' },
  { value: 'suspenso', label: 'Suspenso' },
];

const STATUS_STYLES = {
  ativo: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  trial: 'bg-amber-50 text-amber-700 border-amber-200',
  suspenso: 'bg-red-50 text-red-700 border-red-200',
};

export default function GestorEmpresasPage() {
  const { toast } = useToast();
  const [empresas, setEmpresas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [nomeNovaEmpresa, setNomeNovaEmpresa] = useState('');
  const [criando, setCriando] = useState(false);

  // Criar usuário dentro de uma empresa específica (o hook useUserManagement
  // sempre usa a empresa de quem está logado, por isso não serve aqui).
  const [usuarioEmpresa, setUsuarioEmpresa] = useState(null);
  const [perfisEmpresa, setPerfisEmpresa] = useState([]);
  const [novoUsuario, setNovoUsuario] = useState({ nome: '', email: '', senha: '', perfilId: '' });
  const [criandoUsuario, setCriandoUsuario] = useState(false);

  const carregarEmpresas = useCallback(async () => {
    setLoading(true);

    const { data: empresasData, error: empresasError } = await supabase
      .from('empresas')
      .select('id, nome, status, created_at, logo_url')
      .order('created_at', { ascending: false });

    if (empresasError) {
      toast({
        title: 'Erro ao carregar empresas',
        description: empresasError.message,
        variant: 'destructive',
      });
      setLoading(false);
      return;
    }

    const [{ data: usuariosData }, { data: locaisData }] = await Promise.all([
      supabase.from('usuarios').select('empresa_id'),
      supabase.from('locais').select('empresa_id'),
    ]);

    const contarPorEmpresa = (rows) =>
      (rows || []).reduce((acc, row) => {
        if (!row.empresa_id) return acc;
        acc[row.empresa_id] = (acc[row.empresa_id] || 0) + 1;
        return acc;
      }, {});

    const usuariosPorEmpresa = contarPorEmpresa(usuariosData);
    const locaisPorEmpresa = contarPorEmpresa(locaisData);

    setEmpresas(
      (empresasData || []).map((e) => ({
        ...e,
        totalUsuarios: usuariosPorEmpresa[e.id] || 0,
        totalLocais: locaisPorEmpresa[e.id] || 0,
      }))
    );
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    carregarEmpresas();
  }, [carregarEmpresas]);

  async function alterarStatus(empresaId, novoStatus) {
    setSavingId(empresaId);
    const { error } = await supabase
      .from('empresas')
      .update({ status: novoStatus })
      .eq('id', empresaId);

    if (error) {
      toast({ title: 'Não foi possível atualizar o status', description: error.message, variant: 'destructive' });
    } else {
      setEmpresas((prev) => prev.map((e) => (e.id === empresaId ? { ...e, status: novoStatus } : e)));
      toast({ title: 'Status atualizado' });
    }
    setSavingId(null);
  }

  async function abrirNovoUsuario(empresa) {
    setUsuarioEmpresa(empresa);
    setNovoUsuario({ nome: '', email: '', senha: '', perfilId: '' });
    setPerfisEmpresa([]);
    const { data, error } = await supabase
      .from('perfis')
      .select('id, nome, is_admin_padrao')
      .eq('empresa_id', empresa.id)
      .order('is_admin_padrao', { ascending: false });
    if (error) {
      toast({ title: 'Erro ao carregar perfis', description: error.message, variant: 'destructive' });
      return;
    }
    setPerfisEmpresa(data || []);
    if (data?.length) setNovoUsuario((u) => ({ ...u, perfilId: data[0].id }));
  }

  async function criarUsuario(e) {
    e.preventDefault();
    const perfil = perfisEmpresa.find((p) => p.id === novoUsuario.perfilId);
    if (!perfil) {
      toast({ title: 'Escolha um perfil de acesso', variant: 'destructive' });
      return;
    }
    if (novoUsuario.senha.length < 6) {
      toast({ title: 'A senha precisa ter ao menos 6 caracteres', variant: 'destructive' });
      return;
    }
    setCriandoUsuario(true);
    const email = novoUsuario.email.trim().toLowerCase();

    const { data: edgeData, error: edgeError } = await supabase.functions.invoke('manage-users', {
      body: { action: 'create', email, password: novoUsuario.senha },
    });
    if (edgeError || edgeData?.error) {
      toast({ title: 'Erro ao criar login', description: edgeData?.error || edgeError?.message, variant: 'destructive' });
      setCriandoUsuario(false);
      return;
    }

    const { error: dbError } = await supabase.from('usuarios').insert({
      id: edgeData.userId,
      empresa_id: usuarioEmpresa.id,
      nome: novoUsuario.nome.trim(),
      email,
      perfil_id: perfil.id,
      perfil: perfil.is_admin_padrao ? 'admin' : 'user',
    });
    if (dbError) {
      // Desfaz o login criado, pra não sobrar usuário órfão no Auth
      await supabase.functions.invoke('manage-users', { body: { action: 'delete', userId: edgeData.userId } });
      toast({ title: 'Erro ao salvar usuário', description: dbError.message, variant: 'destructive' });
      setCriandoUsuario(false);
      return;
    }

    toast({ title: 'Usuário criado!', description: `${email} já pode entrar no ${usuarioEmpresa.nome}.` });
    setUsuarioEmpresa(null);
    setCriandoUsuario(false);
    carregarEmpresas();
  }

  async function criarEmpresa(e) {
    e.preventDefault();
    if (!nomeNovaEmpresa.trim()) return;
    setCriando(true);

    const { data: novaEmpresa, error } = await supabase
      .from('empresas')
      .insert({ nome: nomeNovaEmpresa.trim() })
      .select()
      .single();

    if (error) {
      toast({ title: 'Erro ao criar empresa', description: error.message, variant: 'destructive' });
      setCriando(false);
      return;
    }

    // Sem isso, a empresa nasce sem nenhum perfil e o cadastro de
    // usuário trava (dropdown de "Perfil de Acesso" vazio). Cria um
    // "Administrador" padrão já com acesso a todas as telas ativas.
    const { data: perfilAdmin, error: perfilError } = await supabase
      .from('perfis')
      .insert({ empresa_id: novaEmpresa.id, nome: 'Administrador', is_admin_padrao: true })
      .select()
      .single();

    if (perfilError) {
      toast({ title: 'Empresa criada, mas o perfil Administrador falhou', description: perfilError.message, variant: 'destructive' });
    }
    if (!perfilError && perfilAdmin) {
      const { data: telasAtivas } = await supabase.from('telas').select('id').eq('ativo', true);
      if (telasAtivas?.length) {
        await supabase
          .from('perfil_telas')
          .insert(telasAtivas.map((t) => ({ perfil_id: perfilAdmin.id, tela_id: t.id })));
      }
    }

    toast({ title: 'Empresa criada com sucesso!' });
    setFormOpen(false);
    setNomeNovaEmpresa('');
    carregarEmpresas();
    setCriando(false);
  }

  return (
    <DashboardLayout>
    <div className="max-w-5xl mx-auto">
      <header className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-600 flex items-center justify-center shrink-0">
            <Building2 className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Empresas na plataforma</h1>
            <p className="text-sm text-gray-500">Visão geral de todas as empresas que usam o Reddu.</p>
          </div>
        </div>
        <Button onClick={() => setFormOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Nova Empresa
        </Button>
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          Carregando empresas…
        </div>
      ) : empresas.length === 0 ? (
        <div className="text-center py-16 text-gray-500 border border-dashed border-gray-200 rounded-xl bg-white">
          Nenhuma empresa cadastrada ainda.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-left border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 font-medium">Empresa</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">
                  <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> Usuários</span>
                </th>
                <th className="px-4 py-3 font-medium">
                  <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> Locais</span>
                </th>
                <th className="px-4 py-3 font-medium">Criada em</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {empresas.map((empresa) => (
                <tr key={empresa.id} className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50/60">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {empresa.logo_url ? (
                        <img src={empresa.logo_url} alt="" className="w-8 h-8 rounded-lg object-contain bg-gray-50 border border-gray-100" />
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-xs text-gray-400 font-medium">
                          {empresa.nome?.[0]?.toUpperCase() || '?'}
                        </div>
                      )}
                      <span className="font-medium text-gray-900">{empresa.nome}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={empresa.status}
                      disabled={savingId === empresa.id}
                      onChange={(e) => alterarStatus(empresa.id, e.target.value)}
                      className={`text-xs rounded-full border px-3 py-1 focus:outline-none focus:ring-1 focus:ring-red-300 disabled:opacity-50 ${STATUS_STYLES[empresa.status] || ''}`}
                    >
                      {STATUS_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{empresa.totalUsuarios}</td>
                  <td className="px-4 py-3 text-gray-600">{empresa.totalLocais}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {empresa.created_at ? new Date(empresa.created_at).toLocaleDateString('pt-BR') : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => abrirNovoUsuario(empresa)}>
                      <UserPlus className="h-3.5 w-3.5" /> Novo usuário
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>

    <Dialog open={formOpen} onOpenChange={setFormOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nova Empresa</DialogTitle>
          <DialogDescription>
            Preencha o nome da empresa. Depois disso, o admin dela pode ajustar logo e demais dados.
          </DialogDescription>
        </DialogHeader>
        <form id="nova-empresa-form" onSubmit={criarEmpresa} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="nome-nova-empresa" className="text-gray-900">Nome da Empresa</Label>
            <Input
              id="nome-nova-empresa"
              value={nomeNovaEmpresa}
              onChange={(e) => setNomeNovaEmpresa(e.target.value)}
              placeholder="Ex: Minha Empresa Ltda"
              required
              className="bg-white text-gray-900"
              autoFocus
            />
          </div>
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="nova-empresa-form" disabled={criando} className="gap-2">
            {criando && <Loader2 className="h-4 w-4 animate-spin" />}
            Criar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={!!usuarioEmpresa} onOpenChange={(o) => { if (!o) setUsuarioEmpresa(null); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Novo usuário — {usuarioEmpresa?.nome}</DialogTitle>
          <DialogDescription>Cria o login e já vincula a esta empresa.</DialogDescription>
        </DialogHeader>
        <form id="novo-usuario-form" onSubmit={criarUsuario} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="nu-nome" className="text-gray-900">Nome</Label>
            <Input id="nu-nome" required value={novoUsuario.nome} className="bg-white text-gray-900"
              onChange={(e) => setNovoUsuario((u) => ({ ...u, nome: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nu-email" className="text-gray-900">E-mail</Label>
            <Input id="nu-email" type="email" required value={novoUsuario.email} className="bg-white text-gray-900"
              onChange={(e) => setNovoUsuario((u) => ({ ...u, email: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nu-senha" className="text-gray-900">Senha inicial</Label>
            <Input id="nu-senha" type="text" required minLength={6} value={novoUsuario.senha} className="bg-white text-gray-900"
              onChange={(e) => setNovoUsuario((u) => ({ ...u, senha: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nu-perfil" className="text-gray-900">Perfil de acesso</Label>
            <select id="nu-perfil" required value={novoUsuario.perfilId}
              onChange={(e) => setNovoUsuario((u) => ({ ...u, perfilId: e.target.value }))}
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm bg-white text-gray-900">
              {perfisEmpresa.length === 0 && <option value="">Nenhum perfil nesta empresa</option>}
              {perfisEmpresa.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </div>
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setUsuarioEmpresa(null)}>Cancelar</Button>
          <Button type="submit" form="novo-usuario-form" disabled={criandoUsuario || !perfisEmpresa.length} className="gap-2">
            {criandoUsuario && <Loader2 className="h-4 w-4 animate-spin" />}
            Criar usuário
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </DashboardLayout>
  );
}