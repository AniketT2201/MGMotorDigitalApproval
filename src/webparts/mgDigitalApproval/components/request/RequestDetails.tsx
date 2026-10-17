import * as React from 'react';
import { ApprovalHierarchy } from '../common/ApprovalHierarchy';
import { AttachmentUpload, FilePreview } from '../common/AttachmentUpload';
import { ApprovalForm } from '../forms/ApprovalForm';
import { IMgDigitalApprovalProps } from '../IMgDigitalApprovalProps';
import { addComment, canApproveRequest, canEditRequest, canUploadFinanceFile, saveFinanceFile } from '../Services/BAL/ApprovalBAL';
import { getHistory } from '../Services/BAL/RequestBAL';
import { IHistoryEvent, IRequest } from '../utils/constants';
import { formatCrore, formatDateTime, readFilePreview } from '../utils/helpers';
import { showError, showMessage } from '../utils/messages';

export interface IRequestDetailsProps {
  /** undefined = the window is closed. */
  request?: IRequest;
  appProps: IMgDigitalApprovalProps;
  onClose: () => void;
  /** Called after something changed (approve, rework, reject, finance file) so the list reloads. */
  onChanged: () => void;
  /** Open the request in the form (Edit Draft / Edit & Resubmit). */
  onEdit: (request: IRequest) => void;
}

