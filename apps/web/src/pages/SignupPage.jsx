import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { UserPlus, MailCheck } from 'lucide-react';

export default function SignupPage() {
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [empresaOption, setEmpresaOption] = useState('new');
  const [empresaNome, setEmpresaNome] = useState('');
  const [selectedEmpresa, setSelectedEmpresa] = useState('');
  const [empresas, setEmpresas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const { signup } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    fetchEmpresas();
  }, []);

  const fetchEmpresas = async () => {
    try {
      const { data, error } = await supabase
        .from('empresas')
        .select('*')
        .order('nome');

      if (error) throw error;
      setEmpresas(data || []);
    } catch (error) {
      console.error('Error fetching empresas:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const isNewEmpresa = empresaOption === 'new';
      const empresaId = isNewEmpresa ? null : selectedEmpresa;

      if (!isNewEmpresa && !empresaId) {
        toast({
          title: 'Erro de validação',
          description: 'Selecione uma empresa ou crie uma nova.',
          variant: 'destructive',
        });
        setLoading(false);
        return;
      }

      if (isNewEmpresa && !empresaNome.trim()) {
        toast({
          title: 'Erro de validação',
          description: 'Digite o nome da empresa.',
          variant: 'destructive',
        });
        setLoading(false);
        return;
      }

      const { data, error } = await signup({
        email,
        password,
        nome,
        empresaId,
        empresaNome,
        isNewEmpresa,
      });

      if (error) {
        toast({
          title: 'Erro ao criar conta',
          description: error.message || 'Falha ao registrar usuário.',
          variant: 'destructive',
        });
      } else {
        if (data?.user && !data?.session) {
            setIsSuccess(true);
            toast({
              title: 'Conta criada!',
              description: 'Verifique seu email para confirmar a conta.',
            });
        } else {
            toast({
              title: 'Conta criada com sucesso!',
              description: 'Redirecionando...',
            });
            navigate('/dashboard/empresas');
        }
      }
    } catch (error) {
      toast({
        title: 'Erro inesperado',
        description: error.message || 'Ocorreu um erro ao criar a conta.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4 py-8">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-6">
            <MailCheck className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Verifique seu Email</h2>
          <p className="text-gray-600 mb-8">
            Enviamos um link de confirmação para <strong>{email}</strong>. 
            Por favor, verifique sua caixa de entrada e a pasta de spam. Você precisa confirmar seu email antes de fazer login.
          </p>
          <Button onClick={() => navigate('/login')} className="w-full">
            Ir para o Login
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Criar Conta - Sistema de Estoque</title>
        <meta name="description" content="Crie sua conta no sistema de gestão de estoque" />
      </Helmet>

      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4 py-8">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-full mb-4">
                <UserPlus className="h-8 w-8 text-white" />
              </div>
              <h1 className="text-3xl font-bold text-gray-900">Criar Conta</h1>
              <p className="text-gray-600 mt-2">Comece a gerenciar seu estoque</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="nome" className="text-gray-900">Nome completo</Label>
                <Input
                  id="nome"
                  type="text"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Seu nome"
                  required
                  disabled={loading}
                  className="bg-white text-gray-900"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-gray-900">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  required
                  disabled={loading}
                  className="bg-white text-gray-900"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-gray-900">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  disabled={loading}
                  className="bg-white text-gray-900"
                />
              </div>

              <div className="space-y-3">
                <Label className="text-gray-900">Empresa</Label>
                <RadioGroup 
                  value={empresaOption} 
                  onValueChange={setEmpresaOption}
                  disabled={loading}
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="new" id="new" />
                    <Label htmlFor="new" className="font-normal text-gray-900">
                      Criar nova empresa
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="existing" id="existing" />
                    <Label htmlFor="existing" className="font-normal text-gray-900">
                      Entrar em empresa existente
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {empresaOption === 'new' ? (
                <div className="space-y-2">
                  <Label htmlFor="empresaNome" className="text-gray-900">
                    Nome da empresa
                  </Label>
                  <Input
                    id="empresaNome"
                    type="text"
                    value={empresaNome}
                    onChange={(e) => setEmpresaNome(e.target.value)}
                    placeholder="Minha Empresa Ltda"
                    required={empresaOption === 'new'}
                    disabled={loading}
                    className="bg-white text-gray-900"
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="empresa" className="text-gray-900">
                    Selecione a empresa
                  </Label>
                  <Select 
                    value={selectedEmpresa} 
                    onValueChange={setSelectedEmpresa}
                    disabled={loading}
                  >
                    <SelectTrigger className="bg-white text-gray-900">
                      <SelectValue placeholder="Escolha uma empresa" />
                    </SelectTrigger>
                    <SelectContent>
                      {empresas.map((empresa) => (
                        <SelectItem key={empresa.id} value={empresa.id}>
                          {empresa.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Criando conta...' : 'Criar conta'}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-sm text-gray-600">
                Já tem uma conta?{' '}
                <Link
                  to="/login"
                  className="text-blue-600 hover:text-blue-700 font-medium"
                >
                  Fazer login
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}