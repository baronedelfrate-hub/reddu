import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import DashboardLayout from '@/components/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { fiscalService } from '@/services/fiscalService';
import { supabase } from '@/lib/customSupabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Save, Receipt, Building, Key, Server, Link as LinkIcon, MapPin } from 'lucide-react';

const ESTADOS_BRASIL = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
];

export default function ConfiguracoesFiscaisPage() {
  const { empresaId } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    cnpj: '',
    inscricao_estadual: '',
    razao_social: '',
    regime_tributario: 'Simples Nacional',
    token_api_focus: '',
    ambiente_fiscal: 'homologacao',
    url_api_focus: 'https://homologacao.focusnfe.com.br/v2/nfce',
    logradouro: '',
    numero: '',
    complemento: '',
    bairro: '',
    municipio: '',
    uf: '',
    cep: ''
  });

  useEffect(() => {
    const fetchConfig = async () => {
      if (!empresaId) return;
      setIsLoading(true);
      try {
        const config = await fiscalService.obterConfiguracoesEmpresa(empresaId);
        if (config) {
          setFormData({
            cnpj: config.cnpj || '',
            inscricao_estadual: config.inscricao_estadual || '',
            razao_social: config.razao_social || '',
            regime_tributario: config.regime_tributario || 'Simples Nacional',
            token_api_focus: config.token_api_focus || '',
            ambiente_fiscal: config.ambiente_fiscal || 'homologacao',
            url_api_focus: config.url_api_focus || 'https://homologacao.focusnfe.com.br/v2/nfce',
            logradouro: config.logradouro || '',
            numero: config.numero || '',
            complemento: config.complemento || '',
            bairro: config.bairro || '',
            municipio: config.municipio || '',
            uf: config.uf || '',
            cep: config.cep || ''
          });
        }
      } catch (err) {
        console.error("Erro ao buscar configurações", err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchConfig();
  }, [empresaId]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    
    // Auto-formatting for CEP
    let formattedValue = value;
    if (name === 'cep') {
      formattedValue = value.replace(/\D/g, '').replace(/^(\d{5})(\d{3})?$/, '$1-$2');
    }
    if (name === 'uf') {
      formattedValue = value.toUpperCase().replace(/[^A-Z]/g, '').substring(0, 2);
    }
    
    setFormData(prev => ({ ...prev, [name]: formattedValue }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!empresaId) return;

    // Validate main required fields
    if (!formData.cnpj || !formData.razao_social || !formData.token_api_focus || !formData.url_api_focus) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha CNPJ, Razão Social, URL e o Token da API.",
        variant: "destructive"
      });
      return;
    }

    if (!formData.url_api_focus.startsWith('https://')) {
      toast({
        title: "URL Inválida",
        description: "A URL da API deve obrigatoriamente começar com https://",
        variant: "destructive"
      });
      return;
    }

    // Validate Address
    const cleanCep = formData.cep.replace(/\D/g, '');
    if (!formData.logradouro || !formData.numero || !formData.bairro || !formData.municipio || !formData.uf || !cleanCep) {
      toast({
        title: "Endereço incompleto",
        description: "Preencha todos os campos obrigatórios do endereço.",
        variant: "destructive"
      });
      return;
    }

    if (formData.uf.length !== 2) {
      toast({
        title: "UF Inválida",
        description: "O estado (UF) deve conter exatamente 2 letras.",
        variant: "destructive"
      });
      return;
    }

    if (cleanCep.length !== 8) {
      toast({
        title: "CEP Inválido",
        description: "O CEP deve conter exatamente 8 dígitos.",
        variant: "destructive"
      });
      return;
    }

    setIsSaving(true);
    try {
      // Upsert record
      const { error } = await supabase
        .from('configuracoes_fiscais')
        .upsert({
          empresa_id: empresaId,
          ...formData,
          cep: cleanCep // Store clean CEP in DB
        }, { onConflict: 'empresa_id' });

      if (error) throw error;

      toast({
        title: "Configurações salvas!",
        description: "Suas configurações fiscais foram atualizadas com sucesso.",
        className: "bg-emerald-600 text-white"
      });
    } catch (err) {
      console.error(err);
      toast({
        title: "Erro ao salvar",
        description: err.message,
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Helmet><title>Configurações Fiscais - Estoque 360</title></Helmet>
      <DashboardLayout>
        <div className="max-w-4xl mx-auto py-6 space-y-6">
          <div className="flex items-center gap-3">
            <div className="bg-primary p-3 rounded-lg text-primary-foreground shadow">
              <Receipt className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Configurações Fiscais (NFC-e)</h1>
              <p className="text-muted-foreground text-sm">Gerencie os dados fiscais e integração com a Focus NFe.</p>
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <form onSubmit={handleSave} className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Building className="w-5 h-5 text-muted-foreground" /> Dados da Empresa
                  </CardTitle>
                  <CardDescription>Informações cadastrais que constarão nas notas fiscais emitidas.</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="cnpj">CNPJ (Apenas números) *</Label>
                    <Input 
                      id="cnpj" 
                      name="cnpj" 
                      value={formData.cnpj} 
                      onChange={handleInputChange} 
                      placeholder="00000000000000"
                      maxLength={14}
                      className="text-foreground bg-background"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="inscricao_estadual">Inscrição Estadual</Label>
                    <Input 
                      id="inscricao_estadual" 
                      name="inscricao_estadual" 
                      value={formData.inscricao_estadual} 
                      onChange={handleInputChange} 
                      placeholder="Opcional"
                      className="text-foreground bg-background"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="razao_social">Razão Social *</Label>
                    <Input 
                      id="razao_social" 
                      name="razao_social" 
                      value={formData.razao_social} 
                      onChange={handleInputChange} 
                      placeholder="Nome oficial da empresa"
                      className="text-foreground bg-background"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="regime_tributario">Regime Tributário *</Label>
                    <Select 
                      value={formData.regime_tributario} 
                      onValueChange={(val) => setFormData(prev => ({ ...prev, regime_tributario: val }))}
                    >
                      <SelectTrigger className="text-foreground bg-background">
                        <SelectValue placeholder="Selecione o regime" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Simples Nacional">Simples Nacional</SelectItem>
                        <SelectItem value="Lucro Presumido">Lucro Presumido</SelectItem>
                        <SelectItem value="Lucro Real">Lucro Real</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <MapPin className="w-5 h-5 text-muted-foreground" /> Endereço da Empresa
                  </CardTitle>
                  <CardDescription>O endereço completo é obrigatório para emissão de notas fiscais.</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-12 gap-4">
                  <div className="space-y-2 md:col-span-3">
                    <Label htmlFor="cep">CEP *</Label>
                    <Input 
                      id="cep" 
                      name="cep" 
                      value={formData.cep} 
                      onChange={handleInputChange} 
                      placeholder="00000-000"
                      maxLength={9}
                      className="text-foreground bg-background"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-7">
                    <Label htmlFor="logradouro">Logradouro *</Label>
                    <Input 
                      id="logradouro" 
                      name="logradouro" 
                      value={formData.logradouro} 
                      onChange={handleInputChange} 
                      placeholder="Ex: Rua das Flores"
                      className="text-foreground bg-background"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="numero">Número *</Label>
                    <Input 
                      id="numero" 
                      name="numero" 
                      value={formData.numero} 
                      onChange={handleInputChange} 
                      placeholder="Ex: 123"
                      className="text-foreground bg-background"
                    />
                  </div>
                  
                  <div className="space-y-2 md:col-span-4">
                    <Label htmlFor="complemento">Complemento</Label>
                    <Input 
                      id="complemento" 
                      name="complemento" 
                      value={formData.complemento} 
                      onChange={handleInputChange} 
                      placeholder="Ex: Sala 2"
                      className="text-foreground bg-background"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-3">
                    <Label htmlFor="bairro">Bairro *</Label>
                    <Input 
                      id="bairro" 
                      name="bairro" 
                      value={formData.bairro} 
                      onChange={handleInputChange} 
                      placeholder="Ex: Centro"
                      className="text-foreground bg-background"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-3">
                    <Label htmlFor="municipio">Município *</Label>
                    <Input 
                      id="municipio" 
                      name="municipio" 
                      value={formData.municipio} 
                      onChange={handleInputChange} 
                      placeholder="Ex: São Paulo"
                      className="text-foreground bg-background"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="uf">UF *</Label>
                    <Select 
                      value={formData.uf} 
                      onValueChange={(val) => setFormData(prev => ({ ...prev, uf: val }))}
                    >
                      <SelectTrigger className="text-foreground bg-background">
                        <SelectValue placeholder="UF" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[300px]">
                        {ESTADOS_BRASIL.map(estado => (
                          <SelectItem key={estado} value={estado}>{estado}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Key className="w-5 h-5 text-muted-foreground" /> Integração Focus NFe
                  </CardTitle>
                  <CardDescription>Credenciais de acesso à API da Focus NFe.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="url_api_focus" className="flex items-center gap-2">
                       <LinkIcon className="w-4 h-4 text-muted-foreground" /> URL da API *
                    </Label>
                    <Input 
                      id="url_api_focus" 
                      name="url_api_focus" 
                      type="text"
                      value={formData.url_api_focus} 
                      onChange={handleInputChange} 
                      placeholder="https://homologacao.focusnfe.com.br/v2/nfce"
                      className="text-foreground bg-background"
                    />
                    <p className="text-xs text-muted-foreground">URL da API Focus NFe (homologação ou produção)</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="token_api_focus">Token da API *</Label>
                    <Input 
                      id="token_api_focus" 
                      name="token_api_focus" 
                      type="password"
                      value={formData.token_api_focus} 
                      onChange={handleInputChange} 
                      placeholder="Cole seu token de produção ou homologação aqui"
                      className="text-foreground bg-background font-mono"
                    />
                  </div>

                  <div className="space-y-3 pt-2">
                    <Label className="flex items-center gap-2">
                      <Server className="w-4 h-4 text-muted-foreground"/> Ambiente Fiscal *
                    </Label>
                    <RadioGroup 
                      value={formData.ambiente_fiscal} 
                      onValueChange={(val) => setFormData(prev => ({ ...prev, ambiente_fiscal: val }))}
                      className="flex flex-col space-y-2"
                    >
                      <div className="flex items-center space-x-2 bg-secondary/30 p-3 rounded border border-border">
                        <RadioGroupItem value="homologacao" id="homologacao" />
                        <Label htmlFor="homologacao" className="cursor-pointer font-medium text-foreground">
                          Homologação (Testes)
                          <p className="text-xs text-muted-foreground font-normal mt-0.5">As notas emitidas não possuem valor fiscal.</p>
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2 bg-red-50/50 dark:bg-red-950/20 p-3 rounded border border-red-100 dark:border-red-900">
                        <RadioGroupItem value="producao" id="producao" />
                        <Label htmlFor="producao" className="cursor-pointer font-medium text-red-700 dark:text-red-400">
                          Produção (Valendo)
                          <p className="text-xs text-red-600/70 dark:text-red-500/70 font-normal mt-0.5">As notas emitidas possuem validade jurídica e fiscal junto à SEFAZ.</p>
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>
                </CardContent>
              </Card>

              {formData.ambiente_fiscal === 'producao' && (
                <Alert variant="destructive" className="border-red-500 bg-red-50 text-red-900">
                  <AlertTitle className="font-bold">Atenção ao Ambiente de Produção!</AlertTitle>
                  <AlertDescription>
                    Certifique-se de que o token informado pertence ao ambiente de produção. Notas emitidas neste ambiente são enviadas à SEFAZ e geram obrigações fiscais.
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex justify-end gap-3 pt-4 pb-10">
                <Button type="submit" disabled={isSaving} className="min-w-[150px]">
                  {isSaving ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Salvando...</>
                  ) : (
                    <><Save className="w-4 h-4 mr-2" /> Salvar Configurações</>
                  )}
                </Button>
              </div>
            </form>
          )}
        </div>
      </DashboardLayout>
    </>
  );
}