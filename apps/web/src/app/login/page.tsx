'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { LogIn } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

const schema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Email is required')
    .email('Enter a valid email address'),
  password: z
    .string()
    .min(1, 'Password is required')
    .min(8, 'Password must be at least 8 characters'),
});

type FormValues = z.infer<typeof schema>;

function loginErrorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) {
    return 'Sign in failed. Check your connection and try again.';
  }
  if (err.status === 401) {
    return (
      err.message ||
      'Invalid email or password. Check your details and try again.'
    );
  }
  if (err.status === 400) {
    return err.message || 'Invalid details. Please check and try again.';
  }
  if (err.status >= 500) {
    return 'Sign in is temporarily unavailable. Please try again in a moment.';
  }
  return err.message || 'Sign in failed. Please try again.';
}

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { isSubmitting, errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    reValidateMode: 'onChange',
  });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      await login(values.email, values.password);
      router.push('/dashboard');
    } catch (err) {
      setError(loginErrorMessage(err));
    }
  });

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground shadow-soft">
          HV
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Sign in to HTVeriDoc
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Review purchase orders with confidence.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Welcome back</CardTitle>
          <CardDescription>Enter your credentials to continue.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? 'email-error' : undefined}
                className={cn(
                  errors.email &&
                    'border-destructive focus-visible:ring-destructive/30',
                )}
                {...register('email')}
              />
              {errors.email ? (
                <p id="email-error" role="alert" className="text-sm text-destructive">
                  {errors.email.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                aria-invalid={Boolean(errors.password)}
                aria-describedby={
                  errors.password ? 'password-error' : undefined
                }
                className={cn(
                  errors.password &&
                    'border-destructive focus-visible:ring-destructive/30',
                )}
                {...register('password')}
              />
              {errors.password ? (
                <p
                  id="password-error"
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {errors.password.message}
                </p>
              ) : null}
            </div>
            {error ? (
              <p
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            ) : null}
            <Button type="submit" disabled={isSubmitting} className="w-full">
              <LogIn className="h-4 w-4" aria-hidden />
              {isSubmitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            New organization?{' '}
            <Link
              href="/register"
              className="font-semibold text-primary hover:underline"
            >
              Create account
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
