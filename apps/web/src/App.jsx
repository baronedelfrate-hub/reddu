import React from 'react';
import { Route, Routes, BrowserRouter as Router, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { Toaster } from '@/components/ui/toaster';
import ErrorBoundary from './components/ErrorBoundary';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from './components/ProtectedRoute';
import DashboardLayout from './components/DashboardLayout';

import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import LotePublicoPage from './pages/LotePublicoPage';
import DashboardPage from './pages/DashboardPage';
import UsuariosPage from './pages/UsuariosPage';
import LocaisPage from './pages/LocaisPage';
import ProdutosPage from './pages/ProdutosPage';
import LotesPage from './pages/LotesPage';
import MovimentacoesPage from './pages/MovimentacoesPage';
import EstoqueLocalPage from './pages/EstoqueLocalPage';
import AlertasPage from './pages/AlertasPage';
import RegistrarProducaoPage from './pages/RegistrarProducaoPage';
import RegistrarProducaoClassicosPage from './pages/RegistrarProducaoClassicosPage';
import RegistrarProducaoBandejasPage from './pages/RegistrarProducaoBandejasPage';
import RegistrarVendaClassicosPage from './pages/RegistrarVendaClassicosPage';
import RegistrarVendaBandejasPage from './pages/RegistrarVendaBandejasPage';
import ConfigurarComposicaoPage from './pages/ConfigurarComposicaoPage';
import ProduzirBandejasPage from './pages/ProduzirBandejasPage';
import RelatorioProdutosPage from './pages/RelatorioProdutosPage';
import RelatorioDevolucoesMercadoPage from './pages/RelatorioDevolucoesMercadoPage';
import RelatorioVendasPage from './pages/RelatorioVendasPage';
import RelatorioVendasConsolidadoPage from './pages/RelatorioVendasConsolidadoPage';
import RelatorioProducaoSaidasPage from './pages/RelatorioProducaoSaidasPage';
import LogsAuditoriaPage from './pages/LogsAuditoriaPage';
import TransferenciaEstoquePage from './pages/TransferenciaEstoquePage';
import FechamentoMercadoConsignadoPage from './pages/FechamentoMercadoConsignadoPage';
import ReconciliacaoConsignadoPage from './pages/ReconciliacaoConsignadoPage';
import PedidoReabastecimentoPage from './pages/PedidoReabastecimentoPage';
import ConferenciaCarregamentoPage from './pages/ConferenciaCarregamentoPage';
import RegistrarVendaMercadoPage from './pages/RegistrarVendaMercadoPage';
import RegistrarDevolucaoPage from './pages/RegistrarDevolucaoPage';
import ControleBandejasPage from './pages/ControleBandejasPage';
import PedidosPage from './pages/PedidosPage';
import PedidoDetailPage from './pages/PedidoDetailPage';
import EtiquetasLotePage from './pages/EtiquetasLotePage';
import ConfiguracaoEtiquetaPage from './pages/ConfiguracaoEtiquetaPage';
import PDVPage from './pages/PDVPage';
import PDVRapidoPage from './pages/PDVRapidoPage';
import PDVPedidosBalcaoPage from './pages/PDVPedidosBalcaoPage';
import PedidosBalcaoPage from './pages/PedidosBalcaoPage';
import VendaInquiryPage from './pages/VendaInquiryPage';
import AdminResetPage from './pages/AdminResetPage';
import VendaAplicativoPage from './pages/VendaAplicativoPage';
import VendasPendentesPage from './pages/VendasPendentesPage';
import RelatorioVendasPendentesPage from './pages/RelatorioVendasPendentesPage';
import EmpresasPage from './pages/EmpresasPage';
import GestorEmpresasPage from './pages/GestorEmpresasPage';
import PerfisPage from './pages/PerfisPage';
import SuperAdminGuard from './components/SuperAdminGuard';
import OperacaoMercadosPage from './pages/OperacaoMercadosPage';
import AuditoriaMercadoPage from './pages/AuditoriaMercadoPage';
import RelatorioAuditoriaMercadoPage from './pages/RelatorioAuditoriaMercadoPage';
import RelatorioConsolidadoProdutoPage from './pages/RelatorioConsolidadoProdutoPage';
import RelatorioProdutoDanificadoPage from './pages/RelatorioProdutoDanificadoPage';
import ComparativoMercadosPage from './pages/ComparativoMercadosPage';
import RelatorioVendasMercadoPage from './pages/RelatorioVendasMercadoPage';
import ChecklistMercadoPage from './pages/ChecklistMercadoPage';
import RelatorioAuditoriasPage from './pages/RelatorioAuditoriasPage';
import EventosPage from './pages/EventosPage';
import NovoEventoPage from './pages/NovoEventoPage';
import EventoDetalhePage from './pages/EventoDetalhePage';
import EventoPDFPage from './pages/EventoPDFPage';
import OrcamentoAprovacaoPage from './pages/OrcamentoAprovacaoPage';
import ConfiguracoesFiscaisPage from './pages/ConfiguracoesFiscaisPage';
import AssistenteIAPage from './pages/AssistenteIAPage';
import WhatsAppConfiguracaoPage from './pages/WhatsAppConfiguracaoPage';
import WhatsAppClientesPage from './pages/WhatsAppClientesPage';
import WhatsAppConversasPage from './pages/WhatsAppConversasPage';
import WhatsAppDisparosPage from './pages/WhatsAppDisparosPage';
import WhatsAppRelatorioPage from './pages/WhatsAppRelatorioPage';
import CardapioLojaPage from './pages/CardapioLojaPage';
import CardapioEntregaPage from './pages/CardapioEntregaPage';
import CardapioCashbackPage from './pages/CardapioCashbackPage';
import CardapioPagamentoPage from './pages/CardapioPagamentoPage';
import CardapioWhatsappPage from './pages/CardapioWhatsappPage';
import CardapioItensPage from './pages/CardapioItensPage';
import CardapioPublicoPage from './pages/CardapioPublicoPage';
import PedidosCardapioPage from './pages/PedidosCardapioPage';
import PedidosAgendadosPage from './pages/PedidosAgendadosPage';
import CuponsCardapioPage from './pages/CuponsCardapioPage';
import ClientesCardapioPage from './pages/ClientesCardapioPage';
import RelatoriosCardapioPage from './pages/RelatoriosCardapioPage';
import SaudeEstoquePage from './pages/SaudeEstoquePage';
import EtiquetaNutricionalPage from './pages/EtiquetaNutricionalPage';
import RastreamentoLotesPage from './pages/RastreamentoLotesPage';

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Router>
          <ScrollToTop />
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/estoque/lote/:id" element={<LotePublicoPage />} />
            <Route path="/cardapio/:slug" element={<CardapioPublicoPage />} />
            
            <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
            
            <Route path="/pedidos" element={<ProtectedRoute><DashboardLayout><PedidosPage /></DashboardLayout></ProtectedRoute>} />
            <Route path="/pedidos/:id" element={<ProtectedRoute><DashboardLayout><PedidoDetailPage /></DashboardLayout></ProtectedRoute>} />
            
            {/* Rotas de Eventos */}
            <Route path="/dashboard/eventos" element={<ProtectedRoute><EventosPage /></ProtectedRoute>} />
            <Route path="/dashboard/eventos/novo" element={<ProtectedRoute><NovoEventoPage /></ProtectedRoute>} />
            <Route path="/dashboard/eventos/:id" element={<ProtectedRoute><EventoDetalhePage /></ProtectedRoute>} />
            <Route path="/dashboard/eventos/:id/editar" element={<ProtectedRoute><NovoEventoPage /></ProtectedRoute>} />
            <Route path="/dashboard/eventos/:id/pdf" element={<ProtectedRoute><EventoPDFPage /></ProtectedRoute>} />
            <Route path="/orcamento/:token" element={<OrcamentoAprovacaoPage />} />
            {/* Redirects para compatibilidade */}
            <Route path="/eventos" element={<Navigate to="/dashboard/eventos" replace />} />
            <Route path="/eventos/novo" element={<Navigate to="/dashboard/eventos/novo" replace />} />

            <Route path="/dashboard/usuarios" element={<ProtectedRoute><UsuariosPage /></ProtectedRoute>} />
            <Route path="/dashboard/locais" element={<ProtectedRoute><LocaisPage /></ProtectedRoute>} />
            <Route path="/dashboard/produtos" element={<ProtectedRoute><ProdutosPage /></ProtectedRoute>} />
            {/* CardapioPage.jsx foi quebrada em 5 páginas menores — cada
                seção do antigo painel único agora tem sua própria rota, sem
                nenhuma mudança nas tabelas/colunas usadas. */}
            <Route path="/dashboard/cardapio" element={<ProtectedRoute><CardapioLojaPage /></ProtectedRoute>} />
            <Route path="/dashboard/cardapio/entrega" element={<ProtectedRoute><CardapioEntregaPage /></ProtectedRoute>} />
            <Route path="/dashboard/cardapio/cashback" element={<ProtectedRoute><CardapioCashbackPage /></ProtectedRoute>} />
            <Route path="/dashboard/cardapio/pagamento" element={<ProtectedRoute><CardapioPagamentoPage /></ProtectedRoute>} />
            <Route path="/dashboard/cardapio/whatsapp" element={<ProtectedRoute><CardapioWhatsappPage /></ProtectedRoute>} />
            <Route path="/dashboard/cardapio/itens" element={<ProtectedRoute><CardapioItensPage /></ProtectedRoute>} />
            <Route path="/dashboard/cardapio/pedidos" element={<ProtectedRoute><PedidosCardapioPage /></ProtectedRoute>} />
            <Route path="/dashboard/pedidos-agendados" element={<ProtectedRoute><PedidosAgendadosPage /></ProtectedRoute>} />
            <Route path="/dashboard/cardapio/relatorios" element={<ProtectedRoute><RelatoriosCardapioPage /></ProtectedRoute>} />
            <Route path="/dashboard/cardapio/relatorios/:aba" element={<ProtectedRoute><RelatoriosCardapioPage /></ProtectedRoute>} />
            <Route path="/dashboard/cardapio/cupons" element={<ProtectedRoute><CuponsCardapioPage /></ProtectedRoute>} />
            <Route path="/dashboard/cardapio/clientes" element={<ProtectedRoute><ClientesCardapioPage /></ProtectedRoute>} />
            <Route path="/dashboard/lotes" element={<ProtectedRoute><LotesPage /></ProtectedRoute>} />
            <Route path="/dashboard/etiquetas-lote" element={<ProtectedRoute><EtiquetasLotePage /></ProtectedRoute>} />
            <Route path="/dashboard/pdv" element={<ProtectedRoute><PDVPage /></ProtectedRoute>} />
            <Route path="/dashboard/pdv-rapido" element={<ProtectedRoute><PDVRapidoPage /></ProtectedRoute>} />
            <Route path="/dashboard/pdv-pedidos-balcao" element={<ProtectedRoute><PedidosBalcaoPage /></ProtectedRoute>} />
            {/* Tela antiga (lista de produtos do estoque) — mantida só como reserva */}
            <Route path="/dashboard/pdv-pedidos-balcao-antigo" element={<ProtectedRoute><PDVPedidosBalcaoPage /></ProtectedRoute>} />
            <Route path="/dashboard/pdv/venda/:id" element={<ProtectedRoute><VendaInquiryPage /></ProtectedRoute>} />
            <Route path="/dashboard/configuracao-etiqueta" element={<ProtectedRoute><ConfiguracaoEtiquetaPage /></ProtectedRoute>} />
            <Route path="/dashboard/estoque-local" element={<ProtectedRoute><EstoqueLocalPage /></ProtectedRoute>} />
            <Route path="/dashboard/saude-estoque" element={<ProtectedRoute><SaudeEstoquePage /></ProtectedRoute>} />
            <Route path="/dashboard/etiqueta-nutricional" element={<ProtectedRoute><EtiquetaNutricionalPage /></ProtectedRoute>} />
            <Route path="/dashboard/rastreamento-lotes" element={<ProtectedRoute><RastreamentoLotesPage /></ProtectedRoute>} />
            <Route path="/dashboard/movimentacoes" element={<ProtectedRoute><MovimentacoesPage /></ProtectedRoute>} />
            <Route path="/dashboard/alertas" element={<ProtectedRoute><AlertasPage /></ProtectedRoute>} />
            <Route path="/dashboard/assistente-ia" element={<ProtectedRoute><AssistenteIAPage /></ProtectedRoute>} />
            <Route path="/dashboard/operacao-mercados" element={<ProtectedRoute><DashboardLayout><OperacaoMercadosPage /></DashboardLayout></ProtectedRoute>} />
            <Route path="/dashboard/checklist-mercado" element={<ProtectedRoute><DashboardLayout><ChecklistMercadoPage /></DashboardLayout></ProtectedRoute>} />
            <Route path="/auditoria-mercado" element={<ProtectedRoute><AuditoriaMercadoPage /></ProtectedRoute>} />
            <Route path="/relatorio-auditoria-mercado" element={<ProtectedRoute><RelatorioAuditoriaMercadoPage /></ProtectedRoute>} />
            <Route path="/relatorio-consolidado-produto" element={<ProtectedRoute><RelatorioConsolidadoProdutoPage /></ProtectedRoute>} />
            <Route path="/relatorio-produto-danificado" element={<ProtectedRoute><RelatorioProdutoDanificadoPage /></ProtectedRoute>} />
            <Route path="/comparativo-mercados" element={<ProtectedRoute><ComparativoMercadosPage /></ProtectedRoute>} />
            <Route path="/relatorio-vendas-mercado" element={<ProtectedRoute><RelatorioVendasMercadoPage /></ProtectedRoute>} />
            <Route path="/relatorio-auditorias" element={<ProtectedRoute><RelatorioAuditoriasPage /></ProtectedRoute>} />
            
            <Route path="/dashboard/registrar-producao" element={<ProtectedRoute><RegistrarProducaoPage /></ProtectedRoute>} />
            <Route path="/registrar-producao" element={<Navigate to="/dashboard/registrar-producao" replace />} />
            <Route path="/dashboard/registrar-producao-classicos" element={<ProtectedRoute><RegistrarProducaoClassicosPage /></ProtectedRoute>} />
            <Route path="/registrar-producao-classicos" element={<Navigate to="/dashboard/registrar-producao-classicos" replace />} />
            <Route path="/dashboard/registrar-producao-bandejas" element={<ProtectedRoute><RegistrarProducaoBandejasPage /></ProtectedRoute>} />
            <Route path="/registrar-producao-bandejas" element={<Navigate to="/dashboard/registrar-producao-bandejas" replace />} />
            
            <Route path="/transferencia-estoque" element={<ProtectedRoute><TransferenciaEstoquePage /></ProtectedRoute>} />
            <Route path="/dashboard/fechamento-mercado-consignado" element={<ProtectedRoute><FechamentoMercadoConsignadoPage /></ProtectedRoute>} />
            <Route path="/dashboard/reconciliacao-consignado" element={<ProtectedRoute><ReconciliacaoConsignadoPage /></ProtectedRoute>} />
            <Route path="/dashboard/pedido-reabastecimento" element={<ProtectedRoute><PedidoReabastecimentoPage /></ProtectedRoute>} />
            <Route path="/dashboard/conferencia-carregamento" element={<ProtectedRoute><ConferenciaCarregamentoPage /></ProtectedRoute>} />
            <Route path="/venda-mercado" element={<ProtectedRoute><RegistrarVendaMercadoPage /></ProtectedRoute>} />
            <Route path="/dashboard/venda-aplicativo" element={<ProtectedRoute><VendaAplicativoPage /></ProtectedRoute>} />
            <Route path="/devolucao" element={<ProtectedRoute><RegistrarDevolucaoPage /></ProtectedRoute>} />
            <Route path="/dashboard/venda-classicos" element={<ProtectedRoute><RegistrarVendaClassicosPage /></ProtectedRoute>} />
            <Route path="/dashboard/venda-bandejas" element={<ProtectedRoute><RegistrarVendaBandejasPage /></ProtectedRoute>} />
            
            <Route path="/dashboard/vendas-pendentes" element={<ProtectedRoute><VendasPendentesPage /></ProtectedRoute>} />
            <Route path="/dashboard/relatorio-vendas-pendentes" element={<ProtectedRoute><RelatorioVendasPendentesPage /></ProtectedRoute>} />
            
            <Route path="/dashboard/configurar-composicao" element={<ProtectedRoute><ConfigurarComposicaoPage /></ProtectedRoute>} />
            <Route path="/dashboard/produzir-bandejas" element={<ProtectedRoute><ProduzirBandejasPage /></ProtectedRoute>} />
            <Route path="/produzir-bandejas" element={<Navigate to="/dashboard/produzir-bandejas" replace />} />
            <Route path="/controle-bandejas" element={<ProtectedRoute><ControleBandejasPage /></ProtectedRoute>} />
            
            <Route path="/dashboard/relatorio-producao" element={<ProtectedRoute><RelatorioProdutosPage /></ProtectedRoute>} />
            <Route path="/dashboard/relatorio-producao-saidas" element={<ProtectedRoute><RelatorioProducaoSaidasPage /></ProtectedRoute>} />
            <Route path="/relatorio-mercado" element={<ProtectedRoute><RelatorioDevolucoesMercadoPage /></ProtectedRoute>} />
            <Route path="/dashboard/relatorio-vendas" element={<ProtectedRoute><RelatorioVendasPage /></ProtectedRoute>} />
            <Route path="/dashboard/relatorio-vendas-consolidado" element={<ProtectedRoute adminOnly><RelatorioVendasConsolidadoPage /></ProtectedRoute>} />
            <Route path="/relatorio-vendas-consolidado" element={<Navigate to="/dashboard/relatorio-vendas-consolidado" replace />} />
            
            <Route path="/dashboard/logs-auditoria" element={<ProtectedRoute><LogsAuditoriaPage /></ProtectedRoute>} />
            
            <Route path="/dashboard/admin/reset-operacional" element={<ProtectedRoute><DashboardLayout><AdminResetPage /></DashboardLayout></ProtectedRoute>} />
            <Route path="/admin/reset-operacional" element={<Navigate to="/dashboard/admin/reset-operacional" replace />} />
            
            <Route path="/dashboard/empresas" element={<ProtectedRoute adminOnly><EmpresasPage /></ProtectedRoute>} />
            <Route path="/dashboard/gestor-empresas" element={<ProtectedRoute><SuperAdminGuard><GestorEmpresasPage /></SuperAdminGuard></ProtectedRoute>} />
            <Route path="/dashboard/perfis" element={<ProtectedRoute><PerfisPage /></ProtectedRoute>} />

            <Route path="/configuracoes-fiscais" element={<ProtectedRoute><ConfiguracoesFiscaisPage /></ProtectedRoute>} />

            {/* Rotas do módulo WhatsApp (Evolution API) */}
            <Route path="/dashboard/whatsapp/configuracao" element={<ProtectedRoute><WhatsAppConfiguracaoPage /></ProtectedRoute>} />
            <Route path="/dashboard/whatsapp/clientes" element={<ProtectedRoute><WhatsAppClientesPage /></ProtectedRoute>} />
            <Route path="/dashboard/whatsapp/conversas" element={<ProtectedRoute><WhatsAppConversasPage /></ProtectedRoute>} />
            <Route path="/dashboard/whatsapp/disparos" element={<ProtectedRoute><WhatsAppDisparosPage /></ProtectedRoute>} />
            <Route path="/dashboard/whatsapp/relatorio" element={<ProtectedRoute><WhatsAppRelatorioPage /></ProtectedRoute>} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <Toaster />
        </Router>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;