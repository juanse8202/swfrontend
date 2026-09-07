import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath } from 'reactflow';

export default function RelationEdge({
  sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd
}) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition,
  });

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={{ stroke: '#8083ff', strokeWidth: 2, strokeDasharray: '5,5' }} />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: 'all',
          }}
          className="nodrag nopan bg-surface-container-high border border-surface-variant text-tertiary px-3 py-1.5 rounded-full text-[11px] font-code-mono font-bold flex flex-col items-center shadow-lg"
        >
          <div className="flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">link</span>
            <span>{data?.label || '@OneToMany'}</span>
          </div>
          <span>{data?.cardinality || '(1 : N)'}</span>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
