import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import DashboardLayout from '@/components/DashboardLayout';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Loader2, ExternalLink, Copy, Store } from 'lucide-react';

// Primeira das 5 páginas que nasceram da antiga CardapioPage.jsx (que juntava
// loja/publicação, aparência, taxa de entrega, tempo de preparo, pagamento
// online, WhatsApp, agendamento, horários E o CRUD de categorias/itens tudo
// numa página só). Essa aqui cuida só de: publicar o cardápio, o link público,
// e a aparência da vitrine. Nenhuma tabela/coluna nova — mesmo
// `empresas.cardapio_config` de sempre, só que cada seção agora mexe só na
// própria parte dele (spread do config atual + as chaves dessa página).
export default function CardapioLojaPage() {
  const { empresaId } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [empresa, setEmpresa] = useState(null);
  const [itens, setItens] = useState([]);

  const [savingConfig, setSavingConfig] = useState(false);
  const [slugInput, setSlugInput] = useState('');
  const [corCapa, setCorCapa] = useState('#dc2626');
  const [capaUrl, setCapaUrl] = useState('');
  const [capaFile, setCapaFile] = useState(null);
  const [iconeAppUrl, setIconeAppUrl] = useState('');
  const [iconeAppFile, setIconeAppFile] = useState(null);
  const [descricaoLoja, setDescricaoLoja] = useState('');
  const [rodape, setRodape] = useState('');
  const [esgotadoOculta, setEsgotadoOculta] = useState(true);
  const [endereco, setEndereco] = useState('');
  const FORMAS_PAGAMENTO_OPCOES = ['Dinheiro na entrega', 'Cartão na entrega', 'PIX'];
  const [formasPagamento, setFormasPagamento] = useState([]);
  const [produtosDestaque, setProdutosDestaque] = useState([]);
  const [savingAparencia, setSavingAparencia] = useState(false);

  const loadData = useCallback(async () => {
    if (!empresaId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [empresaRes, itensRes] = await Promise.all([
        supabase.from('empresas').select('id, nome, cardapio_ativo, cardapio_slug, cardapio_config').eq('id', empresaId).single(),
        supabase.from('cardapio_itens').select('id, nome').eq('empresa_id', empresaId).order('ordem').order('nome'),
      ]);
      if (empresaRes.error) throw empresaRes.error;
      if (itensRes.error) throw itensRes.error;

      setEmpresa(empresaRes.data);
      setSlugInput(empresaRes.data?.cardapio_slug || '');
      setCorCapa(empresaRes.data?.cardapio_config?.cor_capa || '#dc2626');
      setCapaUrl(empresaRes.data?.cardapio_config?.capa_url || '');
      setIconeAppUrl(empresaRes.data?.cardapio_config?.icone_app_url || '');
      setDescricaoLoja(empresaRes.data?.cardapio_config?.descricao_loja || '');
      setRodape(empresaRes.data?.cardapio_config?.rodape || '');
      setEsgotadoOculta(empresaRes.data?.cardapio_config?.esgotado_comportamento !== 'mostrar_desabilitado');
      setEndereco(empresaRes.data?.cardapio_config?.endereco || '');
      setFormasPagamento(empresaRes.data?.cardapio_config?.formas_pagamento || []);
      setProdutosDestaque(empresaRes.data?.cardapio_config?.produtos_destaque || []);
      setItens(itensRes.data || []);
    } catch (error) {
      console.error('Erro ao carregar loja do cardápio:', error);
      toast({ title: 'Erro ao carregar', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [empresaId, toast]);

  useEffect(() => { loadData(); }, [loadData]);

  const slugify = (v) => v
    .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  const handleSaveSlug = async () => {
    const slug = slugify(slugInput);
    if (!slug) {
      toast({ title: 'Informe um link válido', variant: 'destructive' });
      return;
    }
    setSavingConfig(true);
    try {
      const { error } = await supabase.from('empresas').update({ cardapio_slug: slug }).eq('id', empresaId);
      if (error) throw error;
      setEmpresa((prev) => ({ ...prev, cardapio_slug: slug }));
      setSlugInput(slug);
      toast({ title: 'Link do cardápio salvo!' });
    } catch (error) {
      const msg = error.code === '23505' ? 'Esse link já está em uso, escolha outro.' : error.message;
      toast({ title: 'Erro ao salvar link', description: msg, variant: 'destructive' });
    } finally {
      setSavingConfig(false);
    }
  };

  const handleToggleAtivo = async (checked) => {
    if (checked && !empresa?.cardapio_slug) {
      toast({ title: 'Defina o link do cardápio antes de ativar', variant: 'destructive' });
      return;
    }
    try {
      const { error } = await supabase.from('empresas').update({ cardapio_ativo: checked }).eq('id', empresaId);
      if (error) throw error;
      setEmpresa((prev) => ({ ...prev, cardapio_ativo: checked }));
      toast({ title: checked ? 'Cardápio publicado!' : 'Cardápio despublicado.' });
    } catch (error) {
      toast({ title: 'Erro ao atualizar', description: error.message, variant: 'destructive' });
    }
  };

  const handleSaveAparencia = async () => {
    setSavingAparencia(true);
    try {
      let novaCapaUrl = capaUrl;
      if (capaFile) {
        if (capaFile.size > 5 * 1024 * 1024) throw new Error('Imagem de capa muito grande (máx. 5MB).');
        const ext = capaFile.name.split('.').pop();
        const path = `${empresaId}/capa-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from('cardapio-imagens').upload(path, capaFile, { upsert: true });
        if (upErr) throw upErr;
        const { data: { publicUrl } } = supabase.storage.from('cardapio-imagens').getPublicUrl(path);
        novaCapaUrl = publicUrl;
      }

      let novoIconeAppUrl = iconeAppUrl;
      if (iconeAppFile) {
        if (iconeAppFile.size > 2 * 1024 * 1024) throw new Error('Ícone do app muito grande (máx. 2MB).');
        const ext = iconeAppFile.name.split('.').pop();
        const path = `${empresaId}/icone-app-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from('cardapio-imagens').upload(path, iconeAppFile, { upsert: true });
        if (upErr) throw upErr;
        const { data: { publicUrl } } = supabase.storage.from('cardapio-imagens').getPublicUrl(path);
        novoIconeAppUrl = publicUrl;
      }

      const novoConfig = {
        ...(empresa?.cardapio_config || {}),
        cor_capa: corCapa,
        capa_url: novaCapaUrl || null,
        icone_app_url: novoIconeAppUrl || null,
        descricao_loja: descricaoLoja.trim() || null,
        rodape: rodape.trim() || null,
        esgotado_comportamento: esgotadoOculta ? 'ocultar' : 'mostrar_desabilitado',
        endereco: endereco.trim() || null,
        formas_pagamento: formasPagamento,
        produtos_destaque: produtosDestaque,
      };
      const { error } = await supabase.from('empresas').update({ cardapio_config: novoConfig }).eq('id', empresaId);
      if (error) throw error;
      setEmpresa((prev) => ({ ...prev, cardapio_config: novoConfig }));
      setCapaUrl(novaCapaUrl);
      setCapaFile(null);
      setIconeAppUrl(novoIconeAppUrl);
      setIconeAppFile(null);
      toast({ title: 'Aparência salva!' });
    } catch (error) {
      toast({ title: 'Erro ao salvar aparência', description: error.message, variant: 'destructive' });
    } finally {
      setSavingAparencia(false);
    }
  };

  const toggleProdutoDestaque = (itemId) => {
    setProdutosDestaque((prev) => {
      if (prev.includes(itemId)) return prev.filter((id) => id !== itemId);
      if (prev.length >= 6) {
        toast({ title: 'Máximo de 6 produtos em destaque', variant: 'destructive' });
        return prev;
      }
      return [...prev, itemId];
    });
  };

  const toggleFormaPagamento = (forma) => {
    setFormasPagamento((prev) => (prev.includes(forma) ? prev.filter((f) => f !== forma) : [...prev, forma]));
  };

  const publicUrl = empresa?.cardapio_slug ? `${window.location.origin}/cardapio/${empresa.cardapio_slug}` : null;

  const copyLink = () => {
    if (!publicUrl) return;
    navigator.clipboard.writeText(publicUrl);
    toast({ title: 'Link copiado!' });
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <Helmet><title>Loja & Publicação - Reddu</title></Helmet>
      <div className="p-4 md:p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Store className="h-6 w-6" /> Loja & Publicação
          </h1>
          <p className="text-gray-500 text-sm">Link público, se o cardápio está ativo, e a cara da vitrine que o cliente vê.</p>
        </div>

        {/* Config: link + publicar */}
        <div className="bg-white rounded-xl border p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-gray-900 font-medium">Cardápio publicado</Label>
              <p className="text-sm text-gray-500">Quando ativo, qualquer pessoa com o link pode ver o cardápio.</p>
            </div>
            <Switch checked={!!empresa?.cardapio_ativo} onCheckedChange={handleToggleAtivo} />
          </div>

          <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-end">
            <div className="flex-1 w-full">
              <Label htmlFor="slug" className="text-gray-900">Link do cardápio</Label>
              <div className="flex items-center gap-1 mt-1">
                <span className="text-sm text-gray-400 whitespace-nowrap">/cardapio/</span>
                <Input id="slug" value={slugInput} onChange={(e) => setSlugInput(e.target.value)} placeholder="tocoxinha" />
              </div>
            </div>
            <Button onClick={handleSaveSlug} disabled={savingConfig}>
              {savingConfig ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar link'}
            </Button>
          </div>

          {publicUrl && (
            <div className="flex items-center gap-2 text-sm bg-gray-50 rounded-lg p-2">
              <a href={publicUrl} target="_blank" rel="noreferrer" className="text-blue-600 flex items-center gap-1 truncate">
                {publicUrl} <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={copyLink}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>

        {/* Config: aparência do cardápio público */}
        <div className="bg-white rounded-xl border p-4 space-y-4">
          <div>
            <Label className="text-gray-900 font-medium">Aparência do cardápio</Label>
            <p className="text-sm text-gray-500">Deixe a página pública com a cara do seu negócio.</p>
          </div>

          <div className="flex gap-4 flex-wrap">
            <div>
              <Label htmlFor="cor-capa" className="text-gray-900">Cor do cabeçalho</Label>
              <input
                id="cor-capa" type="color"
                className="mt-1 h-9 w-16 rounded border border-gray-200 cursor-pointer"
                value={corCapa}
                onChange={(e) => setCorCapa(e.target.value)}
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <Label className="text-gray-900">Imagem de capa (banner)</Label>
              <label className="mt-1 h-16 w-full max-w-xs rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden cursor-pointer block border border-dashed">
                {capaFile ? (
                  <img src={URL.createObjectURL(capaFile)} alt="" className="h-full w-full object-cover" />
                ) : capaUrl ? (
                  <img src={capaUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-xs text-gray-400">Clique pra escolher uma imagem</span>
                )}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => setCapaFile(e.target.files[0] || null)} />
              </label>
            </div>
          </div>

          <div>
            <Label className="text-gray-900">Ícone do app (pra instalar no celular)</Label>
            <p className="text-xs text-gray-400 mb-1">Imagem quadrada, de preferência 512x512px. É o ícone que aparece na tela de início quando o cliente instala seu cardápio como app. Deixe em branco pra usar o ícone genérico do Reddu.</p>
            <div className="flex items-center gap-3">
              <label className="h-16 w-16 rounded-xl bg-gray-100 flex items-center justify-center overflow-hidden cursor-pointer block border border-dashed shrink-0">
                {iconeAppFile ? (
                  <img src={URL.createObjectURL(iconeAppFile)} alt="" className="h-full w-full object-cover" />
                ) : iconeAppUrl ? (
                  <img src={iconeAppUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-[10px] text-gray-400 text-center px-1">Escolher</span>
                )}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => setIconeAppFile(e.target.files[0] || null)} />
              </label>
              {(iconeAppUrl || iconeAppFile) && (
                <Button
                  type="button" variant="ghost" size="sm" className="text-red-500"
                  onClick={() => { setIconeAppUrl(''); setIconeAppFile(null); }}
                >
                  Remover
                </Button>
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="descricao-loja" className="text-gray-900">Descrição da loja</Label>
            <Textarea
              id="descricao-loja" rows={2} value={descricaoLoja}
              onChange={(e) => setDescricaoLoja(e.target.value)}
              placeholder="Ex: Os melhores salgados artesanais de Indaiatuba!"
            />
          </div>

          <div>
            <Label htmlFor="rodape-loja" className="text-gray-900">Rodapé (endereço, redes sociais, etc.)</Label>
            <Input
              id="rodape-loja" value={rodape}
              onChange={(e) => setRodape(e.target.value)}
              placeholder="Ex: Rua Exemplo, 123 - Indaiatuba/SP · @tocoxinha"
            />
          </div>

          <div>
            <Label htmlFor="endereco-loja" className="text-gray-900">Endereço (aparece no Perfil da loja)</Label>
            <Input
              id="endereco-loja" value={endereco}
              onChange={(e) => setEndereco(e.target.value)}
              placeholder="Ex: Rua Cerqueira César, 755 - Centro, Indaiatuba - SP"
            />
            <p className="text-xs text-gray-400 mt-1">Esse é o endereço usado pra calcular a taxa de entrega, em "Entrega & Horários".</p>
          </div>

          <div>
            <Label className="text-gray-900">Formas de pagamento (aceitas na entrega/retirada)</Label>
            <p className="text-xs text-gray-400 mb-2">Sem pagamento online ainda — combina o pagamento com o cliente.</p>
            <div className="flex flex-wrap gap-2">
              {FORMAS_PAGAMENTO_OPCOES.map((forma) => (
                <button
                  key={forma} type="button" onClick={() => toggleFormaPagamento(forma)}
                  className={`px-3 py-1.5 rounded-full text-sm border ${
                    formasPagamento.includes(forma) ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'
                  }`}
                >
                  {forma}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between border rounded-lg p-3">
            <div>
              <Label className="text-gray-900">Itens esgotados</Label>
              <p className="text-xs text-gray-400">Ocultar remove da lista. Mostrar deixa visível, riscado, sem poder pedir.</p>
            </div>
            <div className="flex gap-2 text-sm">
              <Button type="button" size="sm" variant={esgotadoOculta ? 'default' : 'outline'} onClick={() => setEsgotadoOculta(true)}>Ocultar</Button>
              <Button type="button" size="sm" variant={!esgotadoOculta ? 'default' : 'outline'} onClick={() => setEsgotadoOculta(false)}>Mostrar</Button>
            </div>
          </div>

          <div>
            <Label className="text-gray-900">Produtos em destaque (até 6)</Label>
            <p className="text-xs text-gray-400 mb-2">Aparecem numa vitrine "Peça de novo" no topo do cardápio.</p>
            <div className="max-h-48 overflow-y-auto border rounded-lg divide-y">
              {itens.length === 0 && <p className="text-xs text-gray-400 p-2">Cadastre itens primeiro em "Itens do Cardápio".</p>}
              {itens.map((item) => (
                <label key={item.id} className="flex items-center gap-2 p-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={produtosDestaque.includes(item.id)}
                    onChange={() => toggleProdutoDestaque(item.id)}
                  />
                  {item.nome}
                </label>
              ))}
            </div>
          </div>

          <Button onClick={handleSaveAparencia} disabled={savingAparencia}>
            {savingAparencia ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar aparência'}
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}