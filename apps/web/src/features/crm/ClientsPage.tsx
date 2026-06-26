import { useState } from 'react';
import { Card, Title, Text, Table, TableHead, TableHeaderCell, TableBody, TableRow, TableCell, Badge, Button, Flex } from '@tremor/react';
import { PlusIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { Link } from 'react-router-dom';
import { useClients, useCreateClient, type Client } from './hooks/useCRMQueries';

export const ClientsPage = () => {
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Form State
  const [name, setName] = useState('');
  const [industry, setIndustry] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');

  const { data, isLoading } = useClients({ search });
  const createClientMutation = useCreateClient();

  const clients = data?.data || [];

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    createClientMutation.mutate(
      { name, industry, email, phone, website },
      {
        onSuccess: () => {
          setIsModalOpen(false);
          setName('');
          setIndustry('');
          setEmail('');
          setPhone('');
          setWebsite('');
        },
      }
    );
  };

  return (
    <div className="p-6 h-full overflow-auto bg-gray-50 dark:bg-gray-900">
      <Flex className="mb-6">
        <div>
          <Title className="dark:text-white">Clients</Title>
          <Text className="dark:text-gray-400">Manage your customer organizations.</Text>
        </div>
        <Button icon={PlusIcon} color="blue" onClick={() => setIsModalOpen(true)}>Add Client</Button>
      </Flex>

      <div className="mb-6 max-w-sm relative">
        <input
          type="text"
          placeholder="Search clients..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 rounded-md text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <MagnifyingGlassIcon className="w-5 h-5 absolute left-3 top-2.5 text-gray-400" />
      </div>

      <Card>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Name</TableHeaderCell>
              <TableHeaderCell>Industry</TableHeaderCell>
              <TableHeaderCell>Email</TableHeaderCell>
              <TableHeaderCell>Phone</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell>Actions</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-6 text-gray-500">
                  Loading clients...
                </TableCell>
              </TableRow>
            ) : clients.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-6 text-gray-500">
                  No clients found. Click "Add Client" to create one.
                </TableCell>
              </TableRow>
            ) : (
              clients.map((client: Client) => (
                <TableRow key={client.id}>
                  <TableCell className="font-medium text-gray-900 dark:text-gray-100">{client.name}</TableCell>
                  <TableCell>{client.industry || '-'}</TableCell>
                  <TableCell>{client.email || '-'}</TableCell>
                  <TableCell>{client.phone || '-'}</TableCell>
                  <TableCell>
                    <Badge color={client.status === 'ACTIVE' ? 'emerald' : 'gray'}>
                      {client.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Link to={`/crm/clients/${client.id}`}>
                      <Button size="xs" variant="secondary" color="gray">View</Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Add Client Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full p-6 shadow-xl border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Add New Client</h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Company Name *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
                  placeholder="Acme Corp"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Industry</label>
                <input
                  type="text"
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
                  placeholder="Software / Healthcare"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
                  placeholder="contact@acme.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone</label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
                  placeholder="+1 (555) 000-0000"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Website</label>
                <input
                  type="url"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
                  placeholder="https://acme.com"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-4 border-t border-gray-100 dark:border-gray-700">
                <Button type="button" variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                <Button type="submit" loading={createClientMutation.isPending}>Save Client</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
