import { CardSkeleton, Line } from '@/components/Skeleton';

export default function Loading() {
  return (
    <div className="screen">
      <div className="hero tight">
        <div className="appbar">
          <span className="sk" style={{ width: 40, height: 40, borderRadius: 13 }} />
          <div className="sk-lines" style={{ flex: 1 }}>
            <Line w="150px" h={16} />
            <Line w="200px" h={10} />
          </div>
        </div>
      </div>
      <div className="pad mt-16">
        <div className="chips">
          {[52, 84, 70, 88, 96].map((w, i) => (
            <span className="sk" key={i} style={{ width: w, height: 33, borderRadius: 999 }} />
          ))}
        </div>
      </div>
      <div className="pad mt-16">
        <CardSkeleton rows={4} />
      </div>
    </div>
  );
}
