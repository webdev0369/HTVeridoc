'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
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
  organizationName: z
    .string()
    .trim()
    .min(2, 'Organization name must be at least 2 characters')
    .max(255, 'Organization name must be at most 255 characters'),
  organizationSlug: z
    .string()
    .trim()
    .min(2, 'Slug must be at least 2 characters')
    .max(100, 'Slug must be at most 100 characters')
    .regex(
      /^[a-z0-9-]+$/,
      'Use lowercase letters, numbers, and hyphens only (e.g. acme-corp)',
    ),
  name: z
    .string()
    .trim()
    .min(2, 'Your name must be at least 2 characters')
    .max(255, 'Your name must be at most 255 characters'),
  email: z
    .string()
    .trim()
    .min(1, 'Email is required')
    .email('Enter a valid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters'),
});

type FormValues = z.infer<typeof schema>;

const FIELDS: {
  name: keyof FormValues;
  label: string;
  type: string;
  autoComplete?: string;
  hint?: string;
}[] = [
  {
    name: 'organizationName',
    label: 'Organization name',
    type: 'text',
    autoComplete: 'organization',
  },
  {
    name: 'organizationSlug',
    label: 'Slug',
    type: 'text',
    autoComplete: 'off',
    hint: 'Used in URLs — lowercase letters, numbers, and hyphens.',
  },
  {
    name: 'name',
    label: 'Your name',
    type: 'text',
    autoComplete: 'name',
  },
  {
    name: 'email',
    label: 'Email',
    type: 'email',
    autoComplete: 'email',
  },
  {
    name: 'password',
    label: 'Password',
    type: 'password',
    autoComplete: 'new-password',
    hint: 'At least 8 characters.',
  },
];

export default function RegisterPage() {
  const { register: registerUser } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { isSubmitting, errors, isSubmitted },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    reValidateMode: 'onChange',
  });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      await registerUser(values);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Registration failed');
    }
  });

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-10">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground shadow-soft">
          HV
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Create your organization
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Set up HTVeriDoc with an admin account.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Register</CardTitle>
          <CardDescription>
            Organization details and your admin credentials.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="grid gap-4" noValidate>
            {FIELDS.map((field) => {
              const fieldError = errors[field.name];
              const describedBy = fieldError
                ? `${field.name}-error`
                : field.hint
                  ? `${field.name}-hint`
                  : undefined;
              return (
                <div key={field.name} className="space-y-2">
                  <Label htmlFor={field.name}>{field.label}</Label>
                  <Input
                    id={field.name}
                    type={field.type}
                    autoComplete={field.autoComplete}
                    aria-invalid={Boolean(fieldError)}
                    aria-describedby={describedBy}
                    className={cn(
                      fieldError &&
                        'border-destructive focus-visible:ring-destructive/30',
                    )}
                    {...register(field.name)}
                  />
                  {fieldError ? (
                    <p
                      id={`${field.name}-error`}
                      role="alert"
                      className="text-sm text-destructive"
                    >
                      {fieldError.message}
                    </p>
                  ) : field.hint ? (
                    <p
                      id={`${field.name}-hint`}
                      className="text-xs text-muted-foreground"
                    >
                      {field.hint}
                    </p>
                  ) : null}
                </div>
              );
            })}
            {error && (
              <p
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            )}
            {isSubmitted && Object.keys(errors).length > 0 && !error ? (
              <p role="alert" className="text-sm text-destructive">
                Please fix the highlighted fields and try again.
              </p>
            ) : null}
            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? 'Creating…' : 'Create account'}
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link
              href="/login"
              className="font-semibold text-primary hover:underline"
            >
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
