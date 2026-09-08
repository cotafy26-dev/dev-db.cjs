import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './stores/auth';
import { AppLayout } from './layouts/AppLayout';
import { LoginPage } from './pages/Login';
import { RegisterPage } from './pages/Register';
import { DashboardPage } from './pages/Dashboard';
import { AssistantPage } from './pages/Assistant';
import { SalesPage } from './pages/Sales';
import { CustomersPage } from './pages/Customers';
import { ProductsPage } from './pages/Products';
import { FinancePage } from './pages/Finance';
import { AgendaPage } from './pages/Agenda';
import { SettingsPage } from './pages/Settings';

function RequireAuth({ children }: { children: JSX.Element }) {
  const user = useAuth((s) => s.user);
  return user ? children : <Navigate to="/login" replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/registrar" element={<RegisterPage />} />
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
        <Route path="/produtos" element={<ProductsPage />} />
        <Route path="/financeiro" element={<FinancePage />} />
        <Route path="/agenda" element={<AgendaPage />} />
        <Route path="/configuracoes" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
