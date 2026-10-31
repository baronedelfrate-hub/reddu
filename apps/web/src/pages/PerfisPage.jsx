// /src/pages/PerfisPage.jsx
//
// Tela de "Perfis de Acesso" dentro de cada empresa.
// Permite criar/editar perfis e escolher, tela por tela, o que
// cada perfil pode acessar.
//
// Rota sugerida: /dashboard/perfis (visível só pra isAdmin() no menu)

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, UserCog, Plus } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';

export default function PerfisPage() {
  const { empresaId } = useAuth();
  const { toast } = useToast();

  const [perfis, setPerfis] = useState([]);
  const [telas, setTelas] = useState([]);
  const [vinculos, setVinculos] = useState({}); // { perfil_id: Set(tela_id) }
  const [perfilSelecionado, setPerfilSelecionado] = useState(null);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [novoNome, setNovoNome] = useState('');
  const [criando, setCriando] = useState(false);

  const carregarTudo = useCallback(async () => {
    if (!empresaId) return;
    setLoading(true);

    const [perfisRes, telasRes, vinculosRes] = await Promise.all([
      supabase.from('perfis').select('*').eq('empresa_id', empresaId).order('created_at'),
      supabase.from('telas').select('*').eq('ativo', true).order('ordem'),
      supabase
        .from('perfil_telas')
        .select('perfil_id, tela_id, perfis!inner(empresa_id)')
        .eq('perfis.empresa_id', empresaId),
    ]);

    if (perfisRes.error || telasRes.error || vinculosRes.error) {
      toast({
        title: 'Erro ao carregar perfis',
        description: perfisRes.error?.message || telasRes.error?.message || vinculosRes.error?.message,
        variant: 'destructive',
      });
      setLoading(false);
      return;
    }

    const mapaVinculos = {};
    (vinculosRes.data || []).forEach((v) => {
      if (!mapaVinculos[v.perfil_id]) mapaVinculos[v.perfil_id] = new Set();
      mapaVinculos[v.perfil_id].add(v.tela_id);
    });

    setPerfis(perfisRes.data || []);
    setTelas(telasRes.data || []);
    setVinculos(mapaVinculos);
    setPerfilSelecionado((atual) => atual || perfisRes.data?.[0]?.id || null);
    setLoading(false);
  }, [empresaId, toast]);

  useEffect(() => {
    carregarTudo();
  }, [carregarTudo]);

  const telasPorModulo = useMemo(() => {
    return telas.reduce((acc, tela) => {
      const grupo = tela.modulo || 'Outros';
      if (!acc[grupo]) acc[grupo] = [];
      acc[grupo].push(tela);
      return acc;
    }, {});
  }, [telas]);

  const telasDoSelecionado = perfilSelecionado ? vinculos[perfilSelecionado] || new Set() : new Set();

  async function criarPerfil() {
    if (!novoNome.trim() || !empresaId) return;
    setCriando(true);
    const { data, error } = await supabase
      .from('perfis')
      .insert({ empresa_id: empresaId, nome: novoNome.trim() })
      .select()
      .single();

    if (error) {
      toast({ title: 'Não foi possível criar o perfil', description: error.message, variant: 'destructive' });
    } else {
      setPerfis((prev) => [...prev, data]);
      setPerfilSelecionado(data.id);
      setNovoNome('');
      toast({ title: 'Perfil criado', description: `"${data.nome}" foi adicionado.` });
    }
    setCriando(false);
  }

  async function alternarTela(telaId) {
    if (!perfilSelecionado) return;
    const jaTemAcesso = telasDoSelecionado.has(telaId);
    setSalvando(true);

    const { error } = jaTemAcesso
      ? await supabase.from('perfil_telas').delete().eq('perfil_id', perfilSelecionado).eq('tela_id', telaId)
      : await supabase.from('perfil_telas').insert({ perfil_id: perfilSelecionado, tela_id: telaId });

    if (error) {
      toast({ title: 'Não foi possível atualizar o acesso', description: error.message, variant: 'destructive' });
    } else {
      setVinculos((prev) => {
        const atual = new Set(prev[perfilSelecionado] || []);
        if (jaTemAcesso) atual.delete(telaId);
        else atual.add(telaId);
        return { ...prev, [perfilSelecionado]: atual };
      });
    }
    setSalvando(false);
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          Carregando perfis…
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
    <div className="max-w-4xl mx-auto">
      <header className="mb-6 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-red-600 flex items-center justify-center shrink-0">
          <UserCog className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Perfis de acesso</h1>
          <p className="text-sm text-gray-500">Defina quais telas cada perfil da sua empresa pode acessar.</p>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-6">
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm self-start">
          <ul>
            {perfis.map((perfil) => (
              <li key={perfil.id}>
                <button
                  onClick={() => setPerfilSelecionado(perfil.id)}
                  className={`w-full text-left px-4 py-3 text-sm border-b border-gray-100 last:border-b-0 transition-colors ${
                    perfilSelecionado === perfil.id
                      ? 'bg-red-50 text-red-700 font-medium'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {perfil.nome}
                </button>
              </li>
            ))}
          </ul>
          <div className="p-3 border-t border-gray-100 space-y-2">
            <Input
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              placeholder="Novo perfil"
              className="h-9 text-sm"
              onKeyDown={(e) => e.key === 'Enter' && criarPerfil()}
            />
            <Button
              onClick={criarPerfil}
              disabled={criando || !novoNome.trim()}
              className="w-full h-9 text-sm gap-2"
            >
              {criando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Adicionar perfil
            </Button>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
          {!perfilSelecionado ? (
            <p className="text-sm text-gray-500">Selecione ou crie um perfil.</p>
          ) : (
            <div className="space-y-6">
              {Object.entries(telasPorModulo).map(([modulo, telasDoModulo]) => (
                <div key={modulo}>
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{modulo}</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {telasDoModulo.map((tela) => (
                      <label key={tela.id} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={telasDoSelecionado.has(tela.id)}
                          disabled={salvando}
                          onChange={() => alternarTela(tela.id)}
                          className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-400"
                        />
                        {tela.nome}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
    </DashboardLayout>
  );
}