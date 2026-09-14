import { KpiSkeleton, Line, TableSkeleton } from '@/components/Skeleton';

export default function Loading() {
  return (
    <>
      <div className="topbar">
        <div className="sk-lines">
          <Line w="150px" h={22} />
          <Line w="280px" h={11} />
        </div>
        <span className="sk" style={{ width: 168, height: 38, borderRadius: 12 }} />
      </div>

      <KpiSkeleton count={4} />
      <div className="mt-16">
        <KpiSkeleton count={4} />
      </div>

      <div className="two-col mt-24">
        <div className="panel">
          <div className="panel-head">
            <div className="sk-lines">
              <Line w="160px" h={13} />
              <Line w="220px" h={10} />
            </div>
          </div>
          <TableSkeleton rows={5} cols={5} />
        </div>
        <div className="panel">
          <div className="panel-head">
            <div className="sk-lines">
              <Line w="130px" h={13} />
              <Line w="200px" h={10} />
            </div>
          </div>
          <div className="panel-body">
            {[0, 1, 2, 3].map((i) => (
              <div className="bar-row" key={i}>
                <div className="bl">
                  <Line w="90px" h={11} />
                </div>
                <div className="btrack">
                  <span className="sk" style={{ width: `${80 - i * 17}%`, height: '100%' }} />
                </div>
                <div className="bv">
                  <Line w="22px" h={11} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
