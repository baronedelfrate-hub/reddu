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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useUserManagement } from '@/hooks/useUserManagement';
import { Loader2 } from 'lucide-react';

export default function ResetPasswordDialog({ open, onOpenChange, user, onSuccess }) {
  const [method, setMethod] = useState('email');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const { resetUserPassword } = useUserManagement();

  useEffect(() => {
    if (open) {
      setMethod('email');
      setPassword('');
      setError(null);
    }
  }, [open]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) return;

    setError(null);
    setLoading(true);

    try {
      if (method === 'admin' && password.length < 8) {
        throw new Error('A nova senha deve ter pelo menos 8 caracteres.');
      }

      await resetUserPassword(user.id, method, user.email, method === 'admin' ? password : null);
      onSuccess(method);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Redefinir Senha</DialogTitle>
          <DialogDescription>
            Escolha como deseja redefinir a senha do usuário <strong>{user?.nome}</strong>.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          {error && (
            <div className="bg-[var(--color-error)]/10 text-[var(--color-error)] p-3 rounded-md text-sm border border-[var(--color-error)]/20">
              {error}
            </div>
          )}

          <RadioGroup value={method} onValueChange={setMethod} className="space-y-3">
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="email" id="r-email" />
              <Label htmlFor="r-email" className="font-normal cursor-pointer">
                Enviar email de reset (link de recuperação)
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="admin" id="r-admin" />
              <Label htmlFor="r-admin" className="font-normal cursor-pointer">
                Definir nova senha agora
              </Label>
            </div>
          </RadioGroup>

          {method === 'admin' && (
            <div className="space-y-2 mt-4 ml-6">
              <Label htmlFor="new-password">Nova Senha</Label>
              <Input
                id="new-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo de 8 caracteres"
                required={method === 'admin'}
                minLength={8}
                className="bg-white text-gray-900"
              />
            </div>
          )}

          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}