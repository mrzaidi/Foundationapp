import { KpiSkeleton, Line } from '@/components/Skeleton';

export default function Loading() {
  return (
    <>
      <div className="topbar">
        <div className="sk-lines">
          <Line w="110px" h={22} />
          <Line w="320px" h={11} />
        </div>
      </div>
      <KpiSkeleton count={4} />
    </>
  );
}
