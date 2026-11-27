import { supabase } from '@/lib/customSupabaseClient';
import { toast } from '@/hooks/use-toast';

// Desde 05/01/2026 a nota para CNPJ sai como NF-e (modelo 55). Ela fica mais completa
// (razão social e endereço) quando o cliente está cadastrado em Fiscal > Cobranças.
// Este aviso não bloqueia a emissão: só avisa na tela, logo antes, quando falta cadastro.
export async function avisarCnpjSemCadastro(documento, empresaId) {
  try {
    const doc = String(documento ?? '').replace(/\D/g, '');
    if (doc.length !== 14 || !empresaId) return;

    const { data } = await supabase
      .from('clientes_cobranca')
      .select('razao_social, logradouro, numero, bairro, municipio, uf')
      .eq('empresa_id', empresaId)
      .eq('documento', doc)
      .maybeSingle();

    if (!data) {
      toast({
        title: 'NF-e para CNPJ sem cadastro',
        description: 'Este CNPJ não está cadastrado. A NF-e será emitida só com o nome informado e sem endereço, e a SEFAZ pode rejeitar. Para sair completa, cadastre o cliente em Fiscal > Cobranças.',
        duration: 15000,
      });
    } else if (!(data.logradouro && data.numero && data.bairro && data.municipio && data.uf)) {
      toast({
        title: 'Cadastro do cliente sem endereço',
        description: 'A NF-e será emitida sem o endereço do cliente. Complete o cadastro em Fiscal > Cobranças para evitar rejeição.',
        duration: 15000,
      });
    }
  } catch (e) {
    console.warn('[avisoCnpj]', e);
  }
}
