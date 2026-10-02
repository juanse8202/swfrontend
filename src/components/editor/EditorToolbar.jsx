import { useEffect, useState } from 'react';
import { FiActivity, FiCpu, FiLink, FiMic, FiPlus, FiStar, FiVolume2 } from 'react-icons/fi';
import { relationPlanPreview } from '../../utils/aiFlow';

const nodeTypes = [
  ['entity', '@Entity', 'Tabla relacional con PK UUID/Long', 'bg-indigo-400'],
  ['interface', '<<interface>>', 'Contrato Java para realizaci\u00f3n', 'bg-fuchsia-400'],
  ['dto', 'DTO / Record', 'Transferencia API sin ORM overhead', 'bg-violet-400'],
  ['enum', 'enum', 'Estados, roles y cat\u00e1logos', 'bg-amber-400'],
  ['embeddable', '@Embeddable', 'Componentes embebidos', 'bg-cyan-400'],
  ['class', 'Clase Java', 'Clase o clase abstracta', 'bg-slate-400'],
];
const relations = [['asociacion', 'Asociaci\u00f3n', 'l\u00ednea s\u00f3lida'], ['agregacion', 'Agregaci\u00f3n', 'rombo blanco'], ['composicion', 'Composici\u00f3n', 'rombo negro'], ['herencia', 'Herencia', 'tri\u00e1ngulo'], ['realizacion', 'Realizaci\u00f3n', 'trazo discontinuo'], ['dependencia', 'Dependencia', 'flecha discontinua']];
const agentStatus = {
  escuchando: ['Escuchando', 'bg-cyan-300 animate-ping', 'border-cyan-400/40 bg-cyan-950/70 text-cyan-200', 'Escuchando tu instrucci\u00f3n...'],
  interpretando: ['Pensando', 'bg-violet-300 animate-pulse', 'border-violet-400/40 bg-violet-950/70 text-violet-200', 'Interpretando el modelo UML...'],
  aplicando: ['Aplicando', 'bg-indigo-300 animate-pulse', 'border-indigo-400/40 bg-indigo-950/70 text-indigo-200', 'Aplicando cambios validados...'],
  confirmacion: ['Confirmar', 'bg-amber-300 animate-pulse', 'border-amber-400/40 bg-amber-950/70 text-amber-200', 'Necesito tu confirmaci\u00f3n.'],
  exito: ['Listo', 'bg-emerald-300', 'border-emerald-400/40 bg-emerald-950/70 text-emerald-200', 'Cambio aplicado correctamente.'],
  error: ['Atenci\u00f3n', 'bg-rose-300', 'border-rose-400/40 bg-rose-950/70 text-rose-200', 'Necesito que revises la instrucci\u00f3n.'],
  inactivo: ['Micrófono apagado', 'bg-slate-400', 'border-slate-400/40 bg-slate-800/70 text-slate-200', 'Diana está lista. Pulsa el micrófono para hablar.'],
};

