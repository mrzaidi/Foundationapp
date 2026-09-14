import { Block, Line } from '@/components/Skeleton';

export default function Loading() {
  return (
    <>
      <div className="topbar">
        <div className="sk-lines">
          <Line w="110px" h={22} />
          <Line w="340px" h={11} />
        </div>
      </div>
      <div className="panel">
        <div className="panel-head">
          <div className="sk-lines">
            <Line w="140px" h={13} />
            <Line w="220px" h={10} />
          </div>
        </div>
        <div className="panel-body">
          <Block h={200} />
        </div>
      </div>
    </>
  );
}
