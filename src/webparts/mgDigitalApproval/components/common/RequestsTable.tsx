import * as React from 'react';
import { IRequest, PAGE_SIZE } from '../utils/constants';
import { formatDateTime } from '../utils/helpers';

export interface IRequestsTableProps {
  requests: IRequest[];
  loading: boolean;
  /** Called with the request key when a row is opened. */
  onView: (requestKey: string) => void;
  /** Rows per page (default 10). */
  pageSize?: number;
}

/** The request table used by Dashboard, My Requests, Approval Inbox and Search & History (10 rows per page). */
export const RequestsTable: React.FC<IRequestsTableProps> = (props) => {
  const [page, setPage] = React.useState<number>(1);

  if (props.loading) {
    return <div className="empty">Loading...</div>;
  }
  if (props.requests.length === 0) {
    return <div className="empty">No records found.</div>;
  }

  const pageSize = props.pageSize || PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(props.requests.length / pageSize));
  const currentPage = Math.min(page, totalPages); // a new search can leave fewer pages
  const rows = props.requests.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <>
      <table>
        <thead>
          <tr>
            <th>Request ID</th>
            <th>Request Type</th>
            <th>Department</th>
            <th>Requester</th>
            <th>Status</th>
            <th>Last Updated</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td>
                <a href="#" className="req-id" onClick={(e: React.MouseEvent<HTMLAnchorElement>): void => { e.preventDefault(); props.onView(r.key); }}>
                  {r.id || 'Draft'}
                </a>
              </td>
              <td>
                {r.type}
                {r.requestBudgetType ? <div className="small muted">{r.requestBudgetType}</div> : null}
                {r.subType ? <div className="small muted">{r.subType}</div> : null}
              </td>
              <td>{r.dept}</td>
              <td>{r.empName}</td>
              <td><span className={'badge ' + r.status.toLowerCase()}>{r.status}</span></td>
              <td>{formatDateTime(r.updated)}</td>
              <td><button className="btn secondary" onClick={(): void => props.onView(r.key)}>View</button></td>
            </tr>
          ))}
        </tbody>
      </table>

      {totalPages > 1 ? (
        <div className="pager">
          <button className="btn secondary" disabled={currentPage <= 1} onClick={(): void => setPage(currentPage - 1)}>‹ Previous</button>
          <span>Page {currentPage} of {totalPages} ({props.requests.length} requests)</span>
          <button className="btn secondary" disabled={currentPage >= totalPages} onClick={(): void => setPage(currentPage + 1)}>Next ›</button>
        </div>
      ) : null}
    </>
  );
};
