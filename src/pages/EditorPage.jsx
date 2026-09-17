import DiagramCanvas from '../components/editor/DiagramCanvas';

export default function EditorPage({ onLogout }) {
  return <DiagramCanvas onLogout={onLogout} />;
}
