import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { EdgeLabelRenderer, getBezierPath, Position, useReactFlow } from 'reactflow';
import useDiagramStore from '../../stores/diagramStore';
import { useEscapeClose } from '../../hooks/useEscapeClose';

const quickValues = [
  ['1', 'Exacto'], ['0..1', 'Opcional'], ['*', 'Muchos'],
  ['0..*', '0 a muchos'], ['1..*', 'Mandatorio'], ['Custom', 'Manual'],
];

function multiplicities(data) {
  if (data?.xmiImported) return [
    (data.multiplicidadOrigen || '').replace('N', '*'),
    (data.multiplicidadDestino || '').replace('N', '*'),
  ];
  if (data?.multiplicidadOrigen || data?.multiplicidadDestino) return [(data.multiplicidadOrigen || '1').replace('N', '*'), (data.multiplicidadDestino || '*').replace('N', '*')];
  const [source = '1', target = '*'] = (data?.cardinality || '1 : *').replace(/[()]/g, '').split(':').map((value) => value.trim().replace('N', '*'));
  return [source, target];
}

const positionForSide = (side) => ({ top: Position.Top, right: Position.Right, bottom: Position.Bottom, left: Position.Left }[side] || Position.Right);
function pointForAnchor(bounds, anchor, fallback) {
  if (!bounds || !anchor) return fallback;
  const offset = Math.max(0, Math.min(1, anchor.offset ?? 0.5));
  if (anchor.side === 'top') return { x: bounds.x + bounds.width * offset, y: bounds.y };
  if (anchor.side === 'bottom') return { x: bounds.x + bounds.width * offset, y: bounds.y + bounds.height };
  if (anchor.side === 'left') return { x: bounds.x, y: bounds.y + bounds.height * offset };
  return { x: bounds.x + bounds.width, y: bounds.y + bounds.height * offset };
}
function anchorForPoint(bounds, point) {
  if (!bounds) return null;
  const clamp = (value) => Math.max(0, Math.min(1, value));
  const candidates = [
    { side: 'top', offset: clamp((point.x - bounds.x) / bounds.width), distance: Math.abs(point.y - bounds.y) },
    { side: 'bottom', offset: clamp((point.x - bounds.x) / bounds.width), distance: Math.abs(point.y - (bounds.y + bounds.height)) },
    { side: 'left', offset: clamp((point.y - bounds.y) / bounds.height), distance: Math.abs(point.x - bounds.x) },
    { side: 'right', offset: clamp((point.y - bounds.y) / bounds.height), distance: Math.abs(point.x - (bounds.x + bounds.width)) },
  ];
  const { side, offset } = candidates.reduce((closest, candidate) => candidate.distance < closest.distance ? candidate : closest);
  return { side, offset };
}

// UML cardinalities belong to their association end, not to a percentage of
// the complete line. A fixed short offset keeps them beside the class when a
// relationship crosses a large canvas.
function pointNearEndpoint(from, to, preferredOffset = 28) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (!length) return from;
  const offset = Math.min(preferredOffset, length * 0.25);
  return { x: from.x + (dx / length) * offset, y: from.y + (dy / length) * offset };
}

const markerName = (edgeId, name) => `uml-${String(edgeId).replace(/[^a-zA-Z0-9_-]/g, '-')}-${name}`;

function notationFor(relationType, edgeId, fallbackMarkerEnd) {
  const marker = (name) => `url(#${markerName(edgeId, name)})`;
  const base = { stroke: '#8083ff', strokeWidth: 2 };

  switch (relationType) {
    case 'agregacion':
      return { ...base, markerEnd: marker('diamond-open') };
    case 'composicion':
      return { ...base, markerEnd: marker('diamond-filled') };
    case 'herencia':
      return { ...base, markerEnd: marker('triangle-open') };
    case 'realizacion':
      return { ...base, strokeDasharray: '7 5', markerEnd: marker('triangle-open') };
    case 'dependencia':
      return { ...base, strokeDasharray: '7 5', markerEnd: marker('arrow-open') };
    case 'asociacion':
    default:
      return { ...base, markerEnd: fallbackMarkerEnd };
  }
}