export default function EditorToolbar({ onCreate, onRelation, onCommand, listening, onListen, command: controlledCommand, onCommandChange, aiStatus = 'inactivo', aiMessage = '', aiPlan, onConfirmAi, onCancelAi, nodes, edges, onGenerate, generating = false, readOnly = false, canUseRelations = true, onlineMembers = [] }) {
  const [localCommand, setLocalCommand] = useState('');
  const command = controlledCommand ?? localCommand;
  const setCommand = onCommandChange || setLocalCommand;
  const busy = ['interpretando', 'aplicando'].includes(aiStatus);
  const execute = () => { if (command.trim() && !busy) onCommand(command.trim()); };
  const [label, dot, badge, activity] = agentStatus[aiStatus] || agentStatus.inactivo;

  return <aside aria-disabled={readOnly} className={['flex h-full w-80 shrink-0 flex-col border-r border-[#1d2a4a] bg-[#0c152b] text-slate-200', readOnly ? 'pointer-events-none opacity-45' : ''].join(' ')}>
    <div className="border-b border-[#1d2a4a] p-3"><button onClick={() => onCreate('entity')} className="flex w-full items-center justify-center gap-2 rounded-lg border border-indigo-300/40 bg-indigo-500 px-3 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-950/60 hover:bg-indigo-400"><FiPlus /> Nueva Clase / Entidad JPA</button></div>
    <div className="flex-1 space-y-5 overflow-y-auto p-3 text-xs">
      <section><SectionTitle title="Paleta de nodos" hint={'click para a\u00f1adir'} /><div className="grid grid-cols-2 gap-2">{nodeTypes.map(([kind, labelText, copy, color]) => <button key={kind} onClick={() => onCreate(kind)} className="rounded-lg border border-slate-700 bg-[#121d39] p-2.5 text-left transition hover:border-indigo-400 hover:bg-[#18264a]"><span className="flex justify-between font-bold"><span className="flex items-center gap-1.5"><i className={['h-2.5 w-2.5 rounded-full', color].join(' ')} />{labelText}</span><small className="font-mono text-slate-400">{kind === 'entity' ? 'JPA' : 'Java'}</small></span><span className="mt-2 block leading-4 text-slate-400">{copy}</span></button>)}</div></section>
      {canUseRelations && <section><SectionTitle title="Relaciones UML" hint="Arrastra desde la parte hacia el todo." />{relations.map(([type, relationLabel, notation]) => <button key={type} onClick={() => onRelation(type)} disabled={nodes.length < 2} className="mb-2 flex w-full items-center justify-between rounded-lg border border-slate-700 bg-[#121d39] px-3 py-2.5 font-mono text-slate-300 hover:border-violet-400 disabled:opacity-40"><span className="flex items-center gap-2"><FiLink className="text-cyan-300" />{relationLabel}</span><b className="rounded bg-violet-800/70 px-2 py-0.5 text-[9px] text-violet-200">{notation}</b></button>)}</section>}
      <AgentPanel command={command} setCommand={setCommand} execute={execute} busy={busy} listening={listening} onListen={onListen} label={label} dot={dot} badge={badge} activity={activity} message={aiMessage || 'Hola, soy Diana. Dime qu\u00e9 necesitas modelar.'} aiStatus={aiStatus} aiPlan={aiPlan} onConfirmAi={onConfirmAi} onCancelAi={onCancelAi} />
      <section className="rounded-xl border border-slate-700 bg-[#101a31] p-3"><SectionTitle title="Generador Spring Boot" hint="4 capas" /><ul className="space-y-2 font-mono text-slate-400"><li>{'\u2713'} 1. Entidades <small className="float-right">@Entity</small></li><li>{'\u2713'} 2. Repositorios <small className="float-right">JpaRepository</small></li><li>{'\u2713'} 3. Servicios <small className="float-right">@Service</small></li><li>{'\u2713'} 4. Controladores <small className="float-right">@RestController</small></li></ul><button onClick={onGenerate} disabled={generating} className="mt-4 w-full rounded-lg border border-indigo-400/40 bg-indigo-600 px-3 py-2 font-bold text-white hover:bg-indigo-500 disabled:cursor-wait disabled:opacity-60">{generating ? 'Generando...' : 'Generar c\u00f3digo'}</button></section>
    </div>
    <Presence members={onlineMembers} />
    <div className="flex justify-between border-t border-[#1d2a4a] px-4 py-3 font-mono text-[11px] text-slate-500"><span>{nodes.length} Entidades {'\u2022'} {edges.length} Relaci\u00f3n{edges.length === 1 ? '' : 'es'}</span><span className="text-emerald-400">Auto-saved</span></div>
  </aside>;
}

