import { FiLock } from 'react-icons/fi';
import { Handle, Position } from 'reactflow';

export default function ClassNode({ data, selected }) {
  const openMenu = (event) => { event.preventDefault(); event.stopPropagation(); data.onOpenMenu?.(event.clientX, event.clientY); };
  const hasRelationOn = (side) => (data.relationAnchors || []).some((connection) => connection.anchor?.side === side);
  const handleVisibility = (side) => hasRelationOn(side) ? '!pointer-events-none !opacity-0' : data.showConnectionHandles ? '!opacity-100' : '!opacity-0 group-hover:!opacity-100';
  const anchorStyle = (anchor) => {
    const offset = Math.max(0, Math.min(1, anchor.offset ?? 0.5)) * 100;
    if (anchor.side === 'top') return { left: `${offset}%`, top: 0, transform: 'translate(-50%, -50%)' };
    if (anchor.side === 'bottom') return { left: `${offset}%`, bottom: 0, transform: 'translate(-50%, 50%)' };
    if (anchor.side === 'left') return { left: 0, top: `${offset}%`, transform: 'translate(-50%, -50%)' };
    return { right: 0, top: `${offset}%`, transform: 'translate(50%, -50%)' };
  };
  const anchorFromPointer = (event, bounds) => {
    const x = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    const y = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
    const distances = [
      { side: 'top', offset: x, distance: y },
      { side: 'bottom', offset: x, distance: 1 - y },
      { side: 'left', offset: y, distance: x },
      { side: 'right', offset: y, distance: 1 - x },
    ];
    const { side, offset } = distances.reduce((closest, candidate) => candidate.distance < closest.distance ? candidate : closest);
    return { side, offset };
  };
  const startAnchorDrag = (connection, event) => {
    if (!data.canManage || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const bounds = event.currentTarget.parentElement.getBoundingClientRect();
    const move = (moveEvent) => data.onRelationAnchorPreview?.(connection.edgeId, connection.end, anchorFromPointer(moveEvent, bounds));
    const up = (upEvent) => {
      window.removeEventListener('mousemove', move);
      data.onRelationAnchorCommit?.(connection.edgeId, connection.end, anchorFromPointer(upEvent, bounds));
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up, { once: true });
  };
  return <div onContextMenu={data.canManage ? openMenu : undefined} className="group relative min-w-[250px] overflow-visible font-mono text-xs">
    <Handle id="top" type="source" position={Position.Top} className={`!h-3 !w-3 !border-2 !border-cyan-300 !bg-[#091124] transition-opacity ${handleVisibility('top')}`} />
    <Handle id="right" type="source" position={Position.Right} className={`!h-3 !w-3 !border-2 !border-violet-300 !bg-[#091124] transition-opacity ${handleVisibility('right')}`} />
    <Handle id="bottom" type="source" position={Position.Bottom} className={`!h-3 !w-3 !border-2 !border-cyan-300 !bg-[#091124] transition-opacity ${handleVisibility('bottom')}`} />
    <Handle id="left" type="source" position={Position.Left} className={`!h-3 !w-3 !border-2 !border-violet-300 !bg-[#091124] transition-opacity ${handleVisibility('left')}`} />
    {(data.relationAnchors || []).map((connection) => <button key={`${connection.edgeId}-${connection.end}`} type="button" aria-label="Mover punto de conexión" title="Arrastra para mover este extremo sobre la clase" onMouseDown={(event) => startAnchorDrag(connection, event)} onClick={(event) => event.stopPropagation()} style={anchorStyle(connection.anchor)} className="nodrag nopan absolute z-30 grid h-9 w-9 cursor-grab place-items-center rounded-full bg-transparent p-0 outline-none active:cursor-grabbing focus:outline-none"><span aria-hidden="true" className={`h-3 w-3 rounded-full border-2 bg-[#091124] shadow-[0_0_8px_rgba(103,232,249,0.45)] ${connection.end === 'source' ? 'border-cyan-300' : 'border-violet-300'}`} /></button>)}
    <div className={`overflow-hidden rounded-xl border bg-[#101a35]/95 shadow-2xl ${selected ? 'border-indigo-400 ring-2 ring-indigo-500/30' : 'border-slate-700/80'}`}>
    <div className={`${data.headerBg} flex items-center justify-between gap-2 px-3 py-2.5`}><span className="min-w-0 truncate font-bold text-white"><span className="material-symbols-outlined mr-2 text-base">{data.icon}</span>{data.title}</span><span className={`${data.headerText} text-[10px] opacity-90`}>{data.stereotype}</span>{data.positionLocked && <FiLock title="Posición bloqueada" className="text-amber-200" />}{data.canManage && <button onClick={(event) => { event.stopPropagation(); data.onOpenMenu?.(event.clientX, event.clientY); }} aria-label="Acciones de clase" className="nodrag rounded-lg bg-slate-950/25 px-2 py-1 text-lg leading-none text-white hover:bg-slate-950/45">⋮</button>}</div>
    <div className="space-y-1 border-b border-slate-700/70 px-3 py-2.5 text-slate-200">{data.properties?.length ? data.properties.map((prop, index) => <div className="flex justify-between gap-5" key={`${prop.name}-${index}`}><span><b className="mr-1 text-cyan-300">{prop.visibility}</b>{prop.name}</span><span className="text-slate-400">{prop.type}</span></div>) : <span className="text-slate-500">Sin atributos</span>}</div>
    {data.methods?.length > 0 && <div className="space-y-1 px-3 py-2 text-slate-300">{data.methods.map((method, index) => <div className={data.methodColor} key={index}>{method}</div>)}</div>}
    </div>
  </div>;
}
