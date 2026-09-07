import { Handle, Position } from 'reactflow';

export default function ClassNode({ data, selected }) {
  return <div className={`min-w-[250px] overflow-hidden rounded-xl border bg-[#101a35]/95 font-mono text-xs shadow-2xl ${selected ? 'border-indigo-400 ring-2 ring-indigo-500/30' : 'border-slate-700/80'}`}>
    <Handle type="target" position={Position.Left} className="!h-3 !w-3 !border-2 !border-cyan-300 !bg-[#091124]" />
    <div className={`${data.headerBg} flex items-center justify-between px-3 py-2.5`}><span className="flex items-center gap-2 font-bold text-white"><span className="material-symbols-outlined text-base">{data.icon}</span>{data.title}</span><span className={`${data.headerText} text-[10px] opacity-90`}>{data.stereotype}</span></div>
    <div className="space-y-1 border-b border-slate-700/70 px-3 py-2.5 text-slate-200">{data.properties.length ? data.properties.map((prop, index) => <div className="flex justify-between gap-5" key={`${prop.name}-${index}`}><span><b className="mr-1 text-cyan-300">{prop.visibility}</b>{prop.name}</span><span className="text-slate-400">{prop.type}</span></div>) : <span className="text-slate-500">Sin atributos</span>}</div>
    {data.methods?.length > 0 && <div className="space-y-1 px-3 py-2 text-slate-300">{data.methods.map((method, index) => <div className={data.methodColor} key={index}>{method}</div>)}</div>}
    <Handle type="source" position={Position.Right} className="!h-3 !w-3 !border-2 !border-violet-300 !bg-[#091124]" />
  </div>;
}
