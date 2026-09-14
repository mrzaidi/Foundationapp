import { Block, KpiSkeleton, Line } from '@/components/Skeleton';

export default function Loading() {
  return (
    <>
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span className="sk" style={{ width: 44, height: 38, borderRadius: 12 }} />
          <div className="sk-lines">
            <Line w="180px" h={22} />
            <Line w="240px" h={11} />
          </div>
        </div>
      </div>
      <KpiSkeleton count={4} />
      <div className="two-col mt-24">
        <div className="panel">
          <div className="panel-head">
            <div className="sk-lines">
              <Line w="130px" h={13} />
              <Line w="220px" h={10} />
            </div>
          </div>
          <div className="panel-body">
            <Block h={240} />
          </div>
        </div>
        <div className="panel">
          <div className="panel-head">
            <div className="sk-lines">
              <Line w="120px" h={13} />
              <Line w="190px" h={10} />
            </div>
          </div>
          <div className="panel-body">
            <Block h={280} />
          </div>
        </div>
      </div>
    </>
  );
}