function AgentPanel({ command, setCommand, execute, busy, listening, onListen, label, dot, badge, activity, message, aiStatus, aiPlan, onConfirmAi, onCancelAi }) {
  return <section className="relative overflow-hidden rounded-xl border border-indigo-400/45 bg-gradient-to-b from-[#131d3e] via-[#0d162d] to-[#091124] p-3 shadow-xl shadow-indigo-950/20">
    <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-cyan-500/10 blur-2xl" /><div className="pointer-events-none absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-indigo-600/15 blur-2xl" />
    <div className="relative z-10 mb-2.5 flex items-center justify-between"><div className="flex items-center gap-1.5 font-semibold text-white"><i className={['h-2 w-2 rounded-full', dot].join(' ')} /><FiCpu className="text-cyan-300" /><span>Agente IA</span><span className="rounded border border-cyan-400/30 bg-indigo-500/20 px-1 py-0.5 font-mono text-[9px] text-cyan-200">CYBER CORE</span></div><span className={['flex items-center gap-1 rounded-full border px-2 py-1 font-mono text-[9px]', badge].join(' ')}><i className={['h-1.5 w-1.5 rounded-full', dot].join(' ')} />{label}</span></div>
    <div className="relative z-10 mb-2.5 flex items-center gap-3 rounded-lg border border-indigo-400/30 bg-gradient-to-b from-[#09132b]/95 to-[#070e20] p-2.5 shadow-inner"><CyberAvatar active={listening || busy} /><div className="min-w-0 flex-1"><div className="mb-1 flex items-center gap-1 font-mono text-[9px] text-cyan-300"><FiActivity className={listening || busy ? 'animate-pulse' : ''} />{activity}</div><div className="rounded-md border border-cyan-400/30 bg-[#0b1428]/95 p-1.5 text-[10.5px] leading-tight text-indigo-100">{message}</div></div></div>
    <div className="relative z-10 mb-2"><input value={command} onChange={(event) => setCommand(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); execute(); } }} disabled={busy} placeholder="Ej. Crea Pedido con fecha y total..." className="w-full rounded-lg border border-slate-700 bg-[#091124] py-2 pl-3 pr-10 text-[11px] text-slate-200 outline-none transition placeholder:text-slate-500 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 disabled:opacity-60" /><button onClick={onListen} disabled={busy} aria-label={listening ? 'Detener reconocimiento de voz' : 'Hablar con Diana'} title={listening ? 'Detener reconocimiento de voz' : 'Hablar con Diana'} className={['absolute right-1.5 top-1.5 rounded p-1.5 text-cyan-200 transition disabled:opacity-40', listening ? 'animate-pulse bg-rose-600 text-white' : 'bg-indigo-600/60 hover:bg-cyan-600 hover:text-white'].join(' ')}><FiMic className="h-3.5 w-3.5" /></button></div>
    <div className="relative z-10 grid grid-cols-2 gap-1.5"><button onClick={() => setCommand('Sugiere atributos para la entidad seleccionada.')} className="rounded border border-slate-800 bg-[#0e172e] px-2 py-1.5 text-left text-[10px] text-slate-300 transition hover:border-indigo-500/50 hover:bg-indigo-950/80"><FiStar className="mr-1 inline text-amber-300" />Sugerir atributos</button><button onClick={() => setCommand('Valida los ciclos JPA del diagrama actual.')} className="rounded border border-slate-800 bg-[#0e172e] px-2 py-1.5 text-left text-[10px] text-slate-300 transition hover:border-indigo-500/50 hover:bg-indigo-950/80"><FiActivity className="mr-1 inline text-cyan-300" />Validar ciclos JPA</button></div>
    <VoiceControls />
    {aiStatus === 'aclaracion' && <p className="relative z-10 mt-2 text-[11px] text-amber-200">Aclara la instrucci\u00f3n en el campo y vuelve a enviarla.</p>}{aiStatus === 'confirmacion' && <><div className="relative z-10 mt-2 flex gap-2"><button onClick={onConfirmAi} className="flex-1 rounded bg-amber-600 px-2 py-2 text-xs font-bold text-white">Confirmar</button><button onClick={onCancelAi} className="rounded border border-slate-600 px-2 py-2 text-xs">Cancelar</button></div>{aiPlan?.summary && <p className="relative z-10 mt-2 text-[11px] text-amber-100">{aiPlan.summary}</p>}{Array.isArray(aiPlan?.operations) && <ul className="relative z-10 mt-2 space-y-1 rounded border border-amber-400/25 bg-amber-950/20 p-2 text-[10px] text-amber-100">{aiPlan.operations.map((operation, index) => <li key={operation.id || operation.temp_id || `${operation.op}-${index}`}>• {previewOperation(operation)}</li>)}</ul>}</>}
  </section>;
}

