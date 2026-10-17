import * as React from 'react';
import { RequestsTable } from '../common/RequestsTable';
import { IMgDigitalApprovalProps } from '../IMgDigitalApprovalProps';
import { RequestDetails } from '../request/RequestDetails';
import { getRequests } from '../Services/BAL/RequestBAL';
import { IRequest, STATUS_OPTIONS } from '../utils/constants';
import { filterRequests, getDashboardCards } from '../utils/helpers';
import { showError, showMessage } from '../utils/messages';

export interface IDashboardProps {
  appProps: IMgDigitalApprovalProps;
  /** Open a draft / rework request in the form. */
  onEditRequest: (request: IRequest) => void;
  /** Open an empty form. */
  onNewRequest: () => void;
}

/** Four number cards + the 8 most recent requests. */
export const Dashboard: React.FC<IDashboardProps> = (props) => {
  const [requests, setRequests] = React.useState<IRequest[]>([]);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [selectedKey, setSelectedKey] = React.useState<string>('');
  const [search, setSearch] = React.useState<string>('');
  const [status, setStatus] = React.useState<string>('');

  const load = async (): Promise<void> => {
    setLoading(true);
    try {
      const result = await getRequests('all', props.appProps);
      setRequests(result.requests);
      if (result.failedLists.length > 0) {
        showMessage('Some requests could not be loaded (' + result.failedLists.join(', ') + '). Please try again. If it continues, contact the SHIFT support team.');
      }
    } catch (error) {
      showError('Could not load the dashboard.', error);
    }
    setLoading(false);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useEffect(() => { load().catch(console.error); }, []);

  const recent = filterRequests(requests, search, status).slice(0, 8);

  return (
    <section className="page page-dashboard">
      <div className="cards">
        {getDashboardCards(requests).map((c) => (
          <div className="card" key={c.label}>
            <div className="label">{c.label}</div>
            <div className={'num ' + c.tone}>{c.value}</div>
          </div>
        ))}
      </div>
      <div className="panel">
        <h2>Recent Approval Notes</h2>
        <div className="toolbar">
          <button className="btn" onClick={props.onNewRequest}>＋ New Request</button>
          <input className="search" type="search" placeholder="Search request ID, type, department..." value={search}
            onChange={(e: React.ChangeEvent<HTMLInputElement>): void => setSearch(e.target.value)} />
          <select value={status} onChange={(e: React.ChangeEvent<HTMLSelectElement>): void => setStatus(e.target.value)}>
            <option value="">All Status</option>
            {STATUS_OPTIONS.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <RequestsTable requests={recent} loading={loading} onView={setSelectedKey} pageSize={8} />
      </div>
      <RequestDetails
        request={requests.filter((r) => r.key === selectedKey)[0]}
        appProps={props.appProps}
        onClose={(): void => setSelectedKey('')}
        onChanged={(): void => { load().catch(console.error); }}
        onEdit={props.onEditRequest}
      />
    </section>
  );
};
