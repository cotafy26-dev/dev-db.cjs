import { Button } from '../components/ui';
import { SimpleListPage } from '../components/SimpleListPage';
import { api } from '../api/client';

export function SuppliersPage() {
  return (
    <SimpleListPage
      title="Fornecedores"
      endpoint="/suppliers"
      queryKey="suppliers"
      createLabel="Novo fornecedor"
      createFields={[
        { name: 'name', label: 'Nome', required: true },
        { name: 'phone', label: 'Telefone' },
        { name: 'email', label: 'E-mail', type: 'email' },
        { name: 'document', label: 'CNPJ/CPF' },
      ]}
      columns={[
        { header: 'Nome', render: (r: any) => <span className="font-medium text-slate-700 dark:text-slate-200">{r.name}</span> },
        { header: 'Telefone', render: (r: any) => r.phone || '-' },
        { header: 'E-mail', render: (r: any) => r.email || '-' },
      ]}
      rowActions={(r: any, reload) => (
        <Button
          size="sm"
          variant="ghost"
          onClick={async () => {
            await api.delete(`/suppliers/${r.id}`);
            reload();
          }}
        >
          Excluir
        </Button>
      )}
    />
  );
}
