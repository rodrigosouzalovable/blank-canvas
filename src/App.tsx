import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { AutoSendProvider } from "@/hooks/useAutoSend";
import { WhatsAppSendingProvider } from "@/contexts/WhatsAppSendingContext";
import { VoiceCampaignSendingProvider } from "@/contexts/VoiceCampaignSendingContext";

import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Acordos from "./pages/Acordos";
import NovoAcordo from "./pages/NovoAcordo";
import AcordoDetalhe from "./pages/AcordoDetalhe";
import EditarAcordo from "./pages/EditarAcordo";
import Comissoes from "./pages/Comissoes";
import AdminUsuarios from "./pages/AdminUsuarios";
import AdminEquipes from "./pages/AdminEquipes";
import EquipeAcordos from "./pages/EquipeAcordos";
import MinhaConta from "./pages/MinhaConta";
import UsuarioComissoes from "./pages/UsuarioComissoes";
import NovoAcordoAdmin from "./pages/NovoAcordoAdmin";
import Retornos from "./pages/Retornos";
import Auditoria from "./pages/Auditoria";
import Financeiro from "./pages/Financeiro";
import NotFound from "./pages/NotFound";
import PortalConsulta from "./pages/PortalConsulta";
import ConsultaResultado from "./pages/ConsultaResultado";
import ImportarDevedores from "./pages/ImportarDevedores";
import PoliticaPrivacidade from "./pages/PoliticaPrivacidade";
import AntifraudePage from "./pages/Antifraude";
import Clientes from "./pages/Clientes";
import DevedorDetalhe from "./pages/DevedorDetalhe";

import CredorDashboard from "./pages/CredorDashboard";
import Acionamento from "./pages/Acionamento";
import MetaPessoal from "./pages/MetaPessoal";
import AutomacaoCobMais from "./pages/AutomacaoCobMais";
import CampanhasVoz from "./pages/CampanhasVoz";
import WhatsAppInbox from "./pages/WhatsAppInbox";
import Aquecimento from "./pages/Aquecimento";
import MonitorEnvios from "./pages/MonitorEnvios";
import ExportarDados from "./pages/ExportarDados";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  }
  
  if (!user) {
    return <Navigate to="/auth" replace />;
  }
  
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  }
  
  if (user) {
    return <Navigate to="/dashboard" replace />;
  }
  
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();
  
  if (loading || roleLoading) {
    return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  }
  
  if (!user) {
    return <Navigate to="/auth" replace />;
  }
  
  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }
  
  return <>{children}</>;
}

function PermissionRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { isAdmin, isGestor, loading: roleLoading } = useUserRole();
  const { abasPermitidas, isLoading: permLoading } = useUserPermissions();
  const location = useLocation();
  
  if (loading || roleLoading || permLoading) {
    return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  }
  
  if (!user) {
    return <Navigate to="/auth" replace />;
  }
  
  if (isAdmin) {
    return <>{children}</>;
  }
  
  if (abasPermitidas && abasPermitidas.includes(location.pathname)) {
    return <>{children}</>;
  }

  if (!abasPermitidas && isGestor) {
    return <>{children}</>;
  }
  
  return <Navigate to="/dashboard" replace />;
}

function GestorRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { isGestor, isAdmin, loading: roleLoading } = useUserRole();
  
  if (loading || roleLoading) {
    return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  }
  
  if (!user) {
    return <Navigate to="/auth" replace />;
  }
  
  if (!isGestor && !isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }
  
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AutoSendProvider>
          <WhatsAppSendingProvider>
          <VoiceCampaignSendingProvider>
          <Routes>
            <Route path="/" element={<Navigate to="/novomundo" replace />} />
            <Route path="/inbox" element={<PermissionRoute><WhatsAppInbox /></PermissionRoute>} />
            <Route path="/:creditor" element={<PortalConsulta />} />
            <Route path="/consulta/:creditor/:cpf" element={<ConsultaResultado />} />
            <Route path="/politica-de-privacidade" element={<PoliticaPrivacidade />} />
            <Route path="/antifraude" element={<AntifraudePage />} />
            <Route path="/credor/:slug/dashboard" element={<CredorDashboard />} />
            <Route path="/auth" element={<PublicRoute><Auth /></PublicRoute>} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/acordos" element={<ProtectedRoute><Acordos /></ProtectedRoute>} />
            <Route path="/acordos/novo" element={<ProtectedRoute><NovoAcordo /></ProtectedRoute>} />
            <Route path="/acordos/:id" element={<ProtectedRoute><AcordoDetalhe /></ProtectedRoute>} />
            <Route path="/acordos/:id/editar" element={<ProtectedRoute><EditarAcordo /></ProtectedRoute>} />
            <Route path="/retornos" element={<ProtectedRoute><Retornos /></ProtectedRoute>} />
            <Route path="/clientes" element={<ProtectedRoute><Clientes /></ProtectedRoute>} />
            <Route path="/clientes/:id" element={<ProtectedRoute><DevedorDetalhe /></ProtectedRoute>} />
            <Route path="/comissoes" element={<ProtectedRoute><Comissoes /></ProtectedRoute>} />
            <Route path="/conta" element={<ProtectedRoute><MinhaConta /></ProtectedRoute>} />
            <Route path="/equipe/acordos" element={<PermissionRoute><EquipeAcordos /></PermissionRoute>} />
            <Route path="/admin/usuarios" element={<PermissionRoute><AdminUsuarios /></PermissionRoute>} />
            <Route path="/admin/usuarios/:userId/comissoes" element={<AdminRoute><UsuarioComissoes /></AdminRoute>} />
            <Route path="/admin/usuarios/:userId/novo-acordo" element={<AdminRoute><NovoAcordoAdmin /></AdminRoute>} />
            <Route path="/admin/equipes" element={<PermissionRoute><AdminEquipes /></PermissionRoute>} />
            <Route path="/admin/auditoria" element={<PermissionRoute><Auditoria /></PermissionRoute>} />
            <Route path="/admin/financeiro" element={<PermissionRoute><Financeiro /></PermissionRoute>} />
            <Route path="/admin/importar-devedores" element={<PermissionRoute><ImportarDevedores /></PermissionRoute>} />
            <Route path="/admin/acionamento" element={<PermissionRoute><Acionamento /></PermissionRoute>} />
            <Route path="/admin/automacao-cobmais" element={<PermissionRoute><AutomacaoCobMais /></PermissionRoute>} />
            <Route path="/meta" element={<ProtectedRoute><MetaPessoal /></ProtectedRoute>} />
            <Route path="/campanhas-voz" element={<PermissionRoute><CampanhasVoz /></PermissionRoute>} />
            <Route path="/aquecimento" element={<ProtectedRoute><Aquecimento /></ProtectedRoute>} />
            <Route path="/monitor-envios" element={<PermissionRoute><MonitorEnvios /></PermissionRoute>} />
            <Route path="/admin/exportar-dados" element={<PermissionRoute><ExportarDados /></PermissionRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </VoiceCampaignSendingProvider>
          </WhatsAppSendingProvider>
          </AutoSendProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
