import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BaseEdge, EdgeLabelRenderer, getBezierPath } from 'reactflow';
import useDiagramStore from '../../stores/diagramStore';

const quickValues = [
  ['1', 'Exacto'], ['0..1', 'Opcional'], ['N', 'Muchos'],
  ['0..*', '0 a muchos'], ['1..*', 'Mandatorio'], ['Custom', 'Manual'],
];

function multiplicities(data) {
  if (data?.multiplicidadOrigen || data?.multiplicidadDestino) return [data.multiplicidadOrigen || '1', data.multiplicidadDestino || 'N'];
  const [source = '1', target = 'N'] = (data?.cardinality || '1 : N').replace(/[()]/g, '').split(':').map((value) => value.trim());
  return [source, target];
}

export default function RelationEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd }) {
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const [savedSource, savedTarget] = multiplicities(data);
  const [open, setOpen] = useState(false);
  const [activeEnd, setActiveEnd] = useState('target');
  const [sourceMultiplicity, setSourceMultiplicity] = useState(savedSource);
  const [targetMultiplicity, setTargetMultiplicity] = useState(savedTarget);
  const [panelPosition, setPanelPosition] = useState(() => ({ x: Math.max(16, (window.innerWidth - 390) / 2), y: Math.max(16, (window.innerHeight - 450) / 2) }));
  const dragOffsetRef = useRef(null);
  const dragListenersRef = useRef(null);
  const selectedValue = activeEnd === 'source' ? sourceMultiplicity : targetMultiplicity;
  const setQuickValue = (value) => {
    if (value === 'Custom') return;
    if (activeEnd === 'source') setSourceMultiplicity(value); else setTargetMultiplicity(value);
  };
  const openEditorFor = (end, event) => {
    event?.stopPropagation(); setSourceMultiplicity(savedSource); setTargetMultiplicity(savedTarget); setActiveEnd(end); setOpen(true);
  };
  const apply = () => { useDiagramStore.getState().updateRelationMultiplicity(id, sourceMultiplicity || '1', targetMultiplicity || 'N'); setOpen(false); };
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
  const origenX = sourceX + (targetX - sourceX) * 0.12;
  const origenY = sourceY + (targetY - sourceY) * 0.12;
  const destinoX = sourceX + (targetX - sourceX) * 0.88;
  const destinoY = sourceY + (targetY - sourceY) * 0.88;

  return <>
    <BaseEdge path={edgePath} markerEnd={markerEnd} style={{ stroke: '#8083ff', strokeWidth: 2, strokeDasharray: '5,5' }} />
    <EdgeLabelRenderer>
      <button onClick={(event) => openEditorFor('source', event)} style={{ position: 'absolute', transform: `translate(-50%, -50%) translate(${origenX}px, ${origenY}px)`, pointerEvents: 'all' }} className="nodrag nopan rounded border border-cyan-300/50 bg-[#101a31] px-1.5 py-0.5 font-mono text-[10px] font-bold text-cyan-200 shadow hover:bg-cyan-500/20">{savedSource}</button>
      <button onClick={(event) => openEditorFor('target', event)} style={{ position: 'absolute', transform: `translate(-50%, -50%) translate(${destinoX}px, ${destinoY}px)`, pointerEvents: 'all' }} className="nodrag nopan rounded border border-violet-300/50 bg-[#101a31] px-1.5 py-0.5 font-mono text-[10px] font-bold text-violet-200 shadow hover:bg-violet-500/20">{savedTarget}</button>
      <div style={{ position: 'absolute', transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, pointerEvents: 'all' }} className="nodrag nopan">
        <button onClick={(event) => openEditorFor('target', event)} className="flex flex-col items-center rounded-full border border-surface-variant bg-surface-container-high px-3 py-1.5 font-code-mono text-[11px] font-bold text-tertiary shadow-lg hover:border-indigo-400"><span className="flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">link</span>{data?.label || '@OneToMany'}</span><span>{savedSource} : {savedTarget}</span></button>
        {open && createPortal(<section style={{ backgroundColor: '#0b1430', opacity: 1, left: panelPosition.x, top: panelPosition.y }} className="fixed z-[9999] w-[390px] overflow-hidden rounded-2xl border-2 border-indigo-400/60 p-4 text-left text-xs text-slate-200 shadow-[0_0_35px_rgba(99,102,241,0.35)]">
          <header onMouseDown={startDrag} className="flex cursor-move items-center gap-3 border-b border-slate-700/80 pb-3"><span className="h-2 w-2 rounded-full bg-indigo-300 shadow-[0_0_9px_#a5b4fc]" /><h3 className="text-sm font-extrabold leading-tight text-white">Editar<br />Multiplicidad</h3><button onMouseDown={(event) => event.stopPropagation()} onClick={() => setOpen(false)} className="ml-auto rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-white">×</button><button onMouseDown={(event) => event.stopPropagation()} onClick={() => setActiveEnd(activeEnd === 'source' ? 'target' : 'source')} className="rounded-full border border-indigo-400/40 bg-indigo-500/20 px-3 py-2 font-mono text-[10px] text-indigo-200 hover:bg-indigo-500/30">Extremo: {activeEnd === 'source' ? `Origen (${sourceMultiplicity})` : `Destino (${targetMultiplicity})`} ↔</button></header>
          <p className="mt-3 font-mono text-[10px] font-bold tracking-wide text-slate-400">VALORES RÁPIDOS DE CARDINALIDAD</p>
          <div className="mt-2 grid grid-cols-3 gap-2">{quickValues.map(([value, caption]) => <button key={value} onClick={() => setQuickValue(value)} className={`rounded-lg border px-2 py-2.5 text-center transition ${value !== 'Custom' && selectedValue === value ? 'border-indigo-300 bg-indigo-500/25 ring-2 ring-indigo-400/40' : 'border-slate-700 bg-[#101a31] hover:border-indigo-400'} ${value === 'Custom' ? 'text-amber-300' : 'text-cyan-200'}`}><b className="block font-mono text-sm">{value === 'N' ? 'N (*)' : value}</b><small className="mt-1 block text-[9px] text-slate-400">{caption}</small></button>)}</div>
          <div className="mt-3 flex gap-2"><input value={`${sourceMultiplicity} : ${targetMultiplicity}`} onChange={(event) => { const values = event.target.value.split(':').map((value) => value.trim()); if (values[0] !== undefined) setSourceMultiplicity(values[0]); if (values[1] !== undefined) setTargetMultiplicity(values[1]); }} placeholder="Exp: 1 : N" style={{ backgroundColor: '#071026', color: '#cffafe' }} className="min-w-0 flex-1 appearance-none rounded-lg border border-slate-600 px-3 py-2 font-mono text-xs shadow-inner shadow-black/40 outline-none placeholder:text-slate-500 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400/50" /><button onClick={apply} title="Guardar multiplicidad" className="grid w-10 place-items-center rounded-lg bg-indigo-600 text-lg font-bold text-white hover:bg-indigo-500">✓</button></div>
          <div className="mt-3 border-t border-slate-700/70 pt-3 text-[11px]"><div className="flex items-center justify-between py-1.5"><span className="text-slate-400">◉ CascadeType:</span><span className="rounded border border-slate-600 px-2 py-1 font-mono text-[10px] text-slate-300">CascadeType.ALL</span></div><div className="flex items-center justify-between py-1.5"><span className="text-slate-400">FetchType:</span><span className="rounded bg-cyan-500/15 px-2 py-1 font-mono text-[10px] text-cyan-300">LAZY (default)</span></div></div>
          <div className="mt-2 rounded-lg border border-indigo-400/20 bg-[#071026] p-2"><p className="mb-1 font-mono text-[9px] uppercase tracking-wide text-slate-500">Anotación JPA en tiempo real</p><code className="block break-words font-mono text-[10px] leading-4 text-emerald-400">{data?.label || '@OneToMany'}(cascade = CascadeType.ALL)</code></div>
        </section>, document.body)}
      </div>
    </EdgeLabelRenderer>
  </>;
}
