import { useMemo, useState } from 'react';
import { FiCheck, FiCopy, FiEye, FiLink, FiSend, FiTrash2, FiUsers, FiX } from 'react-icons/fi';

const roles = [
  { value: 'editor', label: 'Editor de Diagrama' },
  { value: 'arquitecto', label: 'Arquitecto' },
  { value: 'lector', label: 'Solo lectura' },
];

export default function CollaboratorsDialog({ project, email, setEmail, onClose, onInvite, onChangeRole, onRemove, currentUserId, canInvite, canManage }) {
  const [role, setRole] = useState('editor');
  const [copied, setCopied] = useState(false);
  const roomLink = useMemo(() => `${window.location.origin}/proyecto/${project?.id || 'nuevo'}/live-canvas`, [project?.id]);
  const submit = (event) => { event.preventDefault(); onInvite(role); };
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(roomLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { setCopied(false); }
  };

  return <div className="fixed inset-0 z-40 grid place-items-center bg-[#020617]/75 p-4 backdrop-blur-sm">
    <section className="w-full max-w-3xl overflow-hidden rounded-2xl border border-indigo-400/35 bg-[#0a1430] text-slate-200 shadow-2xl shadow-black/50">
      <header className="flex items-center gap-3 border-b border-slate-700/80 px-5 py-4">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-lg text-white"><FiUsers /></span>
        <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h2 className="font-bold text-white">Colaboradores del Lienzo (Tiempo Real)</h2><span className="rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300">● Sync Activo</span></div><p className="mt-0.5 text-xs text-slate-400">Invita a tu equipo de ingeniería para modelar diagramas simultáneamente.</p></div>
        <button onClick={onClose} aria-label="Cerrar" className="rounded-lg p-2 text-slate-400 hover:bg-slate-700 hover:text-white"><FiX /></button>
      </header>

      <div className="space-y-4 p-5">
        <form onSubmit={submit} className="grid gap-3 rounded-xl border border-indigo-400/25 bg-[#0d1937] p-3 md:grid-cols-[minmax(0,1fr)_180px_auto]">
          <label className="block min-w-0"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Invitar por correo electrónico o nombre de usuario</span><input disabled={!canInvite} value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="ej. kelly.dev@empresa.com o usuario" className="w-full rounded-lg border border-slate-600 bg-[#071025] px-3 py-2.5 text-sm outline-none placeholder:text-slate-500 focus:border-indigo-400 disabled:opacity-45" /></label>
          <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Permisos granulares JPA</span><select disabled={!canInvite} value={role} onChange={(event) => setRole(event.target.value)} className="w-full rounded-lg border border-slate-600 bg-[#071025] px-3 py-2.5 text-sm outline-none focus:border-indigo-400 disabled:opacity-45">{roles.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <button disabled={!canInvite} className="mt-auto flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2.5 text-sm font-bold text-white hover:from-indigo-500 hover:to-violet-500 disabled:opacity-45"><FiSend /> Enviar invitación</button>
        </form>

        <div className="flex flex-col gap-3 rounded-xl border border-slate-700 bg-[#0d1937] p-3 md:flex-row md:items-end"><div className="min-w-0 flex-1"><div className="mb-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-slate-400"><FiLink className="text-cyan-300" /> Enlace de sesión en vivo (WebSocket room)<span className="ml-auto normal-case text-slate-500">Acceso: cualquiera con enlace puede editar</span></div><div className="truncate rounded-lg border border-slate-600 bg-[#071025] px-3 py-2 font-mono text-xs text-slate-300">{roomLink}</div></div><button type="button" onClick={copyLink} className="flex items-center justify-center gap-2 rounded-lg border border-slate-600 bg-[#172544] px-4 py-2.5 text-sm font-bold hover:border-indigo-400 hover:bg-indigo-500/20">{copied ? <FiCheck className="text-emerald-300" /> : <FiCopy />} {copied ? 'Copiado' : 'Copiar enlace'}</button></div>

        <section><div className="mb-2 flex items-center justify-between"><h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Miembros del proyecto ({project?.miembros?.length || 0})</h3><span className="font-mono text-[10px] text-indigo-300">control de concurrencia</span></div><div className="space-y-2">
          {(project?.miembros || []).map((member) => <Member key={member.id} member={member} isCurrent={String(member.usuario?.id) === String(currentUserId)} onChangeRole={onChangeRole} onRemove={onRemove} canManage={canManage} />)}
          {!project?.miembros?.length && <p className="rounded-xl border border-slate-700 bg-[#0c1731] p-4 text-center text-xs text-slate-400">Aún no hay miembros registrados para este proyecto.</p>}
        </div></section>
      </div>
      <footer className="flex items-center justify-between border-t border-slate-700/80 px-5 py-3 text-[11px] text-slate-400"><span><i className="mr-2 text-amber-300">♦</i>Sincronización CRDT multi-usuario activa con bloqueo atómico por nodo</span><button onClick={onClose} className="rounded-lg bg-slate-700 px-3 py-1.5 font-bold text-slate-200 hover:bg-slate-600">Entendido</button></footer>
    </section>
  </div>;
}

function Member({ member, isCurrent, onChangeRole, onRemove, canManage }) {
  const user = member.usuario || {};
  const name = user.username || user.email || 'Usuario';
  const initials = name.slice(0, 2).toUpperCase();
  return <article className="flex items-center gap-3 rounded-xl border border-slate-700/80 bg-[#0c1731] px-3 py-2.5"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-indigo-600 text-[10px] font-bold text-white">{initials}</span><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><b className="truncate text-sm text-white">{name}</b>{isCurrent && <span className="text-[10px] text-sky-300">Tú</span>}</div><p className="mt-0.5 truncate text-[10px] text-slate-400">{user.email || 'Miembro del proyecto'}</p></div><button className="hidden rounded border border-slate-600 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-700 sm:flex sm:items-center sm:gap-1"><FiEye /> Seguir</button>{canManage && <select value={member.rol} onChange={(event) => onChangeRole(member, event.target.value)} className="rounded border border-slate-600 bg-[#071025] px-2 py-1 text-[10px] text-slate-200"><option value="arquitecto">Arquitecto</option><option value="editor">Editor</option><option value="lector">Solo lectura</option></select>}{canManage && !isCurrent && <button onClick={() => onRemove(member)} title="Eliminar colaborador" className="rounded p-2 text-rose-300 hover:bg-rose-500/15"><FiTrash2 /></button>}</article>;
}
