import * as React from 'react';
import { AttachmentUpload, FilePreview } from '../common/AttachmentUpload';
import { PeoplePicker } from '../common/PeoplePicker';
import { IMgDigitalApprovalProps } from '../IMgDigitalApprovalProps';
import { ApprovalHierarchy } from '../common/ApprovalHierarchy';
import { IFormData, previewRoute, removeSupportingFile, saveDraft, submitRequest } from '../Services/BAL/ApprovalBAL';
import { getApprovalMatrix, getDepartments, getRequestMaster, searchEmployees } from '../Services/BAL/MasterBAL';
import {
  BUDGET_AVAILABILITY, BUSINESS_AREAS, IAttachment, IFormValues, IMatrixRow, IPerson, IRequest, IRequestMasterRow,
  REQUEST_LISTS, SEGMENTS
} from '../utils/constants';
import {
  formatSelectedFile, formatSelectedFiles, getConditions, getDefaultFormValues, getRequestTypes, getSubTypes,
  readFilePreview, requestToFormValues
} from '../utils/helpers';
import { showError, showMessage } from '../utils/messages';

/**
 * RequestForm – ONE form for three cases:
 *   New request ............ `request` is not given
 *   Edit a Draft ........... `request` has status Draft   (Save as Draft + Submit)
 *   Edit & Resubmit ........ `request` has status Rework  (Submit only)
 * The buttons only collect the values and call ApprovalBAL (saveDraft / submitRequest).
 * Messages are shown in message boxes (utils/messages.ts), never on the page.
 */

export interface IRequestFormProps {
  appProps: IMgDigitalApprovalProps;
  /** The saved draft / rework request to edit (none = new request). */
  request?: IRequest;
  onDone: () => void;
  onCancel: () => void;
}

/** Keeps a value that is already saved selectable, even if it is no longer in the list. */
function withValue(options: string[], value: string): string[] {
  return value && options.indexOf(value) < 0 ? [value].concat(options) : options;
}

