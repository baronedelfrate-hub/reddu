import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { Loader2, Upload, Trash2, Image as ImageIcon } from 'lucide-react';

export default function LogoUploadComponent({ empresaId, currentLogoUrl, onLogoUpdated }) {
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const fileInputRef = useRef(null);
  const { toast } = useToast();

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: 'Arquivo muito grande',
        description: 'O tamanho máximo permitido é de 5MB.',
        variant: 'destructive',
      });
      return;
    }

    // Validate format
    const validTypes = ['image/jpeg', 'image/png', 'image/svg+xml', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      toast({
        title: 'Formato inválido',
        description: 'Apenas imagens JPG, PNG, SVG e WEBP são permitidas.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsUploading(true);

      const fileExt = file.name.split('.').pop();
      const fileName = `logo-${Date.now()}.${fileExt}`;
      const filePath = `${empresaId}/${fileName}`;

      // Upload to Storage
      const { error: uploadError } = await supabase.storage
        .from('logos-empresa')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('logos-empresa')
        .getPublicUrl(filePath);

      // Update database
      const { error: dbError } = await supabase
        .from('empresas')
        .update({ logo_url: publicUrl })
        .eq('id', empresaId);

      if (dbError) throw dbError;

      toast({ title: 'Sucesso', description: 'Logomarca atualizada com sucesso.' });
      onLogoUpdated(publicUrl);
    } catch (error) {
      console.error('Error uploading logo:', error);
      toast({
        title: 'Erro no upload',
        description: 'Não foi possível fazer o upload da logomarca.',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async () => {
    if (!currentLogoUrl) return;

    try {
      setIsDeleting(true);

      // Extract file path from public URL
      const urlParts = currentLogoUrl.split('/logos-empresa/');
      if (urlParts.length === 2) {
        const filePath = urlParts[1];
        await supabase.storage.from('logos-empresa').remove([filePath]);
      }

      // Update database
      const { error: dbError } = await supabase
        .from('empresas')
        .update({ logo_url: null })
        .eq('id', empresaId);

      if (dbError) throw dbError;

      toast({ title: 'Sucesso', description: 'Logomarca removida com sucesso.' });
      onLogoUpdated(null);
    } catch (error) {
      console.error('Error deleting logo:', error);
      toast({
        title: 'Erro na exclusão',
        description: 'Não foi possível remover a logomarca.',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center p-6 border-2 border-dashed border-gray-200 rounded-lg bg-gray-50">
        {currentLogoUrl ? (
          <div className="relative w-full max-w-[200px] aspect-square flex items-center justify-center bg-white rounded-md p-4 shadow-sm mb-4">
            <img
              src={currentLogoUrl}
              alt="Logomarca da empresa"
              className="max-w-full max-h-full object-contain"
            />
          </div>
        ) : (
          <div className="w-24 h-24 rounded-full bg-gray-100 flex items-center justify-center mb-4 border border-gray-200">
            <ImageIcon className="h-10 w-10 text-gray-400" />
          </div>
        )}

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/jpeg,image/png,image/svg+xml,image/webp"
          className="hidden"
        />

        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading || isDeleting}
          >
            {isUploading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            {currentLogoUrl ? 'Trocar Logo' : 'Enviar Logo'}
          </Button>

          {currentLogoUrl && (
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={isUploading || isDeleting}
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Remover
            </Button>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-3 text-center">
          Formatos suportados: JPG, PNG, SVG, WEBP.<br />
          Tamanho máximo: 5MB.
        </p>
      </div>
    </div>
  );
}