/** The request window: route, all fields, files, action buttons, comments, approval history, audit trail. */
export const RequestDetails: React.FC<IRequestDetailsProps> = (props) => {
  const r = props.request;
  const requestKey = r ? r.key : '';
  const requestStamp = r ? r.updated : '';

  const [showFinanceFile, setShowFinanceFile] = React.useState<boolean>(false);
  const [financeFile, setFinanceFile] = React.useState<File | null>(null);
  const [financePreview, setFinancePreview] = React.useState<string>('');
  const [uploadKey, setUploadKey] = React.useState<number>(0);
  const [saving, setSaving] = React.useState<boolean>(false);

  const [history, setHistory] = React.useState<IHistoryEvent[]>([]);
  const [historyLoading, setHistoryLoading] = React.useState<boolean>(false);
  const [commentText, setCommentText] = React.useState<string>('');
  const [commenting, setCommenting] = React.useState<boolean>(false);
  const [reloadCount, setReloadCount] = React.useState<number>(0);

  // A different request opens: start clean
  React.useEffect(() => {
    setShowFinanceFile(false);
    setFinanceFile(null);
    setUploadKey((k) => k + 1);
    setCommentText('');
  }, [requestKey]);

  // Load the history of THIS request (list name + item id)
  React.useEffect(() => {
    let active = true;
    if (!r) {
      return undefined;
    }
    const load = async (): Promise<void> => {
      setHistoryLoading(true);
      try {
        const events = await getHistory(r.listName, r.itemId, props.appProps);
        if (active) {
          setHistory(events);
        }
      } catch (error) {
        if (active) {
          setHistory([]);
          showError('Could not load the history of this request.', error);
        }
      }
      if (active) {
        setHistoryLoading(false);
      }
    };
    load().catch(console.error);
    return (): void => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, requestStamp, reloadCount]);

  // Preview of a Finance Controller file that is chosen but not saved yet
  React.useEffect(() => {
    let active = true;
    readFilePreview(financeFile).then((p) => { if (active) { setFinancePreview(p); } }).catch(console.error);
    return (): void => { active = false; };
  }, [financeFile]);

  if (!r) {
    return null;
  }
  const request: IRequest = r;

  /* ---------------- buttons ---------------- */

  // BUTTON: Save Finance Core File
  const onSaveFinanceFileClick = async (): Promise<void> => {
    if (saving) {
      return;
    }
    setSaving(true);
    try {
      showMessage(await saveFinanceFile(request, financeFile, props.appProps));
      setFinanceFile(null);
      setUploadKey((k) => k + 1);
      setShowFinanceFile(true);
      props.onChanged();
    } catch (error) {
      showError('Could not save the Finance Controller file.', error);
    }
    setSaving(false);
  };

  // BUTTON: Add Comment
  const onAddCommentClick = async (): Promise<void> => {
    if (commenting) {
      return;
    }
    setCommenting(true);
    try {
      showMessage(await addComment(request, commentText, props.appProps));
      setCommentText('');
      setReloadCount((c) => c + 1); // loads the history again
    } catch (error) {
      showError('Could not add the comment.', error);
    }
    setCommenting(false);
  };

  /* ---------------- screen ---------------- */

  const savedFinanceFile = request.financeControllerCoreFile;
  const financeName = financeFile ? financeFile.name : (savedFinanceFile ? savedFinanceFile.name : '');
  const financeUrl = financeFile ? financePreview : (savedFinanceFile ? savedFinanceFile.url : '');

  const approvals = history.filter((h) => h.actionType === 'Approval');
  const comments = history.filter((h) => h.actionType === 'Comment' || (h.actionType === 'Approval' && !!h.comment));
  const audits = history.filter((h) => h.actionType === 'Audit');

  return (
    <div className="modal show">
      <div className="modalbox" role="dialog" aria-modal="true">
        <div className="modalhead">
          <h2>{request.id || 'Draft'} – {request.type}</h2>
          {canEditRequest(request, props.appProps) ? (
            <button className="btn" onClick={(): void => props.onEdit(request)}>
              {request.status === 'Draft' ? 'Edit Draft' : 'Edit & Resubmit'}
            </button>
          ) : null}
          <button className="close" aria-label="Close" onClick={props.onClose}>✕</button>
        </div>

        <div className="modal-body">
          {/* Approval route saved on this request */}
          {request.route.length > 0 ? (
            <ApprovalHierarchy
              flush
              showStatus
              subtitle="Approval route saved on this request."
              steps={request.route.map((step, i) => ({
                name: step.name,
                status: step.status,
                detail: step.user ? step.user.name : '',
                current: request.status === 'Pending' && i === request.stage
              }))}
            />
          ) : (
            <div className="notice">The approval route is saved when the request is submitted.</div>
          )}

          <div className="grid2 details-grid">
            <div>
              <p><b>Requester:</b> {request.empName} ({request.empId})</p>
              <p><b>Department:</b> {request.dept}</p>
              <p><b>Cost Center:</b> {request.costCenter}</p>
              <p><b>Business Area:</b> {request.businessArea}</p>
              {request.subType ? <p><b>Sub Request Type:</b> {request.subType}</p> : null}
              <p><b>Request Budget Type:</b> {request.requestBudgetType || 'Not Applicable'}</p>
              <p><b>Budget Availability:</b> {request.budget}</p>
              <p><b>Financial Impact:</b> {formatCrore(request.financial)}</p>
            </div>
            <div>
              <p><b>Impact vs Budget/FCT:</b> {formatCrore(request.impact || 0)}</p>
              <p><b>Segment:</b> {request.segment}</p>
              <p><b>Budget Head:</b> {request.budgetHead}</p>
              <p><b>Status:</b> <span className={'badge ' + request.status.toLowerCase()}>{request.status}</span></p>
              {request.status === 'Pending' && request.nextApprover ? <p><b>Waiting for:</b> {request.nextApprover.name}</p> : null}
              <p><b>Created:</b> {formatDateTime(request.created)}</p>
            </div>

            <div className="full">
              <p><b>Background</b></p>
              <div className="notice">{request.background}</div>
              <p><b>Requirement / Proposal</b></p>
              <div className="notice">{request.proposal}</div>
            </div>

            {/* Core files */}
            <div className="full">
              <h3>Core File Attachments</h3>
              <div className="core-toggle">
                <button className={'toggle-btn' + (!showFinanceFile ? ' active' : '')} onClick={(): void => setShowFinanceFile(false)}>
                  Initiator Core File
                </button>
                <button className={'toggle-btn' + (showFinanceFile ? ' active' : '')} onClick={(): void => setShowFinanceFile(true)}>
                  Finance Controller Core File
                </button>
              </div>
              <div className="filebox">
                {!showFinanceFile ? (
                  <FilePreview
                    name={request.initiatorCoreFile ? request.initiatorCoreFile.name : ''}
                    label="Initiator core file"
                    preview={request.initiatorCoreFile ? request.initiatorCoreFile.url : ''}
                  />
                ) : (
                  <FilePreview name={financeName} label="Finance Controller core file" preview={financeUrl} />
                )}
              </div>
            </div>

            {/* Supporting files */}
            <div className="full">
              <h3>Supporting Files</h3>
              <div className="filebox">
                {request.supportingFiles.length > 0 ? (
                  request.supportingFiles.map((f) => (
                    <a className="file-chip" key={f.fileName} href={f.url} target="_blank" rel="noreferrer">📎 {f.name}</a>
                  ))
                ) : (
                  <span className="muted small">No supporting files attached.</span>
                )}
              </div>
            </div>
          </div>

          {/* Finance Controller file upload */}
          {canUploadFinanceFile(request, props.appProps) ? (
            <div className="panel">
              <h3>Finance Controller – Core File</h3>
              <AttachmentUpload
                key={uploadKey}
                hint={savedFinanceFile ? 'Current: ' + savedFinanceFile.name : 'Attach a separate core file prepared by the Finance Controller.'}
                describeSelection={(files): string => 'Selected: ' + files[0].name + ' – press Save to keep it.'}
                onChange={(files): void => { setFinanceFile(files.length ? files[0] : null); if (files.length) { setShowFinanceFile(true); } }}
              />
              <button className="btn secondary save-finance" disabled={saving} onClick={(): void => { onSaveFinanceFileClick().catch(console.error); }}>
                Save Finance Core File
              </button>
            </div>
          ) : null}

          {/* Approve / Rework / Reject: only for the person the request is assigned to */}
          {canApproveRequest(request, props.appProps) ? (
            <ApprovalForm
              request={request}
              appProps={props.appProps}
              onDone={(): void => { props.onClose(); props.onChanged(); }}
            />
          ) : null}

          {/* Comments / queries */}
          <div className="panel">
            <h3>Comments / Queries</h3>
            {historyLoading ? <div className="empty">Loading...</div> : comments.length > 0 ? (
              <div className="timeline">
                {comments.map((c) => (
                  <div className="event" key={c.id}>
                    <strong>{c.actionTakenBy}</strong> — {c.comment}
                    <div className="meta">{formatDateTime(c.at)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="muted small">No comments yet.</div>
            )}
            <div className="grid2">
              <textarea
                placeholder="Add a comment or query..."
                value={commentText}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>): void => setCommentText(e.target.value)}
              />
              <div>
                <button className="btn secondary" disabled={commenting} onClick={(): void => { onAddCommentClick().catch(console.error); }}>
                  Add Comment
                </button>
              </div>
            </div>
          </div>

          {/* Approval history */}
          <div className="panel">
            <h3>Approval History</h3>
            {historyLoading ? <div className="empty">Loading...</div> : approvals.length > 0 ? (
              <div className="timeline">
                {approvals.map((a) => (
                  <div className="event" key={a.id}>
                    <strong>{a.action}</strong>
                    <div>{a.title}</div>
                    {a.comment ? <div>“{a.comment}”</div> : null}
                    <div className="meta">{a.actionTakenBy} · {formatDateTime(a.at)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="muted small">No approval activity yet.</div>
            )}
          </div>

          {/* Audit trail */}
          <div className="panel">
            <h3>Audit Trail</h3>
            {historyLoading ? <div className="empty">Loading...</div> : audits.length > 0 ? (
              <div className="timeline">
                {audits.map((a) => (
                  <div className="event" key={a.id}>
                    <strong>{a.action}</strong>
                    <div>{a.title}</div>
                    <div className="meta">{a.actionTakenBy} · {formatDateTime(a.at)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="muted small">No audit entries yet.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