export const RequestForm: React.FC<IRequestFormProps> = (props) => {
  const app = props.appProps;
  const isRework = !!props.request && props.request.status === 'Rework';

  /* ---------------- state ---------------- */

  /** The saved item (draft / rework). Also set when a save worked but a later step failed, so no second item is created. */
  const [saved, setSaved] = React.useState<IRequest | undefined>(props.request);
  const [values, setValues] = React.useState<IFormValues>(
    props.request ? requestToFormValues(props.request) : getDefaultFormValues(app.employeeId, app.userName)
  );
  const [coreFile, setCoreFile] = React.useState<File | null>(null);
  const [corePreview, setCorePreview] = React.useState<string>('');
  const [supportingFiles, setSupportingFiles] = React.useState<File[]>([]);
  const [busy, setBusy] = React.useState<boolean>(false);

  // Data from SharePoint master lists
  const [master, setMaster] = React.useState<IRequestMasterRow[]>([]);
  const [departments, setDepartments] = React.useState<string[]>([]);
  const [matrix, setMatrix] = React.useState<IMatrixRow[]>([]);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [loadFailed, setLoadFailed] = React.useState<boolean>(false);

  // Only request types that have a SharePoint list (REQUEST_LISTS in constants.ts) can be chosen
  const requestTypes = getRequestTypes(master).filter((t) => !!REQUEST_LISTS[t]);
  const subTypes = getSubTypes(master, values.requestType);
  const conditions = getConditions(master, values.requestType, values.subType);
  const routePreview = previewRoute(matrix, values.requestType, values.requestBudgetType, values.department);

  /* ---------------- loading the master lists ---------------- */

  React.useEffect(() => {
    let active = true;
    const loadMasters = async (): Promise<void> => {
      try {
        const masterRows = await getRequestMaster(app);
        const departmentNames = await getDepartments(app);
        if (!active) {
          return;
        }
        setMaster(masterRows);
        setDepartments(departmentNames);

        if (masterRows.length === 0 || departmentNames.length === 0) {
          setLoadFailed(true);
          showMessage('The request options are not set up yet (Request Master / Department Master are empty). Please contact the SHIFT support team.');
        } // else if (!props.request) {
        //   // New request: start with the first request type and the first department
        //   const type = getRequestTypes(masterRows).filter((t) => !!REQUEST_LISTS[t])[0] || '';
        //   const sub = getSubTypes(masterRows, type)[0] || '';
        //   setValues((v) => ({
        //     ...v, requestType: type, subType: sub,
        //     requestBudgetType: getConditions(masterRows, type, sub)[0] || '', department: ''
        //   }));
        // }
      } catch (error) {
        setLoadFailed(true);
        showError('Could not load the request options.', error);
      }
      if (active) {
        setLoading(false);
      }

      // The approval matrix is only used to DRAW the route on the form. The real check happens when you press Submit.
      try {
        const matrixRows = await getApprovalMatrix(app);
        if (active) {
          setMatrix(matrixRows);
        }
      } catch (error) {
        console.error('[SHIFT] Could not load the approval matrix for the route preview.', error);
      }
    };
    loadMasters().catch(console.error);
    return (): void => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Preview of the newly chosen core file
  React.useEffect(() => {
    let active = true;
    readFilePreview(coreFile).then((p) => { if (active) { setCorePreview(p); } }).catch(console.error);
    return (): void => { active = false; };
  }, [coreFile]);

  /* ---------------- field changes ---------------- */

  const setField = (name: keyof IFormValues) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>): void => {
      const value = e.target.value;
      setValues((v) => ({ ...v, [name]: value }));
    };

  // Request Type -> Sub Type -> Condition: every choice decides the choices of the next one
  const onRequestTypeChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    const type = e.target.value;
    const sub = getSubTypes(master, type)[0] || '';
    const condition = getConditions(master, type, sub)[0] || '';
    setValues((v) => ({ ...v, requestType: type, subType: '', requestBudgetType: '' }));
  };
  const onSubTypeChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    const sub = e.target.value;
    const condition = getConditions(master, values.requestType, sub)[0] || '';
    setValues((v) => ({ ...v, subType: sub, requestBudgetType: '' }));
  };

  /* ---------------- buttons ---------------- */

  /** What the BAL functions need. */
  const getFormData = (): IFormData => ({
    values: values, coreFile: coreFile, supportingFiles: supportingFiles,
    hasSubTypes: subTypes.length > 0, hasConditions: conditions.length > 0
  });

  /** Both save buttons need the employee profile. */
  const hasEmployeeProfile = (): boolean => {
    if (app.employeeId) {
      return true;
    }
    console.error('[SHIFT] Employee ID not found in UserMaster for ' + app.userEmail, app.employeeLookupError);
    showMessage('Your employee profile was not found, so the request cannot be saved. Please contact the SHIFT support team.');
    return false;
  };

  // BUTTON: Save as Draft
  const onSaveDraftClick = async (): Promise<void> => {
    if (busy || !hasEmployeeProfile()) {
      return;
    }
    setBusy(true);
    try {
      const message = await saveDraft(getFormData(), saved, app);
      showMessage(message);
      props.onDone();
    } catch (error) {
      if ((error as any).request) {
        setSaved((error as any).request); // the draft exists now: the next click updates it
      }
      showError('Could not save the draft.', error);
      setBusy(false);
    }
  };

  // BUTTON: Submit for Approval / Resubmit
  const onSubmitClick = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (busy || !hasEmployeeProfile()) {
      return;
    }
    setBusy(true);
    try {
      const message = await submitRequest(getFormData(), saved, app);
      showMessage(message);
      props.onDone();
    } catch (error) {
      if ((error as any).request) {
        setSaved((error as any).request); // the item exists now: the next click updates it
      }
      showError('Could not submit the request.', error);
      setBusy(false);
    }
  };

  // BUTTON: x on a saved supporting file
  const onRemoveFileClick = async (file: IAttachment): Promise<void> => {
    if (busy || !saved) {
      return;
    }
    if (!window.confirm('Remove "' + file.name + '" from this request?\nThis cannot be undone.')) {
      return;
    }
    setBusy(true);
    try {
      const message = await removeSupportingFile(saved, file, app);
      setSaved({ ...saved, supportingFiles: saved.supportingFiles.filter((f) => f.fileName !== file.fileName) });
      showMessage(message);
    } catch (error) {
      showError('Could not remove the file.', error);
    }
    setBusy(false);
  };

  /* ---------------- screen ---------------- */

  const savedCoreFile = saved && saved.initiatorCoreFile ? saved.initiatorCoreFile : undefined;
  const formDisabled = loading || loadFailed;
  const title = !props.request ? 'Create Approval Note' : isRework ? 'Edit & Resubmit' : 'Draft Approval Note';
  const subtitle = !props.request
    ? 'Centralized request capture based on the supplied Project SHIFT fields.'
    : isRework
      ? 'This request was sent back. Correct it and submit it again.'
      : 'Continue editing this draft before submitting it for approval.';

  return (
    <section className="page page-create">
      <div className="panel">
        <div className="req-head">
          <div>
            <h2>{title}</h2>
            <div className="muted small">{subtitle}</div>
          </div>
          <span className="badge">{!props.request ? 'New' : isRework ? 'Rework' : 'Draft'}</span>
        </div>

        {loading ? <div className="empty">Loading request options...</div> : null}

        {/* The approval route that applies to the chosen type / condition / department */}
        {!formDisabled && routePreview.length > 0 ? (
          <ApprovalHierarchy
            subtitle="Approval route applicable to the selected request type / condition / department."
            steps={routePreview}
          />
        ) : null}

        <form onSubmit={onSubmitClick} noValidate>
          <div className="grid3">
            <div className="field">
              <label>Requester Employee ID *</label>
              <input value={values.empId} readOnly />
            </div>
            <div className="field">
              <label>Requester Employee Name *</label>
              <input value={values.empName} readOnly />
            </div>
            <div className="field">
              <label>Department / Function *</label>
              <select value={values.department} onChange={setField('department')} disabled={formDisabled}>
                <option value="">-- Select Department --</option>
                {withValue(departments, values.department).map((d) => <option key={d}>{d}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Request Type *</label>
              <select value={values.requestType} onChange={onRequestTypeChange} disabled={formDisabled || !!saved}>
                <option value="">-- Select Request Type --</option>
                {withValue(requestTypes, values.requestType).map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            {subTypes.length > 0 ? (
              <div className="field conditional-field">
                <label>Sub Request Type *</label>
                <select value={values.subType} onChange={onSubTypeChange} disabled={formDisabled}>
                  <option value="">-- Select Sub Request Type --</option>
                  {withValue(subTypes, values.subType).map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
            ) : null}
            {conditions.length > 0 ? (
              <div className="field">
                <label>Request Budget Type *</label>
                <select value={values.requestBudgetType} onChange={setField('requestBudgetType')} disabled={formDisabled}>
                  <option value="">-- Select Request Budget Type --</option>
                  {withValue(conditions, values.requestBudgetType).map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
            ) : null}
            <div className="field">
              <label>Cost Center *</label>
              <input value={values.costCenter} onChange={setField('costCenter')} placeholder="e.g. M80FI100" />
            </div>
            <div className="field">
              <label>Business Area *</label>
              <select value={values.businessArea} onChange={setField('businessArea')}>
                <option value="">-- Select Business Area --</option>
                {withValue(BUSINESS_AREAS, values.businessArea).map((b) => <option key={b}>{b}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Budget Availability *</label>
              <select value={values.budget} onChange={setField('budget')}>
                <option value="">-- Select Budget Availability --</option>
                {withValue(BUDGET_AVAILABILITY, values.budget).map((b) => <option key={b}>{b}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Financial Impact (INR Crores) *</label>
              <input type="number" step="0.01" min="0" value={values.financial} onChange={setField('financial')} />
            </div>
            <div className="field">
              <label>Impact vs Budget / Latest Forecast (INR Crores)</label>
              <input type="number" step="0.01" value={values.impact} onChange={setField('impact')} />
            </div>
            <div className="field">
              <label>Segment *</label>
              <select value={values.segment} onChange={setField('segment')}>
                <option value="">-- Select Segment --</option>
                {withValue(SEGMENTS, values.segment).map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Budget Head *</label>
              <PeoplePicker
                value={values.budgetHead}
                onSearch={(q): Promise<IPerson[]> => searchEmployees(q, app)}
                onChange={(person): void => setValues((v) => ({ ...v, budgetHead: person }))}
              />
            </div>

            <div className="field full">
              <label>Core File Attachment – Initiator *</label>
              <AttachmentUpload
                hint={savedCoreFile ? 'Current: ' + savedCoreFile.name + ' (choose a file to replace it)' : 'Attach the primary/core document submitted by the initiator.'}
                describeSelection={formatSelectedFile}
                onChange={(files): void => setCoreFile(files.length ? files[0] : null)}
              >
                <div className="file-preview">
                  {coreFile ? (
                    <FilePreview name={coreFile.name} label="Initiator core file" preview={corePreview} />
                  ) : savedCoreFile ? (
                    <FilePreview name={savedCoreFile.name} label="Initiator core file" preview={savedCoreFile.url} />
                  ) : null}
                </div>
              </AttachmentUpload>
            </div>

            <div className="field full">
              <label>Background *</label>
              <textarea value={values.background} onChange={setField('background')} placeholder="Briefly explain the reasoning / background..." />
            </div>
            <div className="field full">
              <label>Requirement / Proposal from User Team *</label>
              <textarea value={values.proposal} onChange={setField('proposal')} placeholder="Describe the requirement or proposal..." />
            </div>

            <div className="field full">
              <label>Supporting File Attachments</label>
              <AttachmentUpload
                multiple
                hint="Attach one or more supporting documents. Additional files can be added here."
                describeSelection={formatSelectedFiles}
                existingFiles={saved ? saved.supportingFiles : undefined}
                onRemoveExisting={saved ? (file): void => { onRemoveFileClick(file).catch(console.error); } : undefined}
                disabled={busy}
                onChange={setSupportingFiles}
              />
            </div>
          </div>

          <div className="form-actions">
            <button type="button" className="btn secondary" disabled={busy} onClick={props.onCancel}>Cancel</button>
            {!isRework ? (
              <button type="button" className="btn secondary" disabled={busy || formDisabled}
                onClick={(): void => { onSaveDraftClick().catch(console.error); }}>
                {busy ? 'Please wait...' : 'Save as Draft'}
              </button>
            ) : null}
            <button type="submit" className="btn" disabled={busy || formDisabled}>
              {busy ? 'Please wait...' : isRework ? 'Resubmit for Approval' : 'Submit for Approval'}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
};