function UmlMarkers({ edgeId }) {
  return <defs>
    <marker id={markerName(edgeId, 'diamond-open')} viewBox="0 0 20 12" refX="20" refY="6" markerWidth="20" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto">
      <path d="M 0 6 L 10 0 L 20 6 L 10 12 Z" fill="#080f21" stroke="#8083ff" strokeWidth="1.8" />
    </marker>
    <marker id={markerName(edgeId, 'diamond-filled')} viewBox="0 0 20 12" refX="20" refY="6" markerWidth="20" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto">
      <path d="M 0 6 L 10 0 L 20 6 L 10 12 Z" fill="#8083ff" stroke="#8083ff" strokeWidth="1.8" />
    </marker>
    <marker id={markerName(edgeId, 'triangle-open')} viewBox="0 0 14 14" refX="13" refY="7" markerWidth="13" markerHeight="13" orient="auto">
      <path d="M 1 1 L 13 7 L 1 13 Z" fill="#080f21" stroke="#8083ff" strokeWidth="1.8" />
    </marker>
    <marker id={markerName(edgeId, 'arrow-open')} viewBox="0 0 14 14" refX="12" refY="7" markerWidth="12" markerHeight="12" orient="auto">
      <path d="M 1 1 L 12 7 L 1 13" fill="none" stroke="#8083ff" strokeWidth="1.8" />
    </marker>
  </defs>;
}

