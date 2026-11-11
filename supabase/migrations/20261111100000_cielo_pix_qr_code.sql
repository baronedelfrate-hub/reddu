-- Guarda o código PIX "copia e cola" gerado na Cielo (API E-commerce), pra o cliente conseguir reabrir
-- o pagamento depois em "Meus Pedidos". A consulta da Cielo nem sempre devolve o QR code de novo.
alter table public.pedidos_cardapio
  add column if not exists cielo_pix_qr text;
