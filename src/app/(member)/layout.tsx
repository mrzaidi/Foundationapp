import BottomNav from '@/components/BottomNav';
import PhoneShell from '@/components/PhoneShell';

export default function MemberLayout({ children }: { children: React.ReactNode }) {
  return (
    <PhoneShell>
      {children}
      <BottomNav />
    </PhoneShell>
  );
}