export default function RelationEdge({ id, source, target, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd: fallbackMarkerEnd, style }) {
  const [savedSource, savedTarget] = multiplicities(data);
  const [open, setOpen] = useState(false);
  const [activeEnd, setActiveEnd] = useState('target');
  const [sourceMultiplicity, setSourceMultiplicity] = useState(savedSource);
  const [targetMultiplicity, setTargetMultiplicity] = useState(savedTarget);
  const [umlLabel, setUmlLabel] = useState(data?.umlLabel || '');
  const [ownerNodeId, setOwnerNodeId] = useState(data?.ownerNodeId || source);
  const [wholeNodeId, setWholeNodeId] = useState(data?.wholeNodeId || target);
  const [bidirectional, setBidirectional] = useState(Boolean(data?.bidirectional));
  const [sourceRole, setSourceRole] = useState(data?.sourceRole || '');
  const [targetRole, setTargetRole] = useState(data?.targetRole || '');
  const [panelPosition, setPanelPosition] = useState(() => ({ x: Math.max(16, (window.innerWidth - 390) / 2), y: Math.max(16, (window.innerHeight - 450) / 2) }));
  const dragOffsetRef = useRef(null);
  const dragListenersRef = useRef(null);
  const anchorDragRef = useRef(null);
  const [dragAnchors, setDragAnchors] = useState(null);
  const { screenToFlowPosition } = useReactFlow();
  const selectedValue = activeEnd === 'source' ? sourceMultiplicity : targetMultiplicity;
  const jpaAnnotation = data?.jpaAnnotation || data?.label || '';
  const setQuickValue = (value) => {
    if (value === 'Custom') return;
    if (activeEnd === 'source') setSourceMultiplicity(value); else setTargetMultiplicity(value);
  };
  const openEditorFor = (end, event) => {
    event?.stopPropagation(); setSourceMultiplicity(savedSource); setTargetMultiplicity(savedTarget); setUmlLabel(data?.umlLabel || ''); setActiveEnd(end); setOpen(true);
  };
  const apply = () => {
    useDiagramStore.getState().updateRelation(id, {
      multiplicidadOrigen: sourceMultiplicity || '',
      multiplicidadDestino: targetMultiplicity || '',
      umlLabel,
      ownerNodeId,
      wholeNodeId,
      bidirectional,
      sourceRole,
      targetRole,
    });
    setOpen(false);
  };
  // Escape confirma automáticamente el borrador local y activa el autosave.
  useEscapeClose(open, apply);
  const startDrag = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    dragOffsetRef.current = { x: event.clientX - panelPosition.x, y: event.clientY - panelPosition.y };
    const move = (moveEvent) => {
      if (!dragOffsetRef.current) return;
      setPanelPosition({ x: Math.max(8, moveEvent.clientX - dragOffsetRef.current.x), y: Math.max(8, moveEvent.clientY - dragOffsetRef.current.y) });
    };
    const up = () => stopDrag();
    dragListenersRef.current = { move, up };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up, { once: true });
  };
  const stopDrag = () => {
    dragOffsetRef.current = null;
    if (dragListenersRef.current) window.removeEventListener('mousemove', dragListenersRef.current.move);
    dragListenersRef.current = null;
  };
  const relationType = data?.relationType || 'asociacion';
  const notation = notationFor(relationType, id, fallbackMarkerEnd);
  const { markerStart, markerEnd, ...edgeStyle } = notation;
  const renderedEdgeStyle = data?.highlighted ? { ...edgeStyle, ...style, stroke: '#fbbf24', strokeWidth: 3 } : { ...edgeStyle, ...style };
  const crossings = data?.crossings || [];
  const crossingMaskId = `uml-crossing-mask-${String(id).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  const associationClassPosition = relationType === 'asociacion' ? data?.associationClassPosition : null;
  const sourceAnchor = dragAnchors?.source || data?.sourceAnchor;
  const targetAnchor = dragAnchors?.target || data?.targetAnchor;
  const sourcePoint = pointForAnchor(data?.sourceBounds, sourceAnchor, { x: sourceX, y: sourceY });
  const targetPoint = pointForAnchor(data?.targetBounds, targetAnchor, { x: targetX, y: targetY });
  const sourceLabelPoint = pointNearEndpoint(sourcePoint, targetPoint);
  const targetLabelPoint = pointNearEndpoint(targetPoint, sourcePoint);
  const origenX = sourceLabelPoint.x;
  const origenY = sourceLabelPoint.y;
  const destinoX = targetLabelPoint.x;
  const destinoY = targetLabelPoint.y;
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX: sourcePoint.x, sourceY: sourcePoint.y, sourcePosition: sourceAnchor ? positionForSide(sourceAnchor.side) : sourcePosition, targetX: targetPoint.x, targetY: targetPoint.y, targetPosition: targetAnchor ? positionForSide(targetAnchor.side) : targetPosition });
  const startAnchorDrag = (which, event) => {
    if (!data?.canManage || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const initial = { source: data?.sourceAnchor || anchorForPoint(data?.sourceBounds, sourcePoint), target: data?.targetAnchor || anchorForPoint(data?.targetBounds, targetPoint) };
    anchorDragRef.current = initial;
    const start = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const move = (moveEvent) => {
      const point = screenToFlowPosition({ x: moveEvent.clientX, y: moveEvent.clientY });
      if (which === 'middle') {
        const delta = { x: point.x - start.x, y: point.y - start.y };
        const anchors = { source: anchorForPoint(data?.sourceBounds, { x: sourcePoint.x + delta.x, y: sourcePoint.y + delta.y }), target: anchorForPoint(data?.targetBounds, { x: targetPoint.x + delta.x, y: targetPoint.y + delta.y }) };
        anchorDragRef.current = anchors;
        setDragAnchors(anchors);
      } else {
        const anchors = { ...initial, [which]: anchorForPoint(which === 'source' ? data?.sourceBounds : data?.targetBounds, point) };
        anchorDragRef.current = anchors;
        setDragAnchors(anchors);
      }
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      const anchors = anchorDragRef.current;
      anchorDragRef.current = null;
      if (anchors?.source && anchors?.target) useDiagramStore.getState().updateRelationAnchors(id, anchors.source, anchors.target);
      setDragAnchors(null);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up, { once: true });
  };

  return <>
    <UmlMarkers edgeId={id} />
    {crossings.length > 0 && <defs><mask id={crossingMaskId} maskUnits="userSpaceOnUse" x="-100000" y="-100000" width="200000" height="200000"><rect x="-100000" y="-100000" width="200000" height="200000" fill="white" />{crossings.map((crossing, index) => <circle key={`${crossing.x}-${crossing.y}-${index}`} cx={crossing.x} cy={crossing.y} r="12" fill="black" />)}</mask></defs>}
    <path d={edgePath} fill="none" className="react-flow__edge-path" markerStart={markerStart} markerEnd={markerEnd} mask={crossings.length > 0 ? `url(#${crossingMaskId})` : undefined} style={renderedEdgeStyle} />
    {crossings.map((crossing, index) => <g key={`${crossing.x}-${crossing.y}-${index}`} transform={`translate(${crossing.x} ${crossing.y}) rotate(${crossing.angle})`} pointerEvents="none">
      <path d="M -11 0 Q 0 -10 11 0" fill="none" stroke={renderedEdgeStyle.stroke || '#8083ff'} strokeWidth={renderedEdgeStyle.strokeWidth || 2} strokeDasharray={renderedEdgeStyle.strokeDasharray} />
    </g>)}
    {data?.canManage && <path d={edgePath} fill="none" stroke="transparent" strokeWidth="18" pointerEvents="stroke" onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); data.onOpenMenu?.(event.clientX, event.clientY); }} />}
    {data?.canManage && <>
      <circle cx={labelX} cy={labelY} r="10" fill="transparent" pointerEvents="all" className="cursor-move" onMouseDown={(event) => startAnchorDrag('middle', event)} />
    </>}
    {associationClassPosition && <>
      <path d={`M ${labelX} ${labelY} L ${associationClassPosition.x} ${associationClassPosition.y}`} fill="none" stroke="#a5b4fc" strokeWidth="1.6" strokeDasharray="6 5" pointerEvents="none" />
      <circle cx={labelX} cy={labelY} r="4" fill="#080f21" stroke="#a5b4fc" strokeWidth="1.5" pointerEvents="none" />
    </>}
    <EdgeLabelRenderer>
      {savedSource && <button onClick={(event) => openEditorFor('source', event)} style={{ position: 'absolute', transform: `translate(-50%, -50%) translate(${origenX}px, ${origenY}px)`, pointerEvents: 'all' }} className="nodrag nopan rounded border border-cyan-300/50 bg-[#101a31] px-1.5 py-0.5 font-mono text-[10px] font-bold text-cyan-200 shadow hover:bg-cyan-500/20">{savedSource}</button>}
      {savedTarget && <button onClick={(event) => openEditorFor('target', event)} style={{ position: 'absolute', transform: `translate(-50%, -50%) translate(${destinoX}px, ${destinoY}px)`, pointerEvents: 'all' }} className="nodrag nopan rounded border border-violet-300/50 bg-[#101a31] px-1.5 py-0.5 font-mono text-[10px] font-bold text-violet-200 shadow hover:bg-violet-500/20">{savedTarget}</button>}
      <div style={{ position: 'absolute', transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, pointerEvents: 'all' }} className="nodrag nopan">
        <button aria-label="Editar relación UML" onClick={(event) => openEditorFor('target', event)} className="flex items-center gap-1 rounded-full border border-surface-variant bg-surface-container-high px-3 py-1.5 font-code-mono text-[11px] font-bold text-tertiary shadow-lg hover:border-indigo-400"><span className="material-symbols-outlined text-[14px]">link</span>{data?.umlLabel || null}</button>
        {open && createPortal(<section style={{ backgroundColor: '#0b1430', opacity: 1, left: panelPosition.x, top: panelPosition.y }} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); apply(); } }} className="fixed z-[9999] w-[390px] overflow-hidden rounded-2xl border-2 border-indigo-400/60 p-4 text-left text-xs text-slate-200 shadow-[0_0_35px_rgba(99,102,241,0.35)]">
          <header onMouseDown={startDrag} className="flex cursor-move items-center gap-3 border-b border-slate-700/80 pb-3"><span className="h-2 w-2 rounded-full bg-indigo-300 shadow-[0_0_9px_#a5b4fc]" /><h3 className="text-sm font-extrabold leading-tight text-white">Editar relación<br />UML y multiplicidad</h3><button onMouseDown={(event) => event.stopPropagation()} onClick={() => setOpen(false)} className="ml-auto rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-white">×</button><button onMouseDown={(event) => event.stopPropagation()} onClick={() => setActiveEnd(activeEnd === 'source' ? 'target' : 'source')} className="rounded-full border border-indigo-400/40 bg-indigo-500/20 px-3 py-2 font-mono text-[10px] text-indigo-200 hover:bg-indigo-500/30">Extremo: {activeEnd === 'source' ? `Origen (${sourceMultiplicity})` : `Destino (${targetMultiplicity})`} ↔</button></header>
          <label className="mt-3 block font-mono text-[10px] font-bold tracking-wide text-slate-400">ETIQUETA UML DE LA RELACIÓN<input value={umlLabel} onChange={(event) => setUmlLabel(event.target.value)} maxLength={60} placeholder="Ej.: enseña, pertenece, realiza" style={{ backgroundColor: '#071026', color: '#cffafe' }} className="mt-1.5 w-full rounded-lg border border-slate-600 px-3 py-2 font-sans text-xs font-normal shadow-inner shadow-black/40 outline-none placeholder:text-slate-500 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400/50" /></label>
          {['asociacion', 'agregacion', 'composicion'].includes(relationType) && <div className="mt-3 grid grid-cols-2 gap-2"><label className="text-[10px] text-slate-400">PROPIETARIO<select value={ownerNodeId} onChange={(event) => setOwnerNodeId(event.target.value)} className="mt-1 w-full rounded border border-slate-600 bg-[#071026] p-2 text-slate-100"><option value={source}>Origen</option><option value={target}>Destino</option></select></label><label className="text-[10px] text-slate-400">{relationType === 'agregacion' || relationType === 'composicion' ? 'WHOLE (ROMBO)' : 'DIRECCIÓN'}<select value={relationType === 'agregacion' || relationType === 'composicion' ? wholeNodeId : ownerNodeId} onChange={(event) => { if (relationType === 'agregacion' || relationType === 'composicion') setWholeNodeId(event.target.value); else setOwnerNodeId(event.target.value); }} className="mt-1 w-full rounded border border-slate-600 bg-[#071026] p-2 text-slate-100"><option value={source}>Origen</option><option value={target}>Destino</option></select></label><label className="text-[10px] text-slate-400">ROL ORIGEN<input value={sourceRole} onChange={(event) => setSourceRole(event.target.value)} className="mt-1 w-full rounded border border-slate-600 bg-[#071026] p-2 text-slate-100" /></label><label className="text-[10px] text-slate-400">ROL DESTINO<input value={targetRole} onChange={(event) => setTargetRole(event.target.value)} className="mt-1 w-full rounded border border-slate-600 bg-[#071026] p-2 text-slate-100" /></label><label className="col-span-2 flex items-center gap-2 text-[11px] text-slate-300"><input type="checkbox" checked={bidirectional} onChange={(event) => setBidirectional(event.target.checked)} />Generar relación bidireccional</label></div>}
          <p className="mt-3 font-mono text-[10px] font-bold tracking-wide text-slate-400">VALORES RÁPIDOS DE CARDINALIDAD</p>
          <div className="mt-2 grid grid-cols-3 gap-2">{quickValues.map(([value, caption]) => <button key={value} onClick={() => setQuickValue(value)} className={`rounded-lg border px-2 py-2.5 text-center transition ${value !== 'Custom' && selectedValue === value ? 'border-indigo-300 bg-indigo-500/25 ring-2 ring-indigo-400/40' : 'border-slate-700 bg-[#101a31] hover:border-indigo-400'} ${value === 'Custom' ? 'text-amber-300' : 'text-cyan-200'}`}><b className="block font-mono text-sm">{value}</b><small className="mt-1 block text-[9px] text-slate-400">{caption}</small></button>)}</div>
          <div className="mt-3 flex gap-2"><input value={`${sourceMultiplicity} : ${targetMultiplicity}`} onChange={(event) => { const values = event.target.value.split(':').map((value) => value.trim()); if (values[0] !== undefined) setSourceMultiplicity(values[0]); if (values[1] !== undefined) setTargetMultiplicity(values[1]); }} placeholder="Ej.: 1 : *" style={{ backgroundColor: '#071026', color: '#cffafe' }} className="min-w-0 flex-1 appearance-none rounded-lg border border-slate-600 px-3 py-2 font-mono text-xs shadow-inner shadow-black/40 outline-none placeholder:text-slate-500 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400/50" /><button onClick={apply} title="Guardar multiplicidad" className="grid w-10 place-items-center rounded-lg bg-indigo-600 text-lg font-bold text-white hover:bg-indigo-500">✓</button></div>
          <div className="mt-3 border-t border-slate-700/70 pt-3 text-[11px]"><div className="flex items-center justify-between py-1.5"><span className="text-slate-400">◉ CascadeType:</span><span className="rounded border border-slate-600 px-2 py-1 font-mono text-[10px] text-slate-300">CascadeType.ALL</span></div><div className="flex items-center justify-between py-1.5"><span className="text-slate-400">FetchType:</span><span className="rounded bg-cyan-500/15 px-2 py-1 font-mono text-[10px] text-cyan-300">LAZY (default)</span></div></div>
          <div className="mt-2 rounded-lg border border-indigo-400/20 bg-[#071026] p-2"><p className="mb-1 font-mono text-[9px] uppercase tracking-wide text-slate-500">Anotación JPA en tiempo real</p><code className="block break-words font-mono text-[10px] leading-4 text-emerald-400">{jpaAnnotation ? `${jpaAnnotation}(cascade = CascadeType.ALL)` : 'No aplica para esta relación UML'}</code></div>
        </section>, document.body)}
      </div>
    </EdgeLabelRenderer>
  </>;
}
