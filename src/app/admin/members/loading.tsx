import { Line, TableSkeleton } from '@/components/Skeleton';

export default function Loading() {
  return (
    <>
      <div className="topbar">
        <div className="sk-lines">
          <Line w="130px" h={22} />
          <Line w="180px" h={11} />
        </div>
      </div>
      <div className="panel">
        <div className="panel-head">
          <div className="toolbar" style={{ flex: 1 }}>
            <span className="sk" style={{ height: 39, borderRadius: 12, flex: 1, minWidth: 210 }} />
            <div className="chips">
              {[88, 84, 120].map((w, i) => (
                <span className="sk" key={i} style={{ width: w, height: 33, borderRadius: 999 }} />
              ))}
            </div>
          </div>
        </div>
        <TableSkeleton rows={8} cols={7} />
      </div>
    </>
  );
}
