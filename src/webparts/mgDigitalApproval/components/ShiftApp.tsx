/**
 * ShiftApp – only decides which page is shown. No data, no workflow logic.
 *   Screens ............ dashboard/ (lists), forms/RequestForm.tsx, request/RequestDetails.tsx, masters/
 *   Button logic ....... Services/BAL/ApprovalBAL.ts  (one function per button)
 *   Reading / saving ... Services/BAL/RequestBAL.ts, MasterBAL.ts
 *   PnPjs .............. Services/DAL/SPCRUDOPS.ts
 *   Messages ........... utils/messages.ts (message boxes + console)
 */
import * as React from 'react';
import { Sidebar, TopBar } from './layout/Sidebar';
import { ApprovalInbox } from './dashboard/ApprovalInbox';
import { Dashboard } from './dashboard/Dashboard';
import { MyRequests } from './dashboard/MyRequests';
import { SearchHistory } from './dashboard/SearchHistory';
import { RequestForm } from './forms/RequestForm';
import { Masters } from './masters/Masters';
import { IMgDigitalApprovalProps } from './IMgDigitalApprovalProps';
import { IRequest, NAV_ITEMS, PageId } from './utils/constants';

export const ShiftApp: React.FC<IMgDigitalApprovalProps> = (props) => {
  const [page, setPage] = React.useState<PageId>('dashboard');
  /** Draft / rework request opened in the form (none = new request). */
  const [editing, setEditing] = React.useState<IRequest | undefined>(undefined);

  const go = (next: PageId): void => {
    setEditing(undefined);
    setPage(next);
  };
  const edit = (request: IRequest): void => {
    setEditing(request);
    setPage('create');
  };

  const title = NAV_ITEMS.filter((n) => n.id === page)[0].label;

  return (
    <div className="shift-root">
      <div className="app">
        <Sidebar activePage={page} onNavigate={go} />
        <main className="main">
          <TopBar title={title} />
          <div className="content">
            {page === 'dashboard' && <Dashboard appProps={props} onEditRequest={edit} onNewRequest={(): void => go('create')} />}
            {page === 'requests' && <MyRequests appProps={props} onNewRequest={(): void => go('create')} onEditRequest={edit} />}
            {page === 'inbox' && <ApprovalInbox appProps={props} onEditRequest={edit} />}
            {page === 'search' && <SearchHistory appProps={props} onEditRequest={edit} />}
            {page === 'create' && (
              <RequestForm
                key={editing ? editing.key : 'new'}
                appProps={props}
                request={editing}
                onDone={(): void => go('requests')}
                onCancel={(): void => go(editing ? 'requests' : 'dashboard')}
              />
            )}
            {page === 'masters' && <Masters appProps={props} />}
          </div>
        </main>
      </div>
    </div>
  );
};
