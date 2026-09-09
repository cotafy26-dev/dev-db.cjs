import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './stores/auth';
import { useApplyTheme } from './stores/theme';
import { AppLayout } from './layouts/AppLayout';
import { LoginPage } from './pages/Login';
import { RegisterPage } from './pages/Register';
import { OnboardingPage } from './pages/Onboarding';
import { DashboardPage } from './pages/Dashboard';
import { AssistantPage } from './pages/Assistant';
import { SalesPage } from './pages/Sales';
import { CustomersPage } from './pages/Customers';
import { SuppliersPage } from './pages/Suppliers';
import { ProductsPage } from './pages/Products';
import { InventoryPage } from './pages/Inventory';
import { FinancePage } from './pages/Finance';
import { ReceivablesPage } from './pages/Receivables';
import { PayablesPage } from './pages/Payables';
import { ChargesPage } from './pages/Charges';
import { AgendaPage } from './pages/Agenda';
import { ReportsPage } from './pages/Reports';
import { ConversationsPage } from './pages/Conversations';
import { AutomationsPage } from './pages/Automations';
import { IntegrationsPage } from './pages/Integrations';
import { UsersPage } from './pages/Users';
import { CompanyPage } from './pages/Company';
import { SubscriptionPage } from './pages/Subscription';
import { NotificationsPage } from './pages/Notifications';

function RequireAuth({ children }: { children: JSX.Element }) {
  const user = useAuth((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  if (user.onboarded === false) return <Navigate to="/onboarding" replace />;
  return children;
}

export function App() {
  useApplyTheme();
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/registrar" element={<RegisterPage />} />
      <Route path="/onboarding" element={<OnboardingPage />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route path="/assistente" element={<AssistantPage />} />
        <Route path="/vendas" element={<SalesPage />} />
        <Route path="/clientes" element={<CustomersPage />} />
        <Route path="/fornecedores" element={<SuppliersPage />} />
        <Route path="/produtos" element={<ProductsPage />} />
        <Route path="/estoque" element={<InventoryPage />} />
        <Route path="/financeiro" element={<FinancePage />} />
        <Route path="/contas-a-receber" element={<ReceivablesPage />} />
        <Route path="/contas-a-pagar" element={<PayablesPage />} />
        <Route path="/cobrancas" element={<ChargesPage />} />
        <Route path="/agenda" element={<AgendaPage />} />
        <Route path="/relatorios" element={<ReportsPage />} />
        <Route path="/conversas" element={<ConversationsPage />} />
        <Route path="/automacoes" element={<AutomationsPage />} />
        <Route path="/integracoes" element={<IntegrationsPage />} />
        <Route path="/usuarios" element={<UsersPage />} />
        <Route path="/empresa" element={<CompanyPage />} />
        <Route path="/assinatura" element={<SubscriptionPage />} />
        <Route path="/notificacoes" element={<NotificationsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
