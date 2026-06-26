import { useState } from 'react';
import { Card, Title, Text, Table, TableHead, TableHeaderCell, TableBody, TableRow, TableCell, Button, Flex } from '@tremor/react';
import { PlusIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { useContacts, useCreateContact, useClients, type Contact } from './hooks/useCRMQueries';

export const ContactsPage = () => {
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form state
  const [clientId, setClientId] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [designation, setDesignation] = useState('');

  const { data: contactsData, isLoading } = useContacts({ search });
  const { data: clientsData } = useClients({ limit: 100 });
  const createContactMutation = useCreateContact();

  const contacts = contactsData?.data || [];
  const clients = clientsData?.data || [];

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !clientId) return;

    createContactMutation.mutate(
      { clientId, firstName, lastName, email, phone, designation },
      {
        onSuccess: () => {
          setIsModalOpen(false);
          setFirstName('');
          setLastName('');
          setEmail('');
          setPhone('');
          setDesignation('');
        },
      }
    );
  };

  return (
    <div className="p-6 h-full overflow-auto bg-gray-50 dark:bg-gray-900">
      <Flex className="mb-6">
        <div>
          <Title className="dark:text-white">Contacts</Title>
          <Text className="dark:text-gray-400">Manage individual customer contacts across your clients.</Text>
        </div>
        <Button icon={PlusIcon} color="blue" onClick={() => setIsModalOpen(true)}>Add Contact</Button>
      </Flex>

      <div className="mb-6 max-w-sm relative">
        <input
          type="text"
          placeholder="Search contacts..."
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
              <TableHeaderCell>Title / Designation</TableHeaderCell>
              <TableHeaderCell>Email</TableHeaderCell>
              <TableHeaderCell>Phone</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-6 text-gray-500">
                  Loading contacts...
                </TableCell>
              </TableRow>
            ) : contacts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-6 text-gray-500">
                  No contacts found. Click "Add Contact" to create one.
                </TableCell>
              </TableRow>
            ) : (
              contacts.map((contact: Contact) => (
                <TableRow key={contact.id}>
                  <TableCell className="font-medium text-gray-900 dark:text-gray-100">
                    {contact.firstName} {contact.lastName}
                  </TableCell>
                  <TableCell>{contact.designation || '-'}</TableCell>
                  <TableCell>{contact.email || '-'}</TableCell>
                  <TableCell>{contact.phone || '-'}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Add Contact Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full p-6 shadow-xl border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Add New Contact</h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Client Company *</label>
                <select
                  required
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
                >
                  <option value="">Select Client Company...</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">First Name *</label>
                  <input
                    type="text"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Last Name *</label>
                  <input
                    type="text"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Designation / Title</label>
                <input
                  type="text"
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
                  placeholder="VP of Engineering"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone</label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-4 border-t border-gray-100 dark:border-gray-700">
                <Button type="button" variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                <Button type="submit" loading={createContactMutation.isPending}>Save Contact</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
