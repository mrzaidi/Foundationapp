import PhoneShell from '@/components/PhoneShell';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <PhoneShell variant="auth">{children}</PhoneShell>;
}
