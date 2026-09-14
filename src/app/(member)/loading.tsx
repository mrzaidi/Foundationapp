import { CardSkeleton, Line } from '@/components/Skeleton';

export default function Loading() {
  return (
    <div className="screen">
      <div className="hero">
        <div className="greet">
          <span className="sk sk-avatar" style={{ width: 48, height: 48, borderRadius: 16 }} />
          <div className="sk-lines" style={{ flex: 1 }}>
            <Line w="120px" h={10} />
            <Line w="160px" h={14} />
          </div>
        </div>
        <div className="mt-20 sk-hero-card">
          <Line w="140px" h={10} />
          <div style={{ marginTop: 10 }}>
            <Line w="180px" h={24} />
          </div>
        </div>
      </div>

      <div className="pad overlap">
        <div className="stat-row">
          {[0, 1, 2, 3].map((i) => (
            <div className="stat" key={i}>
              <Line w="24px" h={18} />
              <div style={{ marginTop: 8 }}>
                <Line w="80%" h={9} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="pad">
        <div className="section-head">
          <Line w="140px" h={14} />
        </div>
        <div className="fund-grid">
          {[0, 1, 2, 3].map((i) => (
            <span className="sk" key={i} style={{ height: 136, borderRadius: 'var(--r-lg)' }} />
          ))}
        </div>
      </div>

      <div className="pad">
        <div className="section-head">
          <Line w="120px" h={14} />
        </div>
        <CardSkeleton rows={2} />
      </div>
    </div>
  );
}
