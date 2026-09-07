import { FiEye, FiUsers, FiX } from 'react-icons/fi';

const people = [
  { initials: 'KR', name: 'Kelly R.', role: 'Lead Architect', state: 'Editando Proyecto.java', color: 'bg-indigo-600' },
  { initials: 'IM', name: 'Ing. Marcos', role: 'Backend Developer', state: 'Inspeccionando lienzo general', color: 'bg-emerald-600' },
  { initials: 'TÚ', name: 'Tú', role: 'Propietario', state: 'Editando ahora', color: 'bg-sky-500' },
];

export default function PeopleDialog({ onClose }) {
  return <div className="fixed inset-0 z-40 grid place-items-center bg-[#030715]/80 p-4 backdrop-blur-sm"><section className="w-full max-w-lg rounded-2xl border border-indigo-400/35 bg-[#101a31] p-6 shadow-2xl"><div className="mb-5 flex items-center justify-between"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-600/30 text-indigo-200"><FiUsers /></span><div><h2 className="font-bold text-white">Personas en línea</h2><p className="text-xs text-emerald-300">● 3 colaboradores conectados</p></div></div><button onClick={onClose} className="rounded p-2 text-slate-400 hover:bg-slate-700"><FiX /></button></div>{people.map((person) => <div className="mb-3 flex items-center gap-3 rounded-xl border border-slate-700 bg-[#0c162c] p-3" key={person.name}><span className={`grid h-10 w-10 place-items-center rounded-full ${person.color} text-xs font-bold text-white`}>{person.initials}</span><div className="flex-1"><b className="text-sm text-white">{person.name}</b><span className="ml-2 text-xs text-slate-400">{person.role}</span><small className="mt-1 block text-emerald-300">● {person.state}</small></div><button className="rounded border border-slate-600 p-2 text-slate-300 hover:bg-slate-700" title="Seguir"><FiEye /></button></div>)}</section></div>;
}
