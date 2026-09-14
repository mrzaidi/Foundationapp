import { Block, Line } from '@/components/Skeleton';

export default function Loading() {
  return (
    <div className="screen">
      <div className="hero">
        <div className="center mt-20">
          <span
            className="sk"
            style={{ width: 76, height: 76, borderRadius: 26, display: 'inline-block' }}
          />
          <div style={{ marginTop: 12, display: 'grid', placeItems: 'center', gap: 6 }}>
            <Line w="160px" h={16} />
            <Line w="110px" h={10} />
          </div>
        </div>
      </div>
      <div className="pad overlap">
        <div className="card">
          <Block h={44} />
        </div>
      </div>
      <div className="pad">
        <div className="section-head">
          <Line w="160px" h={14} />
        </div>
        <div className="card">
          <Block h={210} />
        </div>
      </div>
    </div>
  );
}
