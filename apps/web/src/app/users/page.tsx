'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Loader2, Pencil, UserPlus, X } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { AppShell } from '@/components/app-shell';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/ui/page-header';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { apiFetch, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';

type RoleCode = 'ADMIN' | 'REVIEWER' | 'OPERATOR' | 'VIEWER';
type UserStatus = 'ACTIVE' | 'DISABLED';

interface OrgUser {
  id: string;
  email: string;
  name: string;
  status: UserStatus;
  role: RoleCode;
  isPrimary: boolean;
  joinedAt: string;
}

interface RoleOption {
  code: RoleCode;
  name: string;
}

const ROLE_OPTIONS: RoleCode[] = [
  'ADMIN',
  'REVIEWER',
  'OPERATOR',
  'VIEWER',
];

const createUserSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(255, 'Name must be at most 255 characters'),
  email: z
    .string()
    .trim()
    .min(1, 'Email is required')
    .email('Enter a valid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters'),
  role: z.enum(['ADMIN', 'REVIEWER', 'OPERATOR', 'VIEWER']),
});

type CreateUserForm = z.infer<typeof createUserSchema>;

export default function UsersPage() {
  const { user: me } = useAuth();
  const queryClient = useQueryClient();
  const canManage = Boolean(me?.permissions?.includes('user.manage'));

  const [createOpen, setCreateOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [editingRoleUserId, setEditingRoleUserId] = useState<string | null>(
    null,
  );
  const [draftRole, setDraftRole] = useState<RoleCode>('REVIEWER');

  const createForm = useForm<CreateUserForm>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      role: 'REVIEWER',
    },
    mode: 'onBlur',
  });

  useEffect(() => {
    if (!createOpen) {
      createForm.reset({
        name: '',
        email: '',
        password: '',
        role: 'REVIEWER',
      });
      setFormError(null);
    }
  }, [createOpen, createForm]);

  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: () => apiFetch<OrgUser[]>('/users'),
  });

  const rolesQuery = useQuery({
    queryKey: ['users', 'roles'],
    queryFn: () => apiFetch<RoleOption[]>('/users/roles'),
  });

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ['users'] });

  const createMutation = useMutation({
    mutationFn: (values: CreateUserForm) =>
      apiFetch<OrgUser>('/users', {
        method: 'POST',
        body: JSON.stringify({
          name: values.name.trim(),
          email: values.email.trim(),
          password: values.password,
          role: values.role,
        }),
      }),
    onSuccess: () => {
      toast.success('User added to organization');
      setCreateOpen(false);
      invalidate();
    },
    onError: (err) => {
      const message =
        err instanceof ApiError ? err.message : 'Could not create user';
      const lower = message.toLowerCase();
      if (lower.includes('password')) {
        createForm.setError('password', { message });
      } else if (lower.includes('email') || lower.includes('already')) {
        createForm.setError('email', { message });
      } else {
        setFormError(message);
      }
    },
  });

  const onCreateSubmit = createForm.handleSubmit((values) => {
    setFormError(null);
    createMutation.mutate(values);
  });

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: RoleCode }) =>
      apiFetch<OrgUser>(`/users/${id}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      }),
    onSuccess: () => {
      toast.success('Role updated');
      setEditingRoleUserId(null);
      invalidate();
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Could not update role');
    },
  });

  const startEditRole = (user: OrgUser) => {
    setEditingRoleUserId(user.id);
    setDraftRole(user.role);
  };

  const cancelEditRole = () => {
    setEditingRoleUserId(null);
  };

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: UserStatus }) =>
      apiFetch<OrgUser>(`/users/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    onSuccess: (data) => {
      toast.success(
        data.status === 'ACTIVE' ? 'User enabled' : 'User disabled',
      );
      invalidate();
    },
    onError: (err) => {
      toast.error(
        err instanceof ApiError ? err.message : 'Could not update status',
      );
    },
  });

  const roleLabels = new Map(
    (rolesQuery.data ?? []).map((r) => [r.code, r.name]),
  );

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          title="Users & Roles"
          description="Invite members, assign roles, and enable or disable access for this organization."
          actions={
            canManage ? (
              <Button onClick={() => setCreateOpen(true)}>
                <UserPlus className="h-4 w-4" aria-hidden />
                Add user
              </Button>
            ) : null
          }
        />

        {usersQuery.error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            Failed to load users
          </div>
        )}

        <Card>
          <CardContent className="p-0">
            {usersQuery.isLoading ? (
              <div className="space-y-3 p-5">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : !usersQuery.data?.length ? (
              <EmptyState
                title="No users found"
                description="Add an organization member to get started."
                action={
                  canManage ? (
                    <Button onClick={() => setCreateOpen(true)}>
                      Add user
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    {canManage ? <TableHead className="w-[140px]" /> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usersQuery.data.map((user) => {
                    const initials = user.name
                      .split(/\s+/)
                      .map((p) => p[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase();
                    const isSelf = me?.userId === user.id;
                    const busy =
                      roleMutation.isPending || statusMutation.isPending;
                    return (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar>
                              <AvatarFallback>{initials || 'U'}</AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-semibold text-foreground">
                                {user.name}
                                {isSelf ? (
                                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                                    (you)
                                  </span>
                                ) : null}
                              </p>
                              {user.isPrimary ? (
                                <p className="text-[11px] font-medium text-muted-foreground">
                                  Primary admin
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {user.email}
                        </TableCell>
                        <TableCell>
                          {canManage &&
                          !isSelf &&
                          editingRoleUserId === user.id ? (
                            <div className="flex items-center gap-1.5">
                              <Select
                                value={draftRole}
                                disabled={roleMutation.isPending}
                                onValueChange={(value) =>
                                  setDraftRole(value as RoleCode)
                                }
                              >
                                <SelectTrigger className="h-9 w-[130px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {ROLE_OPTIONS.map((code) => (
                                    <SelectItem key={code} value={code}>
                                      {roleLabels.get(code) ?? code}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button
                                type="button"
                                size="icon"
                                variant="default"
                                className="h-8 w-8 shrink-0"
                                title="Save role"
                                disabled={
                                  roleMutation.isPending ||
                                  draftRole === user.role
                                }
                                onClick={() =>
                                  roleMutation.mutate({
                                    id: user.id,
                                    role: draftRole,
                                  })
                                }
                              >
                                {roleMutation.isPending ? (
                                  <Loader2
                                    className="h-3.5 w-3.5 animate-spin"
                                    aria-hidden
                                  />
                                ) : (
                                  <Check className="h-3.5 w-3.5" aria-hidden />
                                )}
                              </Button>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 shrink-0"
                                title="Cancel"
                                disabled={roleMutation.isPending}
                                onClick={cancelEditRole}
                              >
                                <X className="h-3.5 w-3.5" aria-hidden />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <Badge
                                variant={
                                  user.role === 'ADMIN'
                                    ? 'default'
                                    : 'secondary'
                                }
                              >
                                {user.role}
                              </Badge>
                              {canManage && !isSelf ? (
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                                  title="Edit role"
                                  disabled={busy}
                                  onClick={() => startEditRole(user)}
                                >
                                  <Pencil
                                    className="h-3.5 w-3.5"
                                    aria-hidden
                                  />
                                </Button>
                              ) : null}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              user.status === 'ACTIVE' ? 'success' : 'warning'
                            }
                          >
                            {user.status}
                          </Badge>
                        </TableCell>
                        {canManage ? (
                          <TableCell>
                            {!isSelf ? (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={busy}
                                onClick={() =>
                                  statusMutation.mutate({
                                    id: user.id,
                                    status:
                                      user.status === 'ACTIVE'
                                        ? 'DISABLED'
                                        : 'ACTIVE',
                                  })
                                }
                              >
                                {statusMutation.isPending ? (
                                  <Loader2
                                    className="h-3.5 w-3.5 animate-spin"
                                    aria-hidden
                                  />
                                ) : null}
                                {user.status === 'ACTIVE'
                                  ? 'Disable'
                                  : 'Enable'}
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                —
                              </span>
                            )}
                          </TableCell>
                        ) : null}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <form onSubmit={onCreateSubmit} noValidate className="space-y-4">
            <DialogHeader>
              <DialogTitle>Add user</DialogTitle>
              <DialogDescription>
                Create a login for this organization. Name, email, and a
                password (at least 8 characters) are required.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-1">
              <div className="space-y-2">
                <Label htmlFor="user-name">Name</Label>
                <Input
                  id="user-name"
                  autoComplete="name"
                  placeholder="Jane Reviewer"
                  aria-invalid={Boolean(createForm.formState.errors.name)}
                  aria-describedby={
                    createForm.formState.errors.name
                      ? 'user-name-error'
                      : undefined
                  }
                  className={cn(
                    createForm.formState.errors.name &&
                      'border-destructive focus-visible:ring-destructive',
                  )}
                  {...createForm.register('name')}
                />
                {createForm.formState.errors.name ? (
                  <p id="user-name-error" className="text-xs text-destructive">
                    {createForm.formState.errors.name.message}
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="user-email">Email</Label>
                <Input
                  id="user-email"
                  type="email"
                  autoComplete="email"
                  placeholder="jane@example.com"
                  aria-invalid={Boolean(createForm.formState.errors.email)}
                  aria-describedby={
                    createForm.formState.errors.email
                      ? 'user-email-error'
                      : undefined
                  }
                  className={cn(
                    createForm.formState.errors.email &&
                      'border-destructive focus-visible:ring-destructive',
                  )}
                  {...createForm.register('email')}
                />
                {createForm.formState.errors.email ? (
                  <p id="user-email-error" className="text-xs text-destructive">
                    {createForm.formState.errors.email.message}
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="user-password">Password</Label>
                <Input
                  id="user-password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  aria-invalid={Boolean(createForm.formState.errors.password)}
                  aria-describedby={
                    createForm.formState.errors.password
                      ? 'user-password-error'
                      : 'user-password-hint'
                  }
                  className={cn(
                    createForm.formState.errors.password &&
                      'border-destructive focus-visible:ring-destructive',
                  )}
                  {...createForm.register('password')}
                />
                {createForm.formState.errors.password ? (
                  <p
                    id="user-password-error"
                    className="text-xs text-destructive"
                  >
                    {createForm.formState.errors.password.message}
                  </p>
                ) : (
                  <p id="user-password-hint" className="text-xs text-muted-foreground">
                    Required for new accounts. Minimum 8 characters.
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select
                  value={createForm.watch('role')}
                  onValueChange={(value) =>
                    createForm.setValue('role', value as RoleCode, {
                      shouldValidate: true,
                      shouldDirty: true,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((code) => (
                      <SelectItem key={code} value={code}>
                        {roleLabels.get(code) ?? code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {formError ? (
                <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {formError}
                </p>
              ) : null}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : null}
                Add user
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
