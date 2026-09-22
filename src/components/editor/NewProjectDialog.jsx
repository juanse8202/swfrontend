import { useEffect, useRef } from 'react';
import { FiAlertCircle, FiFolderPlus, FiX } from 'react-icons/fi';
import { useEscapeClose } from '../../hooks/useEscapeClose';

export default function NewProjectDialog({ name, setName, error, onClose, onCreate }) {
  const inputRef = useRef(null);
  useEffect(() => inputRef.current?.focus(), []);
  const submit = (event) => { event.preventDefault(); onCreate(); };
  useEscapeClose(true, () => {
    if (!name.trim() || window.confirm('El nombre del nuevo proyecto no se ha guardado. ¿Deseas descartarlo?')) {
      setName('');
      onClose();
    }
  });
  return <div className="fixed inset-0 z-50 grid place-items-center bg-[#030715]/80 p-4 backdrop-blur-sm"><form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-indigo-400/40 bg-[#101a31] p-6 shadow-2xl"><div className="mb-5 flex items-start justify-between"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-600/25 text-xl text-indigo-200"><FiFolderPlus /></span><div><h2 className="text-lg font-bold text-white">Crear nuevo proyecto</h2><p className="text-sm text-slate-400">Comienza un lienzo UML/JPA vacío.</p></div></div><button type="button" onClick={onClose} className="rounded p-2 text-slate-400 hover:bg-slate-700"><FiX /></button></div><label className="block text-xs font-bold text-slate-300">Nombre del proyecto<input ref={inputRef} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej.: Sistema de Ventas" required maxLength="80" aria-invalid={Boolean(error)} className={`mt-2 w-full rounded-lg border bg-[#080f20] px-3 py-3 text-sm text-white outline-none focus:ring-1 ${error ? 'border-rose-400 focus:border-rose-400 focus:ring-rose-400/50' : 'border-slate-600 focus:border-indigo-400 focus:ring-indigo-400/50'}`} /></label>{error && <p role="alert" className="mt-2 flex items-center gap-2 rounded-lg border border-rose-400/35 bg-rose-500/10 px-3 py-2 text-xs text-rose-200"><FiAlertCircle className="shrink-0" />{error}</p>}<div className="mt-6 flex justify-end gap-3"><button type="button" onClick={onClose} className="rounded-lg border border-slate-600 px-4 py-2.5 text-sm hover:bg-slate-700">Cancelar</button><button className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-500"><FiFolderPlus /> Crear proyecto</button></div></form></div>;
}
