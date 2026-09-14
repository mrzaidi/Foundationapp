import { Block, Line } from '@/components/Skeleton';

export default function Loading() {
  return (
    <div className="screen">
      <div className="hero tight">
        <div className="appbar">
          <span className="sk" style={{ width: 40, height: 40, borderRadius: 13 }} />
          <div className="sk-lines" style={{ flex: 1 }}>
            <Line w="170px" h={16} />
            <Line w="110px" h={10} />
          </div>
        </div>
        <div className="mt-20 sk-hero-card">
          <Line w="120px" h={10} />
          <div style={{ marginTop: 10 }}>
            <Line w="160px" h={22} />
          </div>
        </div>
      </div>
      <div className="pad overlap">
        <div className="card">
          <Block h={58} />
        </div>
      </div>
      <div className="pad">
        <div className="section-head">
          <Line w="140px" h={14} />
        </div>
        <div className="card">
          <Block h={150} />
        </div>
      </div>
    </div>
  );
}
