import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { useUserManagement } from '@/hooks/useUserManagement';
import { Loader2 } from 'lucide-react';

export default function UserFormDialog({ open, onOpenChange, user, onSuccess }) {
  const isEditing = !!user;
  const { empresaId } = useAuth();
  const { createUser, updateUser } = useUserManagement();

  const [formData, setFormData] = useState({
    nome: '',
    email: '',
    perfil_id: '',
    senha: ''
  });
  const [perfis, setPerfis] = useState([]);
  const [loadingPerfis, setLoadingPerfis] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Busca os perfis cadastrados da empresa sempre que o diálogo abre.
  useEffect(() => {
    if (!open || !empresaId) return;

    const carregarPerfis = async () => {
      setLoadingPerfis(true);
      const { data, error: perfisError } = await supabase
        .from('perfis')
        .select('id, nome, is_admin_padrao')
        .eq('empresa_id', empresaId)
        .order('created_at');

      if (!perfisError) setPerfis(data || []);
      setLoadingPerfis(false);
    };

    carregarPerfis();
  }, [open, empresaId]);

  // Preenche o formulário quando o diálogo abre ou os perfis terminam de carregar.
  useEffect(() => {
    if (!open) return;

    if (isEditing) {
      let perfilIdInicial = user.perfil_id || '';

      // Usuários antigos que por algum motivo ainda não têm perfil_id
      // (ex: criados entre a migração e este ajuste) caem no perfil
      // padrão equivalente ao texto legado que já tinham.
      if (!perfilIdInicial && perfis.length > 0) {
        const equivalente = perfis.find(
          (p) => p.is_admin_padrao === (user.perfil === 'admin')
        );
        perfilIdInicial = equivalente?.id || perfis[0]?.id || '';
      }

      setFormData({
        nome: user.nome || '',
        email: user.email || '',
        perfil_id: perfilIdInicial,
        senha: ''
      });
    } else {
      const padraoNaoAdmin = perfis.find((p) => !p.is_admin_padrao);
      setFormData({
        nome: '',
        email: '',
        perfil_id: padraoNaoAdmin?.id || perfis[0]?.id || '',
        senha: ''
      });
    }
    setError(null);
  }, [open, user, isEditing, perfis]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handlePerfilChange = (value) => {
    setFormData((prev) => ({ ...prev, perfil_id: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!formData.perfil_id) {
      setError('Selecione um perfil de acesso.');
      return;
    }

    const perfilSelecionado = perfis.find((p) => p.id === formData.perfil_id);
    setLoading(true);

    try {
      if (isEditing) {
        await updateUser(user.id, formData.nome, formData.perfil_id, !!perfilSelecionado?.is_admin_padrao);
      } else {
        if (formData.senha.length < 8) {
          throw new Error('A senha deve ter pelo menos 8 caracteres.');
        }
        await createUser(formData.email, formData.senha, formData.nome, formData.perfil_id, !!perfilSelecionado?.is_admin_padrao);
      }
      onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar Usuário' : 'Novo Usuário'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Atualize os dados cadastrais do usuário.'
              : 'Preencha os dados para criar um novo usuário no sistema.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          {error && (
            <div className="bg-[var(--color-error)]/10 text-[var(--color-error)] p-3 rounded-md text-sm border border-[var(--color-error)]/20">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="nome">Nome</Label>
            <Input
              id="nome"
              name="nome"
              value={formData.nome}
              onChange={handleChange}
              placeholder="Ex: João Silva"
              required
              className="bg-white text-gray-900 border-gray-200"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              disabled={isEditing}
              placeholder="Ex: joao@empresa.com"
              required
              className="bg-white text-gray-900 border-gray-200 disabled:bg-gray-50 disabled:text-gray-500"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="perfil">Perfil de Acesso</Label>
            <Select value={formData.perfil_id} onValueChange={handlePerfilChange} disabled={loadingPerfis}>
              <SelectTrigger className="bg-white text-gray-900 border-gray-200 w-full">
                <SelectValue placeholder={loadingPerfis ? 'Carregando perfis…' : 'Selecione o perfil'} />
              </SelectTrigger>
              <SelectContent>
                {perfis.map((perfil) => (
                  <SelectItem key={perfil.id} value={perfil.id}>
                    {perfil.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!loadingPerfis && perfis.length === 0 && (
              <p className="text-xs text-amber-600">
                Nenhum perfil cadastrado ainda. Crie um em "Perfis de Acesso" antes de continuar.
              </p>
            )}
          </div>

          {!isEditing && (
            <div className="space-y-2">
              <Label htmlFor="senha">Senha Temporária</Label>
              <Input
                id="senha"
                name="senha"
                type="password"
                value={formData.senha}
                onChange={handleChange}
                placeholder="Mínimo de 8 caracteres"
                required
                minLength={8}
                className="bg-white text-gray-900 border-gray-200"
              />
            </div>
          )}

          <DialogFooter className="pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
              className="border-gray-200"
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading || !formData.perfil_id}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? 'Salvar Alterações' : 'Criar Usuário'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}