function previewOperation(operation) {
  if (operation?.op === 'create_node') {
    const attributes = Array.isArray(operation.properties) && operation.properties.length
      ? ` (${operation.properties.map((item) => `${item.name}: ${item.type}`).join(', ')})`
      : '';
    return `Crear ${operation.kind === 'entity' ? 'entidad' : operation.kind === 'interface' ? 'interfaz' : 'clase'} ${operation.title}${attributes}`;
  }
  if (operation?.op === 'project.create') return `Crear proyecto ${operation.payload?.name || ''}`;
  if (/relation|relacion/i.test(operation?.op || operation?.type || '')) return relationPlanPreview(operation);
  return operation?.op || 'Cambio propuesto';
}

const defaultVoiceSettings = { enabled: false, voiceURI: '', rate: 0.93, pitch: 1.05 };
function VoiceControls() {
  const [settings, setSettings] = useState(() => {
    try { return { ...defaultVoiceSettings, ...JSON.parse(window.localStorage.getItem('diagramcraft-diana-voice-preferences') || '{}') }; } catch { return defaultVoiceSettings; }
  });
  const [voices, setVoices] = useState([]);
  useEffect(() => {
    const synth = window.speechSynthesis;
    if (!synth) return undefined;
    const load = () => setVoices(synth.getVoices().filter((voice) => /^es(?:-|$)/i.test(voice.lang || '')));
    load(); synth.addEventListener?.('voiceschanged', load);
    return () => synth.removeEventListener?.('voiceschanged', load);
  }, []);
  const update = (patch) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    window.dispatchEvent(new CustomEvent('diana-voice-settings', { detail: next }));
  };
  return <details className="relative z-10 mt-2 rounded-lg border border-slate-700 bg-[#091124] p-2 text-[10px] text-slate-300"><summary className="flex cursor-pointer items-center gap-1 font-semibold text-cyan-200"><FiVolume2 /> Voz de Diana</summary><label className="mt-2 flex items-center justify-between gap-2"><span>Activar voz</span><input type="checkbox" checked={settings.enabled} onChange={(event) => update({ enabled: event.target.checked })} /></label><label className="mt-2 block"><span className="block text-slate-400">Voz española</span><select value={settings.voiceURI} onChange={(event) => update({ voiceURI: event.target.value })} className="mt-1 w-full rounded border border-slate-700 bg-[#101a31] p-1 text-xs"><option value="">Automática (mejor disponible)</option>{voices.map((voice) => <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name} · {voice.lang}</option>)}</select></label><label className="mt-2 block">Velocidad: {settings.rate.toFixed(2)}<input className="mt-1 w-full" type="range" min="0.7" max="1.15" step="0.01" value={settings.rate} onChange={(event) => update({ rate: Number(event.target.value) })} /></label><label className="mt-1 block">Tono: {settings.pitch.toFixed(2)}<input className="mt-1 w-full" type="range" min="0.8" max="1.2" step="0.01" value={settings.pitch} onChange={(event) => update({ pitch: Number(event.target.value) })} /></label><button type="button" disabled={!settings.enabled} onClick={() => window.dispatchEvent(new CustomEvent('diana-voice-preview'))} className="mt-2 w-full rounded border border-cyan-400/40 px-2 py-1 font-semibold text-cyan-100 disabled:opacity-40">Probar voz</button></details>;
}

