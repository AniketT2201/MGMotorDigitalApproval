import * as React from 'react';
import { RequestsTable } from '../common/RequestsTable';
import { IMgDigitalApprovalProps } from '../IMgDigitalApprovalProps';
import { RequestDetails } from '../request/RequestDetails';
import { getRequests } from '../Services/BAL/RequestBAL';
import { IRequest, STATUS_OPTIONS } from '../utils/constants';
import { exportRowsToExcel } from '../utils/excelExport';
import { buildExportRows, distinct, filterRequests } from '../utils/helpers';
import { showError, showMessage } from '../utils/messages';

export interface ISearchHistoryProps {
  appProps: IMgDigitalApprovalProps;
  onEditRequest: (request: IRequest) => void;
}

/** All requests with search, Status / Department filters and Excel export. */
export const SearchHistory: React.FC<ISearchHistoryProps> = (props) => {
  const [requests, setRequests] = React.useState<IRequest[]>([]);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [selectedKey, setSelectedKey] = React.useState<string>('');
  const [search, setSearch] = React.useState<string>('');
  const [status, setStatus] = React.useState<string>('');
  const [dept, setDept] = React.useState<string>('');

  const load = async (): Promise<void> => {
    setLoading(true);
    try {
      const result = await getRequests('all', props.appProps);
      setRequests(result.requests);
      if (result.failedLists.length > 0) {
        showMessage('Some requests could not be loaded (' + result.failedLists.join(', ') + '). Please try again. If it continues, contact the SHIFT support team.');
      }
    } catch (error) {
      showError('Could not load the requests.', error);
    }
    setLoading(false);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useEffect(() => { load().catch(console.error); }, []);

  // The Department filter lists the departments found in the loaded requests.
  const departments = distinct(requests.map((r) => r.dept)).sort();
  const filtered = filterRequests(requests, search, status, dept);

  // BUTTON: Export - downloads exactly the rows that are filtered on screen
  const handleExport = (): void => {
    if (filtered.length === 0) {
      showMessage('There are no requests to export.');
      return;
    }
    try {
      exportRowsToExcel('Approval Requests', buildExportRows(filtered), 'Requests');
    } catch (error) {
      showError('Could not create the Excel file.', error);
    }
  };

  return (
    <section className="page page-search">
      <div className="panel">
        <h2>Search &amp; Historical Approval Notes</h2>
        <div className="toolbar">
          <input className="search" type="search" placeholder="Request ID, requester, type, cost center..." value={search}
            onChange={(e: React.ChangeEvent<HTMLInputElement>): void => setSearch(e.target.value)} />
          <select value={status} onChange={(e: React.ChangeEvent<HTMLSelectElement>): void => setStatus(e.target.value)}>
            <option value="">All Status</option>
            {STATUS_OPTIONS.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select value={dept} onChange={(e: React.ChangeEvent<HTMLSelectElement>): void => setDept(e.target.value)}>
            <option value="">All Departments</option>
            {departments.map((d) => <option key={d}>{d}</option>)}
          </select>
          <button className="btn secondary" onClick={handleExport}>Export</button>
        </div>
        <RequestsTable requests={filtered} loading={loading} onView={setSelectedKey} />
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
