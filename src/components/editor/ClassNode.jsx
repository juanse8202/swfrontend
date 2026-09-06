import React from 'react';
import { Handle, Position } from 'reactflow';

export default function ClassNode({ data }) {
  return (
    <div className={`w-[260px] bg-surface-container/95 rounded-DEFAULT shadow-lg transform transition-all duration-300 relative group border-t-4 ${data.borderColor}`}>
      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-surface-container-lowest border-2 border-outline" />

      <div className={`${data.headerBg} px-4 py-2.5 rounded-t-DEFAULT flex items-center justify-between`}>
        <div className="flex items-center gap-1.5">
          <span className={`material-symbols-outlined ${data.headerText} text-[18px]`}>{data.icon}</span>
          <span className={`font-headline-sm text-headline-sm ${data.headerText}`}>{data.title}</span>
        </div>
        <span className={`font-code-mono text-label-sm ${data.headerText} opacity-80`}>&lt;&lt;@Entity&gt;&gt;</span>
      </div>

      <div className="p-3.5 flex flex-col gap-1 font-code-mono text-label-sm text-on-surface-variant bg-surface-container-low/60">
        {data.properties.map((prop, index) => (
          <div key={index} className="flex items-center justify-between">
            <span className="text-secondary"><span className="text-tertiary">{prop.visibility}</span> {prop.name}:</span>
            <span className="text-outline">{prop.type}</span>
          </div>
        ))}
      </div>

      <div className="p-3.5 pt-2 flex flex-col gap-1 font-code-mono text-label-sm text-on-surface border-t border-surface-variant/40 bg-surface-container/90 rounded-b-DEFAULT">
        {data.methods.map((method, index) => (
          <span key={index} className={data.methodColor}>{method}</span>
        ))}
      </div>

      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-surface-container-lowest border-2 border-outline" />
    </div>
  );
}