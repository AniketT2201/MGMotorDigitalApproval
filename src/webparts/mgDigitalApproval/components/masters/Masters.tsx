import * as React from 'react';
import { ApprovalHierarchy } from '../common/ApprovalHierarchy';
import { IMgDigitalApprovalProps } from '../IMgDigitalApprovalProps';
import { previewRoute } from '../Services/BAL/ApprovalBAL';
import { getApprovalMatrix, getApproverRoles, getDepartments, getRequestMaster } from '../Services/BAL/MasterBAL';
import { BUSINESS_AREAS, IMatrixRow, IRequestMasterRow, WF_FLEXIBLE } from '../utils/constants';
import { distinct, getRequestTypes, getSubTypes, norm } from '../utils/helpers';
import { showError } from '../utils/messages';

const MASTER_ITEMS: { key: string; label: string }[] = [
  { key: 'businessAreas', label: 'Business Areas' },
  { key: 'departments', label: 'Departments / Functions' },
  { key: 'requestTypes', label: 'Request Types' },
  { key: 'subTypes', label: 'Sub Request Types' },
  { key: 'approvalRoles', label: 'Approval Roles' }
];

export interface IMastersProps {
  appProps: IMgDigitalApprovalProps;
}

/** Read-only view of the master lists + the approval route preview (from the Approval Matrix list). */
export const Masters: React.FC<IMastersProps> = (props) => {
  const [loading, setLoading] = React.useState<boolean>(true);
  const [requestMaster, setRequestMaster] = React.useState<IRequestMasterRow[]>([]);
  const [departments, setDepartments] = React.useState<string[]>([]);
  const [matrix, setMatrix] = React.useState<IMatrixRow[]>([]);
  const [roles, setRoles] = React.useState<string[]>([]);

  const [selected, setSelected] = React.useState<string>('businessAreas');
  const [requestType, setRequestType] = React.useState<string>('');
  const [condition, setCondition] = React.useState<string>('');
  const [department, setDepartment] = React.useState<string>('');

  React.useEffect(() => {
    let active = true;
    const load = async (): Promise<void> => {
      try {
        const master = await getRequestMaster(props.appProps);
        const depts = await getDepartments(props.appProps);
        const matrixRows = await getApprovalMatrix(props.appProps);
        const roleRows = await getApproverRoles(props.appProps);
        if (active) {
          setRequestMaster(master);
          setDepartments(depts);
          setMatrix(matrixRows);
          setRoles(distinct(roleRows.map((r) => r.role)));
        }
      } catch (error) {
        showError('Could not load the master lists.', error);
      }
      if (active) {
        setLoading(false);
      }
    };
    load().catch(console.error);
    return (): void => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Route preview: only Flexible routes exist today (DOA is for the future).
  // Each drop-down only offers what exists in the Approval Matrix for the previous choice.
  const flexible = matrix.filter((m) => norm(m.wfType) === norm(WF_FLEXIBLE));
  const typeOptions = distinct(flexible.map((m) => m.requestType));
  const type = typeOptions.indexOf(requestType) > -1 ? requestType : (typeOptions[0] || '');
  const typeRows = flexible.filter((m) => m.requestType === type);
  const conditionOptions = distinct(typeRows.map((m) => m.condition));
  const cond = conditionOptions.indexOf(condition) > -1 ? condition : (conditionOptions[0] || '');
  const departmentOptions = distinct(typeRows.filter((m) => m.condition === cond).map((m) => m.department));
  const dept = departmentOptions.indexOf(department) > -1 ? department : (departmentOptions[0] || '');
  const route = type ? previewRoute(matrix, type, cond, dept) : [];

  const lists: { [key: string]: string[] } = {
    businessAreas: BUSINESS_AREAS,
    departments: departments,
    requestTypes: getRequestTypes(requestMaster),
    subTypes: distinct(getRequestTypes(requestMaster).reduce((all: string[], t) => all.concat(getSubTypes(requestMaster, t)), []))
  };
  const current = MASTER_ITEMS.filter((m) => m.key === selected)[0];

  return (
    <section className="page page-masters">
      <div className="panel">
        <h2>Masters &amp; Configuration</h2>
        {loading ? <div className="empty">Loading master lists...</div> : null}

        {!loading ? (
          <ApprovalHierarchy
            subtitle="Select a Request Type, Condition and Department to view the approval route."
            steps={route}
          >
            <div className="master-flow-controls">
              <div>
                <label>Request Type</label>
                <select value={type} onChange={(e: React.ChangeEvent<HTMLSelectElement>): void => setRequestType(e.target.value)}>
                  {typeOptions.map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label>Request Budget Type (Condition)</label>
                <select value={cond} onChange={(e: React.ChangeEvent<HTMLSelectElement>): void => setCondition(e.target.value)}>
                  {conditionOptions.map((c) => <option key={c} value={c}>{c || 'Not Applicable'}</option>)}
                </select>
              </div>
              <div>
                <label>Department</label>
                <select value={dept} onChange={(e: React.ChangeEvent<HTMLSelectElement>): void => setDepartment(e.target.value)}>
                  {departmentOptions.map((d) => <option key={d}>{d}</option>)}
                </select>
              </div>
            </div>
            {route.length === 0 ? <div className="notice">No route found for this combination.</div> : null}
          </ApprovalHierarchy>
        ) : null}

        <div className="master-layout">
          <div className="panel panel--flush">
            <h3>Masters</h3>
            <div className="master-list">
              {MASTER_ITEMS.map((m) => (
                <button key={m.key} className={'master-item' + (selected === m.key ? ' active' : '')} onClick={(): void => setSelected(m.key)}>
                  {m.label} <span className="master-chevron">›</span>
                </button>
              ))}
            </div>
          </div>

          <div className="panel panel--flush">
            {selected === 'approvalRoles' ? (
              <>
                <h3>Approval Roles</h3>
                <p className="small muted">Active roles in the Approver Role Master list.</p>
                <div className="grid2">
                  {roles.map((role) => (
                    <div className="card" key={role}>
                      <b>{role}</b>
                      <div className="small muted">Approval role</div>
                    </div>
                  ))}
                </div>
                {!loading && roles.length === 0 ? <div className="muted small">No active roles found.</div> : null}
              </>
            ) : (
              <>
                <h3>{current ? current.label : 'Master'}</h3>
                <div className="master-list">
                  {(lists[selected] || []).map((item, i) => (
                    <div className="master-item master-item--static" key={item + i}>{i + 1}. {item}</div>
                  ))}
                </div>
                {!loading && (lists[selected] || []).length === 0 ? <div className="muted small">No records found.</div> : null}
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