function CyberAvatar({ active }) { return <div className="relative flex h-16 w-16 shrink-0 items-center justify-center"><div className={['absolute inset-0 rounded-full bg-gradient-to-tr from-cyan-500/20 via-indigo-500/30 to-purple-600/20', active ? 'animate-pulse' : ''].join(' ')} /><div className={['absolute -inset-1 rounded-full border border-cyan-400/30', active ? 'animate-ping' : ''].join(' ')} /><svg aria-hidden="true" viewBox="0 0 100 100" className="relative z-10 h-14 w-14 drop-shadow-[0_0_12px_rgba(6,182,212,0.6)]"><defs><linearGradient id="diana-face" x1="0" x2="100" y1="0" y2="100"><stop stopColor="#06b6d4" /><stop offset=".5" stopColor="#6366f1" /><stop offset="1" stopColor="#a855f7" /></linearGradient><radialGradient id="diana-core"><stop stopColor="#0e234c" /><stop offset=".85" stopColor="#070c1d" /><stop offset="1" stopColor="#1e1b4b" /></radialGradient></defs><circle cx="50" cy="50" r="44" fill="url(#diana-core)" stroke="url(#diana-face)" strokeWidth="2" /><circle cx="50" cy="50" r="39" fill="none" stroke="#38bdf8" strokeDasharray="2 3" strokeWidth=".75" opacity=".6" /><path d="M50 14l4 6h-8l4-6ZM30 26h12m16 0h12" stroke="#818cf8" strokeLinecap="round" strokeWidth="1.5" /><ellipse cx="36" cy="42" rx="7" ry="4.5" fill="#042f2e" stroke="#22d3ee" strokeWidth="1.2" /><ellipse cx="64" cy="42" rx="7" ry="4.5" fill="#042f2e" stroke="#22d3ee" strokeWidth="1.2" /><circle cx="36" cy="42" r="2.3" fill="#67e8f9" /><circle cx="64" cy="42" r="2.3" fill="#67e8f9" /><path d="M37 63c7 5 19 5 26 0" fill="none" stroke="#38bdf8" strokeLinecap="round" strokeWidth="2" /><circle cx="50" cy="73" r="2" fill="#a855f7" /></svg></div>; }

function Presence({ members }) { const colors = ['bg-emerald-400 shadow-[0_0_8px_#34d399]', 'bg-sky-400 shadow-[0_0_8px_#38bdf8]', 'bg-violet-400 shadow-[0_0_8px_#a78bfa]']; return <div className="border-t border-[#1d2a4a] bg-[#0b1429] p-3"><div className="rounded-2xl border border-slate-700/80 bg-[#0a1328] p-3"><div className="mb-3 flex justify-between font-mono text-[11px] font-bold uppercase tracking-wide text-slate-400"><span>Presencia en el lienzo</span><span className="text-emerald-400">{members.length} en l\u00ednea</span></div><div className="space-y-3 text-xs">{members.map((member, index) => { const user = member.usuario || member; const name = user.username || user.email || 'Usuario'; return <div className="flex items-center gap-2" key={user.id || name}><i className={['h-3 w-3 rounded-full', colors[index % colors.length]].join(' ')} /><span className="min-w-0 flex-1 truncate font-medium text-slate-200">{name} <span className="text-slate-400">({member.rol || 'Colaborador'})</span></span><span className="font-mono text-[10px] text-indigo-300">En lienzo</span></div>; })}{members.length === 0 && <p className="text-xs text-slate-500">No hay personas conectadas.</p>}</div></div></div>; }
function SectionTitle({ title, hint }) { return <div className="mb-2 flex justify-between font-mono text-[11px] font-bold uppercase tracking-wide text-slate-400"><span>{title}</span><span className="normal-case text-indigo-400">{hint}</span></div>; }
