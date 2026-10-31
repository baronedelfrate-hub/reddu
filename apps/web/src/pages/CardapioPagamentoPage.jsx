import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import DashboardLayout from '@/components/DashboardLayout';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, CreditCard } from 'lucide-react';

const MERCADOPAGO_WEBHOOK_URL = 'https://daptthtsvqjspavvvhax.supabase.co/functions/v1/mercadopago-webhook';

// Terceira das 5 páginas que nasceram da antiga CardapioPage.jsx. Cuida só do
// gateway de pagamento online (Cielo/Mercado Pago/InfinitePay) — a própria tabela
// cardapio_pagamento_config de sempre. A InfiniteTag da InfinitePay fica na
// coluna merchant_id (sem mudança de schema além de liberar o provedor).
export default function CardapioPagamentoPage() {
  const { empresaId } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [pagamentoConfigId, setPagamentoConfigId] = useState(null);
  const [pagProvider, setPagProvider] = useState('cielo');
  const [pagAmbiente, setPagAmbiente] = useState('sandbox');
  const [pagMerchantId, setPagMerchantId] = useState('');
  const [pagMerchantKey, setPagMerchantKey] = useState('');
  const [pagAccessToken, setPagAccessToken] = useState('');
  const [pagPublicKey, setPagPublicKey] = useState('');
  const [pagInfiniteTag, setPagInfiniteTag] = useState('');
  const [pagMaxParcelas, setPagMaxParcelas] = useState(1);
  const [pagPixAtivo, setPagPixAtivo] = useState(false);
  const [pagCartaoAtivo, setPagCartaoAtivo] = useState(false);
  const [pagObrigatorio, setPagObrigatorio] = useState(false);
  const [savingPagamento, setSavingPagamento] = useState(false);

  const ehInfinite = pagProvider === 'infinitepay';

  const loadData = useCallback(async () => {
    if (!empresaId) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('cardapio_pagamento_config').select('*').eq('empresa_id', empresaId).maybeSingle();
      if (error) throw error;
      if (data) {
        setPagamentoConfigId(data.id);
        setPagProvider(data.provider || 'cielo');
        setPagAmbiente(data.ambiente || 'sandbox');
        setPagMerchantId(data.provider === 'infinitepay' ? '' : (data.merchant_id || ''));
        setPagInfiniteTag(data.provider === 'infinitepay' ? (data.merchant_id || '') : '');
        setPagMerchantKey(data.merchant_key || '');
        setPagAccessToken(data.access_token || '');
        setPagPublicKey(data.public_key || '');
        setPagMaxParcelas(Number(data.cartao_max_parcelas) || 1);
        setPagPixAtivo(!!data.pix_ativo);
        setPagCartaoAtivo(!!data.cartao_ativo);
        setPagObrigatorio(!!data.pagamento_obrigatorio);
      }
    } catch (error) {
      console.error('Erro ao carregar pagamento online:', error);
      toast({ title: 'Erro ao carregar', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [empresaId, toast]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSavePagamento = async () => {
    if (pagProvider === 'cielo' && (pagPixAtivo || pagCartaoAtivo) && (!pagMerchantId.trim() || !pagMerchantKey.trim())) {
      toast({ title: 'Preencha Merchant ID e Merchant Key pra ativar o pagamento online', variant: 'destructive' });
      return;
    }
    if (pagProvider === 'mercadopago' && (pagPixAtivo || pagCartaoAtivo) && !pagAccessToken.trim()) {
      toast({ title: 'Preencha o Access Token pra ativar o pagamento online', variant: 'destructive' });
      return;
    }
    if (pagProvider === 'mercadopago' && pagCartaoAtivo && !pagPublicKey.trim()) {
      toast({ title: 'Preencha a Public Key pra aceitar cartão', description: 'Ela fica no painel do Mercado Pago, junto do Access Token.', variant: 'destructive' });
      return;
    }
    const tagLimpa = pagInfiniteTag.trim().replace(/^\$/, '');
    if (ehInfinite && pagPixAtivo && !tagLimpa) {
      toast({ title: 'Preencha a InfiniteTag pra ativar o pagamento online', description: 'É o seu "$nome" da InfinitePay, sem o cifrão.', variant: 'destructive' });
      return;
    }
    setSavingPagamento(true);
    try {
      const payload = {
        empresa_id: empresaId,
        provider: pagProvider,
        // A InfinitePay não tem ambiente de teste: sempre produção.
        ambiente: ehInfinite ? 'producao' : pagAmbiente,
        merchant_id: pagProvider === 'cielo' ? (pagMerchantId.trim() || null) : (ehInfinite ? (tagLimpa || null) : null),
        merchant_key: pagProvider === 'cielo' ? (pagMerchantKey.trim() || null) : null,
        access_token: pagProvider === 'mercadopago' ? (pagAccessToken.trim() || null) : null,
        pix_ativo: pagPixAtivo,
        // Na InfinitePay o cliente escolhe PIX ou cartão na página deles: um único liga/desliga.
        cartao_ativo: ehInfinite ? pagPixAtivo : pagCartaoAtivo,
        public_key: pagProvider === 'mercadopago' ? (pagPublicKey.trim() || null) : null,
        cartao_max_parcelas: Math.max(1, Math.min(12, Number(pagMaxParcelas) || 1)),
        pagamento_obrigatorio: pagObrigatorio,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from('cardapio_pagamento_config')
        .upsert(payload, { onConflict: 'empresa_id' })
        .select('id')
        .single();
      if (error) throw error;
      setPagamentoConfigId(data.id);
      toast({ title: 'Configuração de pagamento salva!' });
    } catch (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
    } finally {
      setSavingPagamento(false);
    }
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

  const botaoProvider = (valor, rotulo) => (
    <button
      type="button" onClick={() => setPagProvider(valor)}
      className={`px-3 py-1.5 rounded-full text-sm border ${pagProvider === valor ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'}`}
    >
      {rotulo}
    </button>
  );

  return (
    <DashboardLayout>
      <Helmet><title>Pagamento Online - Reddu</title></Helmet>
      <div className="p-4 md:p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CreditCard className="h-6 w-6" /> Pagamento Online
          </h1>
          <p className="text-gray-500 text-sm">Usa a conta do próprio restaurante no gateway escolhido — o dinheiro cai direto pra ele, sem passar pelo Reddu.</p>
        </div>

        <div className="bg-white rounded-xl border p-4 space-y-4">
          <div>
            <Label className="text-gray-900">Gateway de pagamento</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {botaoProvider('cielo', 'Cielo')}
              {botaoProvider('mercadopago', 'Mercado Pago')}
              {botaoProvider('infinitepay', 'InfinitePay')}
            </div>
          </div>

          {!ehInfinite && (
            <div>
              <Label className="text-gray-900">Ambiente</Label>
              <div className="flex gap-2 mt-1">
                <button
                  type="button" onClick={() => setPagAmbiente('sandbox')}
                  className={`px-3 py-1.5 rounded-full text-sm border ${pagAmbiente === 'sandbox' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'}`}
                >
                  Teste (sandbox)
                </button>
                <button
                  type="button" onClick={() => setPagAmbiente('producao')}
                  className={`px-3 py-1.5 rounded-full text-sm border ${pagAmbiente === 'producao' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'}`}
                >
                  Produção (dinheiro de verdade)
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1">⚠️ Sempre testa em "Teste" primeiro. Só muda pra Produção depois de confirmar que está tudo funcionando.</p>
            </div>
          )}

          {pagProvider === 'cielo' && (
            <>
              <div>
                <Label htmlFor="pag-merchant-id" className="text-gray-900">Merchant ID</Label>
                <Input id="pag-merchant-id" value={pagMerchantId} onChange={(e) => setPagMerchantId(e.target.value)} placeholder="Enviado pela Cielo" />
              </div>

              <div>
                <Label htmlFor="pag-merchant-key" className="text-gray-900">Merchant Key</Label>
                <Input id="pag-merchant-key" type="password" value={pagMerchantKey} onChange={(e) => setPagMerchantKey(e.target.value)} placeholder="Enviado pela Cielo" />
                <p className="text-xs text-gray-400 mt-1">Fica protegido — só sua equipe consegue ver/editar isso, nunca aparece pro cliente.</p>
              </div>
              <p className="text-xs text-gray-400 -mt-2">A confirmação automática do pagamento já é enviada pra Cielo junto com a cobrança — não precisa configurar nada aqui.</p>
            </>
          )}

          {pagProvider === 'mercadopago' && (
            <>
              <div>
                <Label htmlFor="pag-access-token" className="text-gray-900">Access Token</Label>
                <Input id="pag-access-token" type="password" value={pagAccessToken} onChange={(e) => setPagAccessToken(e.target.value)} placeholder={pagAmbiente === 'sandbox' ? 'TEST-...' : 'APP_USR-...'} />
                <p className="text-xs text-gray-400 mt-1">
                  Encontrado no painel do Mercado Pago em <em>Seu negócio → Configurações → Credenciais</em>. Use o token de teste (começa com "TEST-") em sandbox, e o de produção (começa com "APP_USR-") só depois de validar tudo.
                  Fica protegido — só sua equipe consegue ver/editar isso, nunca aparece pro cliente.
                </p>
              </div>

              <div>
                <Label htmlFor="pag-public-key" className="text-gray-900">Public Key (só para cartão)</Label>
                <Input id="pag-public-key" value={pagPublicKey} onChange={(e) => setPagPublicKey(e.target.value)} placeholder={pagAmbiente === 'sandbox' ? 'TEST-...' : 'APP_USR-...'} />
                <p className="text-xs text-gray-400 mt-1">
                  Fica na mesma tela do Access Token (<em>Credenciais</em>). É a chave "pública": usada no navegador do cliente só para proteger os dados do cartão. Use a de teste em sandbox e a de produção em produção — sempre do mesmo ambiente do Access Token.
                </p>
              </div>

              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                <Label className="text-gray-900">URL de notificação (webhook)</Label>
                <p className="text-xs text-gray-500 mt-0.5 mb-2">
                  Sem isso, a confirmação do pagamento só acontece enquanto o cliente está com a tela do PIX aberta. Configure essa URL no Mercado Pago pra receber o aviso automaticamente assim que o cliente pagar:
                </p>
                <div className="flex gap-2">
                  <Input readOnly value={MERCADOPAGO_WEBHOOK_URL} className="text-xs bg-white" />
                  <Button
                    type="button" variant="outline" size="sm"
                    onClick={() => { navigator.clipboard.writeText(MERCADOPAGO_WEBHOOK_URL); toast({ title: 'URL copiada!' }); }}
                  >
                    Copiar
                  </Button>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  Cole em: painel do Mercado Pago → <em>Seu negócio → Configurações → Webhooks → Configurar notificações</em> (no modo Teste e depois no modo Produção). Marque o evento <strong>"Pagamentos"</strong>.
                </p>
              </div>
            </>
          )}

          {ehInfinite && (
            <>
              <div>
                <Label htmlFor="pag-infinitetag" className="text-gray-900">InfiniteTag</Label>
                <Input id="pag-infinitetag" value={pagInfiniteTag} onChange={(e) => setPagInfiniteTag(e.target.value)} placeholder="seunome (sem o $)" />
                <p className="text-xs text-gray-400 mt-1">
                  É o seu "$nome" no app da InfinitePay, escrito sem o cifrão. Não precisa de senha nem chave: o dinheiro cai direto na sua conta InfinitePay.
                </p>
              </div>
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-gray-600 space-y-1">
                <p><strong>Como funciona pro cliente:</strong> ao finalizar, ele abre a página de pagamento da InfinitePay, paga com PIX ou cartão e volta pro cardápio. O pedido é confirmado sozinho, assim que o pagamento é aprovado.</p>
                <p>A InfinitePay não tem ambiente de teste. Pra testar, faça um pedido real de valor baixo.</p>
                <p>As taxas de PIX e cartão seguem as regras da sua conta InfinitePay.</p>
              </div>
            </>
          )}

          {ehInfinite ? (
            <div className="flex items-center justify-between border rounded-lg p-3">
              <div>
                <Label className="text-gray-900">Aceitar pagamento online (PIX e cartão)</Label>
                <p className="text-xs text-gray-400">O cliente escolhe PIX ou cartão de crédito na página da InfinitePay.</p>
              </div>
              <Switch checked={pagPixAtivo} onCheckedChange={setPagPixAtivo} />
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between border rounded-lg p-3">
                <Label className="text-gray-900">Aceitar PIX</Label>
                <Switch checked={pagPixAtivo} onCheckedChange={setPagPixAtivo} />
              </div>

              <div className="flex items-center justify-between border rounded-lg p-3">
                <div>
                  <Label className="text-gray-900">Aceitar cartão de crédito{pagProvider === 'mercadopago' ? ' (no cardápio)' : ''}</Label>
                  {pagProvider === 'mercadopago' && (
                    <p className="text-xs text-gray-400">O cliente paga com cartão direto no cardápio. Os dados do cartão nunca passam pelo Reddu — são protegidos pelo Mercado Pago.</p>
                  )}
                </div>
                <Switch checked={pagCartaoAtivo} onCheckedChange={setPagCartaoAtivo} />
              </div>
            </>
          )}

          {pagProvider === 'mercadopago' && pagCartaoAtivo && (
            <div>
              <Label htmlFor="pag-parcelas" className="text-gray-900">Parcelamento máximo</Label>
              <select
                id="pag-parcelas" value={pagMaxParcelas} onChange={(e) => setPagMaxParcelas(Number(e.target.value))}
                className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value={1}>Só à vista</option>
                {[2, 3, 4, 5, 6, 10, 12].map((n) => <option key={n} value={n}>Até {n}x</option>)}
              </select>
              <p className="text-xs text-gray-400 mt-1">As taxas e juros de parcelamento seguem as regras da sua conta do Mercado Pago. Pra pedido de comida, à vista costuma ser o mais simples.</p>
            </div>
          )}

          {(pagPixAtivo || pagCartaoAtivo) && (
            <div className="flex items-center justify-between border rounded-lg p-3">
              <div>
                <Label className="text-gray-900">Pagamento obrigatório</Label>
                <p className="text-xs text-gray-400">Se ligado, cliente só finaliza pagando online. Se desligado, "pagar online" é uma opção a mais, junto com "pagar na entrega".</p>
              </div>
              <Switch checked={pagObrigatorio} onCheckedChange={setPagObrigatorio} />
            </div>
          )}

          <Button onClick={handleSavePagamento} disabled={savingPagamento}>
            {savingPagamento ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar configuração de pagamento'}
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}