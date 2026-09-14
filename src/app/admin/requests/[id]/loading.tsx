import { Block, Line } from '@/components/Skeleton';

export default function Loading() {
  return (
    <>
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span className="sk" style={{ width: 44, height: 38, borderRadius: 12 }} />
          <div className="sk-lines">
            <Line w="190px" h={22} />
            <Line w="260px" h={11} />
          </div>
        </div>
        <span className="sk" style={{ width: 96, height: 22, borderRadius: 999 }} />
      </div>

      <div className="two-col">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {[70, 220, 170].map((h, i) => (
            <div className="panel" key={i}>
              <div className="panel-head">
                <div className="sk-lines">
                  <Line w="140px" h={13} />
                  <Line w="210px" h={10} />
                </div>
              </div>
              <div className="panel-body">
                <Block h={h} />
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {[120, 260].map((h, i) => (
            <div className="panel" key={i}>
              <div className="panel-head">
                <div className="sk-lines">
                  <Line w="110px" h={13} />
                  <Line w="180px" h={10} />
                </div>
              </div>
              <div className="panel-body">
                <Block h={h} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
