/**
 * Loading placeholders.
 *
 * These mirror the shape of the real content so the page does not jump when
 * data lands — a spinner in the middle of an empty screen tells the member
 * nothing about what is coming.
 */

export function Line({ w = '100%', h = 12 }: { w?: string | number; h?: number }) {
  return <span className="sk" style={{ width: w, height: h }} />;
}

export function Block({ h = 80, r = 'var(--r-md)' }: { h?: number; r?: string }) {
  return <span className="sk" style={{ height: h, borderRadius: r, display: 'block' }} />;
}

/** Member dashboard / list placeholder. */
export function CardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="sk-stack">
      {Array.from({ length: rows }).map((_, i) => (
        <div className="card sk-row" key={i}>
          <span className="sk sk-avatar" />
          <div className="sk-lines">
            <Line w="62%" />
            <Line w="38%" h={10} />
          </div>
          <div className="sk-lines" style={{ flex: '0 0 64px', alignItems: 'flex-end' }}>
            <Line w="54px" />
            <Line w="28px" h={9} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Admin table placeholder. */
export function TableSkeleton({ rows = 6, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="grid sk-table">
        <thead>
          <tr>
            {Array.from({ length: cols }).map((_, i) => (
              <th key={i}>
                <Line w={i === 0 ? '90px' : '64px'} h={9} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r}>
              {Array.from({ length: cols }).map((_, c) => (
                <td key={c}>
                  {c === 0 ? (
                    <div className="sk-row" style={{ gap: 10 }}>
                      <span className="sk sk-avatar" style={{ width: 34, height: 34 }} />
                      <div className="sk-lines">
                        <Line w="96px" />
                        <Line w="62px" h={9} />
                      </div>
                    </div>
                  ) : (
                    <Line w={`${45 + ((r * 13 + c * 7) % 40)}px`} />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Admin KPI row placeholder. */
export function KpiSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="kpis">
      {Array.from({ length: count }).map((_, i) => (
        <div className="kpi" key={i}>
          <span className="sk" style={{ width: 40, height: 40, borderRadius: 13, display: 'block' }} />
          <div style={{ marginTop: 13 }}>
            <Line w="58px" h={24} />
          </div>
          <div style={{ marginTop: 8 }}>
            <Line w="76%" h={10} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Brand loader for a whole screen. */
export function ScreenLoader({ label }: { label?: string }) {
  return (
    <div className="screen-loader">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/img/logo.svg" alt="" />
      <span className="sl-bar">
        <span />
      </span>
      {label && <p>{label}</p>}
    </div>
  );
}
