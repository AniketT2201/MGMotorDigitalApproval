import * as React from 'react';
import { RequestsTable } from '../common/RequestsTable';
import { IMgDigitalApprovalProps } from '../IMgDigitalApprovalProps';
import { RequestDetails } from '../request/RequestDetails';
import { getRequests } from '../Services/BAL/RequestBAL';
import { IRequest } from '../utils/constants';
import { filterRequests } from '../utils/helpers';
import { showError, showMessage } from '../utils/messages';

export interface IApprovalInboxProps {
  appProps: IMgDigitalApprovalProps;
  onEditRequest: (request: IRequest) => void;
}

/** Pending requests that are assigned to the logged-in user (NextApprover). */
export const ApprovalInbox: React.FC<IApprovalInboxProps> = (props) => {
  const [requests, setRequests] = React.useState<IRequest[]>([]);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [selectedKey, setSelectedKey] = React.useState<string>('');
  const [search, setSearch] = React.useState<string>('');

  const load = async (): Promise<void> => {
    setLoading(true);
    try {
      const result = await getRequests('inbox', props.appProps);
      setRequests(result.requests);
      if (result.failedLists.length > 0) {
        showMessage('Some requests could not be loaded (' + result.failedLists.join(', ') + '). Please try again. If it continues, contact the SHIFT support team.');
      }
    } catch (error) {
      showError('Could not load your approval inbox.', error);
    }
    setLoading(false);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useEffect(() => { load().catch(console.error); }, []);

  return (
    <section className="page page-inbox">
      <div className="panel">
        <h2>Approval Inbox</h2>
        <div className="notice">Requests assigned to you for approval.</div>
        <div className="toolbar">
          <input className="search" type="search" placeholder="Search pending approvals..." value={search}
            onChange={(e: React.ChangeEvent<HTMLInputElement>): void => setSearch(e.target.value)} />
        </div>
        <RequestsTable requests={filterRequests(requests, search)} loading={loading} onView={setSelectedKey} />
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
