import { useEffect } from 'react';
import { FiPlus, FiTrash2, FiX } from 'react-icons/fi';
import { useEscapeClose } from '../../hooks/useEscapeClose';
import useDiagramStore from '../../stores/diagramStore';

const typeLabels = { entity: 'Entidad', class: 'Clase Java', interface: 'Interfaz', dto: 'DTO / Record', enum: 'Enum', embeddable: 'Embeddable' };

export default function PropertiesPanel({ node, position, onClose, onUpdate, onAddAttribute, onUpdateAttribute, onRemoveAttribute, onAddMethod, onUpdateMethod, onRemoveMethod, onDelete }) {
  useEscapeClose(Boolean(node), onClose);
  const nodes = useDiagramStore((state) => state.nodes);
  useEffect(() => {
    if (!node) return undefined;
    const closeOnEnter = (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', closeOnEnter);
    return () => window.removeEventListener('keydown', closeOnEnter);
  }, [node, onClose]);
  if (!node) return null;
  const kind = node.data.kind || 'entity';
  const isEntity = kind === 'entity';
  const hasAttributes = ['entity', 'class', 'dto', 'embeddable'].includes(kind);
  const hasMethods = ['entity', 'class', 'interface'].includes(kind);
  const title = String(node.data.title || '').replace(/\.java$/, '');
  const embeddables = nodes.filter((item) => item.id !== node.id && item.data?.kind === 'embeddable');
  const style = position ? { left: Math.min(Math.max(12, position.x), window.innerWidth - 340), top: Math.min(Math.max(12, position.y), window.innerHeight - 520) } : undefined;
  const properties = node.data.properties || [];
  const literals = node.data.literals || [];
  const setLiteral = (index, value) => onUpdate({ literals: literals.map((literal, itemIndex) => itemIndex === index ? value : literal) });
  return <aside style={style} aria-label="Editar nodo UML" className={`fixed z-30 w-80 rounded-xl border border-slate-700 bg-[#101a31] p-4 text-xs text-slate-200 shadow-2xl ${position ? '' : 'right-4 top-4'}`}>
    <div className="mb-4 flex items-center justify-between"><b className="text-sm">Editar {typeLabels[kind] || 'nodo'}</b><button onClick={onClose} className="rounded p-1 hover:bg-slate-700"><FiX /></button></div>
    <label className="mb-1 block text-slate-400">Nombre</label><input value={title} onChange={(event) => onUpdate({ title: `${event.target.value}.java` })} title="Presiona Enter para cerrar" className="mb-3 w-full rounded border border-slate-600 bg-[#080f20] px-3 py-2 outline-none focus:border-indigo-400" />
    <label className="mb-3 block text-slate-400">Tipo<select value={kind} onChange={(event) => onUpdate({ kind: event.target.value })} className="mt-1 w-full rounded border border-slate-600 bg-[#080f20] px-3 py-2"><option value="entity">@Entity</option><option value="class">Clase Java</option><option value="interface">&lt;&lt;interface&gt;&gt;</option><option value="dto">DTO / Record</option><option value="enum">enum</option><option value="embeddable">@Embeddable</option></select></label>
    {kind === 'class' && <label className="mb-4 flex items-center gap-2 text-slate-300"><input type="checkbox" checked={Boolean(node.data.abstract)} onChange={(event) => onUpdate({ abstract: event.target.checked })} />Clase abstracta</label>}
    {kind === 'interface' && <p className="mb-4 rounded border border-fuchsia-400/30 bg-fuchsia-400/10 p-2 text-fuchsia-100">Las interfaces solo pueden declarar métodos.</p>}
    {isEntity && <label className="mb-4 flex items-center gap-2 text-slate-300"><input type="checkbox" checked={node.data.persistent !== false} onChange={(event) => onUpdate({ persistent: event.target.checked })} />Persistente (@Entity)</label>}
    {hasAttributes && <><div className="mb-2 flex items-center justify-between"><b>{kind === 'dto' ? 'Campos' : 'Atributos'}</b><button onClick={onAddAttribute} className="flex items-center gap-1 rounded bg-indigo-600 px-2 py-1 hover:bg-indigo-500"><FiPlus /> Añadir</button></div><div className="max-h-60 space-y-2 overflow-auto">{properties.map((attr, index) => <div key={index} className="rounded border border-slate-800 p-1.5"><div className="flex gap-1"><input aria-label="Nombre" value={attr.name || ''} onChange={(event) => onUpdateAttribute(index, { name: event.target.value })} className="min-w-0 flex-1 rounded border border-slate-700 bg-[#080f20] px-2 py-1.5" /><input aria-label="Tipo" value={attr.type || ''} onChange={(event) => onUpdateAttribute(index, { type: event.target.value, embedded: false })} className="w-24 rounded border border-slate-700 bg-[#080f20] px-2 py-1.5" /><button onClick={() => onRemoveAttribute(index)} className="rounded px-1 text-rose-300 hover:bg-rose-500/20"><FiTrash2 /></button></div>{isEntity && <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-slate-400"><label className="flex items-center gap-1"><input type="checkbox" checked={Boolean(attr.id) || /\(@Id\)/.test(attr.type || '')} onChange={(event) => onUpdateAttribute(index, { id: event.target.checked })} />@Id</label>{embeddables.length > 0 && <select value="" onChange={(event) => { const embedded = embeddables.find((item) => item.id === event.target.value); if (embedded) onUpdateAttribute(index, { type: String(embedded.data.title || '').replace(/\.java$/, ''), embedded: true }); }} className="max-w-[170px] rounded border border-cyan-700 bg-[#080f20] px-1 py-0.5 text-cyan-200"><option value="">{attr.embedded ? '@Embedded' : 'Usar embeddable…'}</option>{embeddables.map((item) => <option value={item.id} key={item.id}>{String(item.data.title || '').replace(/\.java$/, '')}</option>)}</select>}{attr.embedded && <span className="text-cyan-300">@Embedded</span>}</div>}</div>)}</div></>}
    {kind === 'enum' && <><div className="mb-2 flex items-center justify-between"><b>Literales</b><button onClick={() => onUpdate({ literals: [...literals, 'NUEVO_VALOR'] })} className="flex items-center gap-1 rounded bg-indigo-600 px-2 py-1 hover:bg-indigo-500"><FiPlus /> Añadir</button></div><div className="space-y-2">{literals.map((literal, index) => <div key={index} className="flex gap-1"><input value={literal} onChange={(event) => setLiteral(index, event.target.value)} className="min-w-0 flex-1 rounded border border-slate-700 bg-[#080f20] px-2 py-1.5" /><button onClick={() => onUpdate({ literals: literals.filter((_, itemIndex) => itemIndex !== index) })} className="rounded px-1 text-rose-300 hover:bg-rose-500/20"><FiTrash2 /></button></div>)}{literals.length === 0 && <p className="text-slate-500">Sin literales definidos.</p>}</div></>}
    {hasMethods && <><div className="mb-2 mt-4 flex items-center justify-between"><b>Métodos</b><button onClick={onAddMethod} className="flex items-center gap-1 rounded bg-indigo-600 px-2 py-1 hover:bg-indigo-500"><FiPlus /> Añadir</button></div><div className="max-h-36 space-y-2 overflow-auto">{(node.data.methods || []).map((method, index) => <div key={index} className="flex gap-1"><input aria-label="Método" value={method} onChange={(event) => onUpdateMethod(index, event.target.value)} className="min-w-0 flex-1 rounded border border-slate-700 bg-[#080f20] px-2 py-1.5" /><button onClick={() => onRemoveMethod(index)} className="rounded px-1 text-rose-300 hover:bg-rose-500/20"><FiTrash2 /></button></div>)}</div></>}
    <button onClick={onDelete} className="mt-5 flex w-full items-center justify-center gap-2 rounded border border-rose-500/50 px-3 py-2 text-rose-300 hover:bg-rose-500/15"><FiTrash2 /> Eliminar nodo</button>
  </aside>;
}
