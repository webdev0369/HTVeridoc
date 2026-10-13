'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Cable,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings2,
  Users,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

const workspaceNav = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/documents', label: 'Documents', icon: FileText },
];

const adminNav = [{ href: '/users', label: 'Users & Roles', icon: Users }];

function BrandMark({ className }: { className?: string }) {
  return (
    <Link href="/dashboard" className={cn('flex items-center gap-2.5', className)}>
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
        HV
      </span>
      <span className="text-base font-semibold tracking-tight text-foreground">
        HTVeriDoc
      </span>
    </Link>
  );
}

function NavLinks({
  onNavigate,
  canManageFields,
  canReadIntegrations,
  pathname,
  dark = false,
}: {
  onNavigate?: () => void;
  canManageFields: boolean;
  canReadIntegrations: boolean;
  pathname: string;
  dark?: boolean;
}) {
  const linkClass = (active: boolean) =>
    cn(
      'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition',
      dark
        ? active
          ? 'bg-[#3b82f6]/20 text-[#93c5fd]'
          : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
        : active
          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
    );

  return (
    <div className="space-y-6">
      <div>
        <p
          className={cn(
            'mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider',
            dark ? 'text-slate-500' : 'text-muted-foreground',
          )}
        >
          Workspace
        </p>
        <nav className="space-y-0.5">
          {workspaceNav.map((item) => {
            const Icon = item.icon;
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={linkClass(active)}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {canManageFields || canReadIntegrations ? (
        <div>
          <p
            className={cn(
              'mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider',
              dark ? 'text-slate-500' : 'text-muted-foreground',
            )}
          >
            Configuration
          </p>
          <nav className="space-y-0.5">
            {canManageFields ? (
              <Link
                href="/settings/fields"
                onClick={onNavigate}
                className={linkClass(pathname.startsWith('/settings/fields'))}
              >
                <Settings2 className="h-4 w-4" aria-hidden />
                Field Manager
              </Link>
            ) : null}
            {canReadIntegrations ? (
              <Link
                href="/settings/integrations/webhooks"
                onClick={onNavigate}
                className={linkClass(
                  pathname.startsWith('/settings/integrations/webhooks'),
                )}
              >
                <Cable className="h-4 w-4" aria-hidden />
                Webhooks
              </Link>
            ) : null}
          </nav>
        </div>
      ) : null}

      <div>
        <p
          className={cn(
            'mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider',
            dark ? 'text-slate-500' : 'text-muted-foreground',
          )}
        >
          Administration
        </p>
        <nav className="space-y-0.5">
          {adminNav.map((item) => {
            const Icon = item.icon;
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={linkClass(active)}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

export function AppShell({
  children,
  layout = 'default',
}: {
  children: React.ReactNode;
  layout?: 'default' | 'workspace';
}) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isWorkspace = layout === 'workspace';
  const canManageFields = Boolean(user?.permissions?.includes('field.manage'));
  const canReadIntegrations = Boolean(
    user?.permissions?.includes('integration.read') ||
      user?.permissions?.includes('integration.manage'),
  );
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0b0f14] text-slate-400">
        Loading…
      </div>
    );
  }

  const initials = user.name
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const userMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            'h-auto gap-2 px-2 py-1.5',
            isWorkspace && 'text-slate-200 hover:bg-white/5 hover:text-white',
          )}
        >
          <Avatar className="h-8 w-8">
            <AvatarFallback>{initials || 'U'}</AvatarFallback>
          </Avatar>
          <span className="hidden text-left sm:block">
            <span className="block text-sm font-semibold leading-none">
              {user.name}
            </span>
            <span
              className={cn(
                'mt-1 block text-[11px]',
                isWorkspace ? 'text-slate-500' : 'text-muted-foreground',
              )}
            >
              {user.role}
            </span>
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="truncate font-medium">{user.name}</div>
          <div className="truncate text-xs font-normal text-muted-foreground">
            {user.email}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => logout().then(() => router.push('/login'))}
        >
          <LogOut className="h-4 w-4" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (isWorkspace) {
    return (
      <div className="flex h-screen flex-col overflow-hidden bg-[#0b0f14] text-slate-100">
        <header className="z-20 shrink-0 border-b border-white/10 bg-[#121826]">
          <div className="flex items-center justify-between gap-4 px-4 py-2.5">
            <div className="flex min-w-0 items-center gap-6">
              <Link
                href="/dashboard"
                className="flex items-center gap-2.5 font-semibold text-white"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#3b82f6] text-sm font-bold">
                  HV
                </span>
                <span className="text-base">HTVeriDoc</span>
              </Link>
              <nav className="hidden gap-1 md:flex">
                {[...workspaceNav, ...adminNav]
                  .concat(
                    canManageFields
                      ? [
                          {
                            href: '/settings/fields',
                            label: 'Settings',
                            icon: Settings2,
                          },
                        ]
                      : [],
                  )
                  .concat(
                    canReadIntegrations
                      ? [
                          {
                            href: '/settings/integrations/webhooks',
                            label: 'Webhooks',
                            icon: Cable,
                          },
                        ]
                      : [],
                  )
                  .map((item) => {
                    const Icon = item.icon;
                    const active = pathname.startsWith(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition',
                          active
                            ? 'bg-[#3b82f6]/20 text-[#93c5fd]'
                            : 'text-slate-400 hover:bg-white/5 hover:text-slate-200',
                        )}
                      >
                        <Icon className="h-3.5 w-3.5 opacity-80" aria-hidden />
                        {item.label}
                      </Link>
                    );
                  })}
              </nav>
            </div>
            {userMenu}
          </div>
        </header>
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-sidebar md:flex">
        <div className="flex h-14 items-center px-4">
          <BrandMark />
        </div>
        <Separator />
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <NavLinks
            canManageFields={canManageFields}
            canReadIntegrations={canReadIntegrations}
            pathname={pathname}
          />
        </div>
        <div className="border-t p-3">{userMenu}</div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b bg-card/90 px-4 backdrop-blur md:px-6">
          <div className="flex items-center gap-2 md:hidden">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" aria-label="Open menu">
                  <Menu className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0">
                <SheetHeader className="border-b px-4 py-4 text-left">
                  <SheetTitle>
                    <BrandMark />
                  </SheetTitle>
                </SheetHeader>
                <div className="px-3 py-4">
                  <NavLinks
                    canManageFields={canManageFields}
                    canReadIntegrations={canReadIntegrations}
                    pathname={pathname}
                    onNavigate={() => setMobileOpen(false)}
                  />
                </div>
              </SheetContent>
            </Sheet>
            <BrandMark />
          </div>
          <div className="ml-auto md:hidden">{userMenu}</div>
          <p className="hidden text-sm text-muted-foreground md:block">
            Document intelligence for purchase order confirmations
          </p>
        </header>
        <main className="w-full flex-1 px-5 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
