import * as React from 'react';

export interface IApprovalHierarchyProps {
  subtitle: string;
  steps: { name: string; status?: string; detail?: string; current?: boolean }[];
  /** true = show the status of every step (request details). */
  showStatus?: boolean;
  flush?: boolean;
  /** Shown above the flow (the selectors on the Masters page). */
  children?: React.ReactNode;
}

/** Draws an approval route as a row of boxes. */
export const ApprovalHierarchy: React.FC<IApprovalHierarchyProps> = (props) => (
  <div className={'hierarchy-panel' + (props.flush ? ' hierarchy-panel--flush' : '')}>
    {props.children}
    <div className="horizontal-flow">
      {props.steps.map((s, i) => (
        <div
          className={'flow-node' + (props.showStatus ? ' flow-node--status' : '') + (s.current ? ' flow-node--current' : '')}
          key={s.name + i}
          title={s.current ? 'Waiting for this step' : undefined}
        >
          {s.name}
          {props.showStatus && s.detail ? <span className="small">{s.detail}</span> : null}
          {props.showStatus ? <span className="small">{s.status}</span> : null}
        </div>
      ))}
    </div>
  </div>
);
