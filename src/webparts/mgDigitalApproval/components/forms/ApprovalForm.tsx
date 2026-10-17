import * as React from 'react';
import { IMgDigitalApprovalProps } from '../IMgDigitalApprovalProps';
import { approveRequest, rejectRequest, sendBackRequest } from '../Services/BAL/ApprovalBAL';
import { IRequest } from '../utils/constants';
import { showError, showMessage } from '../utils/messages';

export interface IApprovalFormProps {
  request: IRequest;
  appProps: IMgDigitalApprovalProps;
  /** Called after an action worked (the details close and the list reloads). */
  onDone: () => void;
}

/** The "Action" box of the request details: a comment + Approve / Send for Rework / Reject. */
export const ApprovalForm: React.FC<IApprovalFormProps> = (props) => {
  const [comment, setComment] = React.useState<string>('');
  const [busy, setBusy] = React.useState<boolean>(false);

  // BUTTON: Approve
  const onApproveClick = async (): Promise<void> => {
    if (busy) {
      return; // a second click while saving does nothing
    }
    setBusy(true);
    try {
      showMessage(await approveRequest(props.request, comment, props.appProps));
      props.onDone();
    } catch (error) {
      showError('Could not approve the request.', error);
      setBusy(false);
    }
  };

  // BUTTON: Send for Rework
  const onSendBackClick = async (): Promise<void> => {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      showMessage(await sendBackRequest(props.request, comment, props.appProps));
      props.onDone();
    } catch (error) {
      showError('Could not send the request for rework.', error);
      setBusy(false);
    }
  };

  // BUTTON: Reject
  const onRejectClick = async (): Promise<void> => {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      showMessage(await rejectRequest(props.request, comment, props.appProps));
      props.onDone();
    } catch (error) {
      showError('Could not reject the request.', error);
      setBusy(false);
    }
  };

  return (
    <div className="panel">
      <h3>Action</h3>
      <div className="grid2">
        <textarea
          placeholder="Comment / reason (required to reject or send for rework)..."
          value={comment}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>): void => setComment(e.target.value)}
        />
        <div>
          <button className="btn green" disabled={busy} onClick={(): void => { onApproveClick().catch(console.error); }}>Approve</button>{' '}
          <button className="btn orange" disabled={busy} onClick={(): void => { onSendBackClick().catch(console.error); }}>Send for Rework</button>{' '}
          <button className="btn red" disabled={busy} onClick={(): void => { onRejectClick().catch(console.error); }}>Reject</button>
        </div>
      </div>
    </div>
  );
};
