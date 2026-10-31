import React, { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/lib/customSupabaseClient';
import { Search, Barcode, Loader2, XCircle, Package, Camera } from 'lucide-react';
import { formatCurrency } from '@/utils/currencyFormatter';
import { useToast } from '@/hooks/use-toast';
import { Html5QrcodeScanner } from 'html5-qrcode';

export default function BarcodeScanner({ empresaId, onProductFound }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState(null);
  const [foundProduct, setFoundProduct] = useState(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isScannerReady, setIsScannerReady] = useState(false);
  const inputRef = useRef(null);
  const debounceTimeout = useRef(null);
  const scannerRef = useRef(null);
  const { toast } = useToast();

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  // Cleanup scanner when dialog closes
  useEffect(() => {
    if (!isDialogOpen && scannerRef.current) {
      try {
        scannerRef.current.clear().catch(err => {
          console.error('Error clearing scanner:', err);
        });
      } catch (err) {
        console.error('Error during scanner cleanup:', err);
      } finally {
        scannerRef.current = null;
        setIsScannerReady(false);
      }
    }
  }, [isDialogOpen]);

  // Initialize camera scanner using native BarcodeDetector API (Android/Chrome)
  // Falls back to html5-qrcode if BarcodeDetector not available
  useEffect(() => {
    if (!isDialogOpen) return;

    let active = true;
    let videoEl = null;
    let animFrame = null;
    let scanTimeout = null;

    const stopAll = () => {
      active = false;
      if (animFrame) cancelAnimationFrame(animFrame);
      if (scanTimeout) clearTimeout(scanTimeout);
      if (videoEl && videoEl.srcObject) {
        videoEl.srcObject.getTracks().forEach(t => t.stop());
        videoEl.srcObject = null;
      }
    };

    const onDetected = (code) => {
      stopAll();
      setIsDialogOpen(false);
      setIsScannerReady(false);
      if (window.navigator.vibrate) window.navigator.vibrate(150);
      setSearchTerm(code);
      searchProduct(code.trim());
      toast({ title: '✅ Código detectado', description: `Buscando: ${code}`, duration: 2000 });
    };

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
        });
        if (!active) { stream.getTracks().forEach(t => t.stop()); return; }

        const container = document.getElementById('qr-reader');
        if (!container) return;

        const video = document.createElement('video');
        video.srcObject = stream;
        video.setAttribute('playsinline', 'true');
        video.style.cssText = 'width:100%;border-radius:8px;background:#000;';
        container.innerHTML = '';
        container.appendChild(video);
        videoEl = video;
        await video.play();
        setIsScannerReady(true);

        if ('BarcodeDetector' in window) {
          // Native BarcodeDetector — muito mais preciso para CODE128 pequenos
          const detector = new window.BarcodeDetector({
            formats: ['code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'qr_code', 'code_93']
          });
          const detect = async () => {
            if (!active) return;
            if (video.readyState >= 2) {
              try {
                const codes = await detector.detect(video);
                if (codes.length > 0) { onDetected(codes[0].rawValue); return; }
              } catch {}
            }
            animFrame = requestAnimationFrame(detect);
          };
          detect();

        } else {
          // Fallback: html5-qrcode com config otimizada para barcode
          const { Html5QrcodeScanner } = await import('html5-qrcode');
          const config = {
            fps: 30,
            qrbox: { width: 260, height: 100 },
            aspectRatio: 1.777,
            rememberLastUsedCamera: true,
            showTorchButtonIfSupported: true,
            experimentalFeatures: { useBarCodeDetectorIfSupported: true },
            formatsToSupport: [8, 7, 5, 4, 9, 11, 12, 0],
          };
          const scanner = new Html5QrcodeScanner('qr-reader', config, false);
          scannerRef.current = scanner;
          scanner.render(
            (code) => { scanner.clear().catch(() => {}); scannerRef.current = null; onDetected(code); },
            () => {}
          );
        }
      } catch {
        toast({ title: 'Erro ao acessar câmera', description: 'Verifique as permissões e tente novamente.', variant: 'destructive' });
        setIsDialogOpen(false);
      }
    };

    startCamera();
    return () => { stopAll(); if (scannerRef.current) { scannerRef.current.clear().catch(() => {}); scannerRef.current = null; } };
  }, [isDialogOpen]);

  const searchProduct = async (query) => {
    if (!query || !empresaId) {
      setFoundProduct(null);
      setError(null);
      onProductFound(null);
      return;
    }

    setIsSearching(true);
    setError(null);

    // Normaliza o código — remove espaços e zeros à esquerda para EAN-13
    const queryNorm = query.trim();
    const queryNoLeadZero = queryNorm.replace(/^0+/, '') || queryNorm;

    try {
      // Tenta busca exata primeiro
      let { data, error: err } = await supabase
        .from('produtos')
        .select('*')
        .eq('empresa_id', empresaId)
        .eq('barcode', queryNorm)
        .maybeSingle();

      // Tenta sem zeros à esquerda
      if (!data && !err && queryNoLeadZero !== queryNorm) {
        const { data: d2 } = await supabase
          .from('produtos')
          .select('*')
          .eq('empresa_id', empresaId)
          .eq('barcode', queryNoLeadZero)
          .maybeSingle();
        if (d2) data = d2;
      }

      // Tenta busca parcial no barcode (contém)
      if (!data && !err) {
        const { data: d3 } = await supabase
          .from('produtos')
          .select('*')
          .eq('empresa_id', empresaId)
          .ilike('barcode', `%${queryNorm}%`)
          .limit(1)
          .maybeSingle();
        if (d3) data = d3;
      }

      // Se nada encontrado, tenta nome
      if (!data && !err) {
        const { data: nameData, error: nameErr } = await supabase
          .from('produtos')
          .select('*')
          .eq('empresa_id', empresaId)
          .ilike('nome', `%${queryNorm}%`)
          .limit(1)
          .maybeSingle();
        
        data = nameData;
        err = nameErr;
      }

      if (err) throw err;

      if (data) {
        setFoundProduct(data);
        onProductFound(data);
        setSearchTerm('');
        
        // CRITICAL: Success vibration on product found
        if (window.navigator.vibrate) {
          window.navigator.vibrate(100);
        }
        
        // Focus back to input for next search
        setTimeout(() => {
          if (inputRef.current) inputRef.current.focus();
        }, 100);
      } else {
        setFoundProduct(null);
        setError('Produto não encontrado.');
        onProductFound(null);
        
        // CRITICAL: Error vibration pattern
        if (window.navigator.vibrate) {
          window.navigator.vibrate([200, 50, 200]);
        }
      }
    } catch (err) {
      console.error('Error searching product:', err);
      setError('Erro ao buscar produto.');
      setFoundProduct(null);
      onProductFound(null);
      
      // CRITICAL: Error vibration pattern
      if (window.navigator.vibrate) {
        window.navigator.vibrate([200, 50, 200]);
      }
    } finally {
      setIsSearching(false);
    }
  };

  const handleInputChange = (e) => {
    const value = e.target.value;
    setSearchTerm(value);
    if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
    debounceTimeout.current = setTimeout(() => {
      searchProduct(value.trim());
    }, 500);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
      searchProduct(searchTerm.trim());
    }
  };

  const clearSearch = () => {
    setSearchTerm('');
    setFoundProduct(null);
    setError(null);
    onProductFound(null);
    if (inputRef.current) inputRef.current.focus();
  };

  const handleCameraClick = () => {
    // Check if camera permission is supported
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast({
        title: 'Câmera não suportada',
        description: 'Seu navegador não suporta acesso à câmera. Use a busca manual.',
        variant: 'destructive'
      });
      return;
    }

    setIsDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <Label htmlFor="barcode-scanner" className="sr-only">Escanear Código de Barras</Label>
        <div className="relative flex items-center gap-2">
          <div className="relative flex-1">
            <Barcode className="absolute left-4 top-1/2 -translate-y-1/2 h-6 w-6 text-gray-400 pointer-events-none" />
            <Input
              ref={inputRef}
              id="barcode-scanner"
              type="text"
              placeholder="Escaneie o código de barras ou digite o nome..."
              value={searchTerm}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              className={`pl-12 pr-12 py-8 text-xl shadow-sm font-medium touch-target ${error ? 'border-red-300 focus-visible:ring-red-500' : 'focus-visible:ring-[var(--color-primary)]'}`}
              style={{ fontSize: '16px' }}
              autoComplete="off"
            />
            {isSearching ? (
              <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 h-6 w-6 animate-spin text-gray-400" />
            ) : searchTerm || foundProduct || error ? (
              <button onClick={clearSearch} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-2 touch-target" aria-label="Limpar busca">
                <XCircle className="h-6 w-6" />
              </button>
            ) : (
              <Search className="absolute right-4 top-1/2 -translate-y-1/2 h-6 w-6 text-gray-400 pointer-events-none" />
            )}
          </div>
          <Button
            type="button"
            onClick={handleCameraClick}
            className="h-auto py-6 px-4 bg-blue-600 hover:bg-blue-700 text-white shadow-sm flex items-center gap-2 shrink-0"
            aria-label="Escanear com câmera"
          >
            <Camera className="h-6 w-6" />
            <span className="hidden sm:inline">Câmera</span>
          </Button>
        </div>
        {error && <p className="text-sm text-red-500 mt-2 font-medium flex items-center gap-1"><XCircle className="h-4 w-4" /> {error}</p>}
      </div>

      {foundProduct && (
        <Card className="bg-[var(--color-primary)]/5 border-[var(--color-primary)]/20 shadow-sm overflow-hidden">
          <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-white flex items-center justify-center border border-[var(--color-primary)]/20 shadow-sm shrink-0">
                <Package className="h-6 w-6 text-[var(--color-primary)]" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">{foundProduct.nome}</h3>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {foundProduct.barcode && (
                    <span className="text-xs font-mono bg-white px-2 py-0.5 rounded border border-gray-200 text-gray-600">
                      {foundProduct.barcode}
                    </span>
                  )}
                  {foundProduct.categoria && (
                    <Badge variant="outline" className="bg-white">{foundProduct.categoria}</Badge>
                  )}
                </div>
              </div>
            </div>
            <div className="text-left sm:text-right shrink-0 bg-white p-3 rounded-lg border border-gray-100 shadow-sm w-full sm:w-auto">
              <p className="text-xs text-gray-500 uppercase font-semibold tracking-wider">Preço de Venda</p>
              <p className="text-xl font-bold text-[var(--color-success,hsl(142,71%,45%))]">{formatCurrency(foundProduct.preco_venda, 2)}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Camera Scanner Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Camera className="h-6 w-6 text-blue-600" />
              Escanear Código de Barras
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Posicione o código de barras dentro da área destacada para escaneamento automático.
            </p>
            <div id="qr-reader" className="w-full"></div>
            {!isScannerReady && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                <span className="ml-2 text-sm text-gray-600">Inicializando câmera...</span>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
              >
                Fechar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}