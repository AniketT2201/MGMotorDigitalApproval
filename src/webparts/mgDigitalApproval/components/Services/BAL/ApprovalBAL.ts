import { IMgDigitalApprovalProps } from '../../IMgDigitalApprovalProps';
import {
  IAttachment, IFormValues, IMatrixRow, IPerson, IRequest, IRouteStep, INITIATOR_ROLE, WF_FLEXIBLE
} from '../../utils/constants';
import { isCurrentUser, norm, normCondition } from '../../utils/helpers';
import { throwUserError } from '../../utils/messages';
import { checkDraft, checkSubmit } from '../../utils/validation';
import { getApprovalMatrix, getApproverRoles, getEmployeeIdByEmail, getSiteUserId, IApproverRoleRow } from './MasterBAL';
import {
  addHistory, buildItemFields, createItem, deleteAttachment, getListName, getRequest, makeRequestId,
  updateItem, uploadFinanceCoreFile, uploadInitiatorCoreFile, uploadSupportingFile
} from './RequestBAL';

/* ======================================================================
 * ApprovalBAL – the logic of EVERY button. One function per button:
 *
 *   Save as Draft ............. saveDraft()
 *   Submit / Resubmit ......... submitRequest()
 *   Approve ................... approveRequest()
 *   Send for Rework ........... sendBackRequest()
 *   Reject .................... rejectRequest()
 *   Add Comment ............... addComment()
 *   Save Finance Core File .... saveFinanceFile()
 *   Remove a saved file ....... removeSupportingFile()
 *
 * Each function returns a message for the user or throws an error.
 * The screen shows the message / error (see utils/messages.ts). Nothing is shown here.
 *
 * Request-list columns the workflow uses:
 *   Status        Draft | Pending | Approved | Rejected | Rework
 *   Stage         0 = initiator, 1 = Level1, 2 = Level2 ...  (index in the saved route)
 *   NextApprover  the person who must act now (the initiator while in Rework), + NextApproverEmpId
 *   ApprovalMatrix  the route saved at submit time (JSON). Later changes in the Approval Matrix
 *                   list do NOT change a request that is already submitted.
 * Every action also writes a new item in SHIFT_RequestHistory.
 * ====================================================================== */

/** What the New Request / Edit form hands over when a button is pressed. */
export interface IFormData {
  values: IFormValues;
  /** Newly chosen initiator core file (null = keep the saved one). */
  coreFile: File | null;
  supportingFiles: File[];
  /** Does the Request Master have sub types / conditions for the chosen request type? */
  hasSubTypes: boolean;
  hasConditions: boolean;
}

/* ======================================================================
 * 1. Who sees which button
 * ====================================================================== */

/** The initiator can edit a Draft, or a request that was sent back (Rework). */
export function canEditRequest(r: IRequest, props: IMgDigitalApprovalProps): boolean {
  return (r.status === 'Draft' || r.status === 'Rework') && r.initiatorId === props.userId;
}

/** Approve / Rework / Reject: only the person in NextApprover, while the request is Pending. */
export function canApproveRequest(r: IRequest, props: IMgDigitalApprovalProps): boolean {
  return r.status === 'Pending' && r.stage >= 1 && r.stage < r.route.length &&
    isCurrentUser(r.nextApprover, props.userId, props.userEmail);
}

/** PLACEHOLDER rule (you will set the real one): the current approver may upload the Finance Controller core file. */
export function canUploadFinanceFile(r: IRequest, props: IMgDigitalApprovalProps): boolean {
  return canApproveRequest(r, props);
}

/* ======================================================================
 * 2. Approval route (Approval Matrix + Approver Role Master)
 * ====================================================================== */

/** The ONE Flexible matrix row for request type + condition + department. */
function findMatrixRow(matrix: IMatrixRow[], type: string, condition: string, department: string): { row?: IMatrixRow; problem: string } {
  const rows = matrix.filter((m) =>
    norm(m.wfType) === norm(WF_FLEXIBLE) &&
    norm(m.requestType) === norm(type) &&
    normCondition(m.condition) === normCondition(condition) &&
    norm(m.department) === norm(department)
  );
  const what = type + ' / ' + (condition || 'no condition') + ' / ' + department;
  if (rows.length === 0) {
    return { problem: 'No approval route is set up for ' + what + '.' };
  }
  if (rows.length > 1) {
    return { problem: 'More than one approval route is set up for ' + what + '.' };
  }
  if (rows[0].levels.length === 0) {
    return { problem: 'The approval route for ' + what + ' has no approval levels.' };
  }
  return { row: rows[0], problem: '' };
}

/** Role names only. Used to draw the route on the form and on the Masters page. */
export function previewRoute(matrix: IMatrixRow[], type: string, condition: string, department: string): IRouteStep[] {
  const found = findMatrixRow(matrix, type, condition, department);
  if (!found.row) {
    return [];
  }
  return [INITIATOR_ROLE].concat(found.row.levels).map((role, i) => ({
    name: role, status: i === 0 ? 'Approved' : 'Pending', action: '', user: { name: '', email: '' }
  }));
}

/** The one active user of a role in a department. */
function findUserForRole(roleRows: IApproverRoleRow[], role: string, department: string): { user?: IPerson; problem: string } {
  // const rows = roleRows.filter((r) => norm(r.role) === norm(role) && norm(r.department) === norm(department));
  const rows = roleRows.filter((r) => {
    const roleMatches = norm(r.role) === norm(role);
    const approverDept = norm(r.department);
    const requestDept = norm(department);

    const departmentMatches =
      !approverDept ||
      approverDept === norm("All") ||
      approverDept === requestDept;

    return roleMatches && departmentMatches;
  });
  if (rows.length === 0) {
    return { problem: role + ': no active user' };
  }
  if (rows.length > 1) {
    return { problem: role + ': more than one active user' };
  }
  if (!rows[0].user) {
    return { problem: role + ': no user selected' };
  }
  return { user: rows[0].user, problem: '' };
}

/**
 * Builds the route that is saved on the request.
 * Step 0 = initiator, step 1 = Level1, step 2 = Level2 ... Each approver gets his Employee ID from UserMaster.
 * Stops with a clear message when anything is missing. Nothing is guessed.
 */
async function buildRoute(values: IFormValues, wfType: string, props: IMgDigitalApprovalProps): Promise<IRouteStep[]> {
  if (norm(wfType) !== norm(WF_FLEXIBLE)) {
    throwUserError('The workflow type "' + wfType + '" is not available yet. Only Flexible requests can be submitted.');
  }

  const matrix = await getApprovalMatrix(props);
  const found = findMatrixRow(matrix, values.requestType, values.requestBudgetType, values.department);
  if (!found.row) {
    throwUserError(found.problem + '\n\nPlease contact the SHIFT support team.');
  }

  const roleRows = await getApproverRoles(props);
  const route: IRouteStep[] = [{
    name: INITIATOR_ROLE,
    status: 'Approved',
    action: 'Submitted',
    user: { id: props.userId, name: props.userName, email: props.userEmail, empId: values.empId },
    actedBy: props.userName,
    actedAt: new Date().toISOString()
  }];

  const problems: string[] = [];
  for (const role of (found.row as IMatrixRow).levels) {
    const foundUser = findUserForRole(roleRows, role, values.department);
    if (!foundUser.user) {
      problems.push(foundUser.problem);
      continue;
    }
    const empId = await getEmployeeIdByEmail(foundUser.user.email, props);
    if (!empId) {
      problems.push(role + ': ' + foundUser.user.name + ' has no Employee ID in UserMaster');
      continue;
    }
    route.push({ name: role, status: 'Pending', action: '', user: { ...foundUser.user, empId: empId } });
  }
  if (problems.length > 0) {
    throwUserError(
      'The approval route for the department "' + values.department + '" is not complete:\n- ' +
      problems.join('\n- ') + '\n\nPlease contact the SHIFT support team.'
    );
  }
  return route;
}

/* ======================================================================
 * 3. Small helpers used by the buttons
 * ====================================================================== */

/**
 * Writes one history item AFTER the request was saved.
 * Returns '' when OK. If the history could not be written, the request is still saved,
 * so we only return a note for the user and log the details in the console.
 */
async function writeHistory(
  r: { id: string; listName: string; itemId: number }, stepNo: number, actionType: string, action: string,
  title: string, comment: string, previousStatus: string, newStatus: string, props: IMgDigitalApprovalProps
): Promise<string> {
  try {
    await addHistory(r, stepNo, actionType, action, title, comment, previousStatus, newStatus, props);
    return '';
  } catch (error) {
    logQuietly('History entry "' + action + '" was not saved.', error);
    return '\n\nNote: the history entry "' + action + '" could not be saved. Please tell the SHIFT support team.';
  }
}

/** Logs an error in the console without a message box (the caller shows its own message). */
function logQuietly(what: string, error: unknown): void {
  console.error('[SHIFT] ' + what, error);
}

/** Reads the saved request again and checks the user may still edit it. */
async function loadEditable(existing: IRequest | undefined, props: IMgDigitalApprovalProps): Promise<IRequest | undefined> {
  if (!existing) {
    return undefined;
  }
  const fresh = await getRequest(existing.listName, existing.itemId, props);
  if (!fresh || !canEditRequest(fresh, props)) {
    throwUserError('This request can no longer be edited by you. Please go back and refresh the list.');
  }
  return fresh as IRequest;
}

/**
 * The item already exists in SharePoint but a later step failed.
 * We attach the saved request to the error, so the form keeps working on the SAME item
 * (pressing the button again will not create a second item).
 */
async function failAfterSave(message: string, listName: string, itemId: number, error: unknown, props: IMgDigitalApprovalProps): Promise<never> {
  console.error('[SHIFT] ' + message, error);
  const wrapped: any = new Error(message);
  wrapped.isUserMessage = true;
  try {
    wrapped.request = await getRequest(listName, itemId, props);
  } catch (e) {
    console.error('[SHIFT] Could not read the saved request again.', e);
  }
  throw wrapped;
}

/**
 * Reads the request again and checks it is still waiting at the SAME step for THIS user.
 * Used by Approve / Rework / Reject so an old screen can never approve twice or out of order.
 */
async function loadForAction(request: IRequest, props: IMgDigitalApprovalProps): Promise<IRequest> {
  const fresh = await getRequest(request.listName, request.itemId, props);
  if (!fresh) {
    throwUserError('This request could not be found. Please refresh the page.');
  }
  const latest = fresh as IRequest;
  if (latest.status !== 'Pending' || latest.stage !== request.stage) {
    throwUserError('This request was changed by someone else (now: ' + latest.status + '). Please refresh the page.');
  }
  if (!canApproveRequest(latest, props)) {
    throwUserError('This request is not assigned to you for approval.');
  }
  return latest;
}

/* ======================================================================
 * 4. BUTTON: Save as Draft
 * ====================================================================== */

export async function saveDraft(form: IFormData, existingRequest: IRequest | undefined, props: IMgDigitalApprovalProps): Promise<string> {
  // Step 1: make sure the user may still edit this request
  const existing = await loadEditable(existingRequest, props);
  if (existing && existing.status !== 'Draft') {
    throwUserError('Only a draft can be saved as a draft.');
  }

  // Step 2: check the form
  const problems = checkDraft(form.values);
  if (problems.length > 0) {
    throwUserError('Please correct the following:\n- ' + problems.join('\n- '));
  }

  // Step 3: save the item (a draft has no Request ID yet and no approver)
  const listName = existing ? existing.listName : getListName(form.values.requestType);
  const budgetHeadId = form.values.budgetHead ? await getSiteUserId(form.values.budgetHead, props) : null;
  const fields = { ...buildItemFields(form.values, budgetHeadId), Status: 'Draft', Stage: 0 };

  let itemId: number;
  if (existing) {
    itemId = existing.itemId;
    await updateItem(listName, itemId, fields, props);
  } else {
    itemId = await createItem(listName, { ...fields, InitiatorId: props.userId }, props);
  }

  // Step 4: upload the chosen files
  try {
    if (form.coreFile) {
      await uploadInitiatorCoreFile(listName, itemId, form.coreFile, props);
    }
    for (const file of form.supportingFiles) {
      await uploadSupportingFile(listName, itemId, file, props);
    }
  } catch (error) {
    return failAfterSave('The draft was saved, but a file could not be uploaded. Please try again.', listName, itemId, error, props);
  }

  // Step 5: history
  const request = { id: '', listName: listName, itemId: itemId };
  const note = existing
    ? await writeHistory(request, 0, 'Audit', 'Draft Updated', 'Draft updated by ' + props.userName, '', '', '', props)
    : await writeHistory(request, 0, 'Audit', 'Draft Saved', 'Draft saved by ' + props.userName, '', '', 'Draft', props);
  return 'Draft saved.' + note;
}

/* ======================================================================
 * 5. BUTTON: Submit for Approval  (also used for "Edit & Resubmit" after Rework)
 * ====================================================================== */

export async function submitRequest(form: IFormData, existingRequest: IRequest | undefined, props: IMgDigitalApprovalProps): Promise<string> {
  const values = form.values;

  // Step 1: make sure the user may still edit this request
  const existing = await loadEditable(existingRequest, props);

  // Step 2: check the form
  const hasCoreFile = !!form.coreFile || !!(existing && existing.initiatorCoreFile);
  const problems = checkSubmit(values, form.hasSubTypes, form.hasConditions, hasCoreFile);
  if (problems.length > 0) {
    throwUserError('Please correct the following:\n- ' + problems.join('\n- '));
  }

  // Step 3: build the approval route. If setup is missing we stop here, before anything is saved.
  const wfType = existing && existing.wfType ? existing.wfType : WF_FLEXIBLE;
  const route = await buildRoute(values, wfType, props);
  const firstApprover = route[1].user;
  const listName = existing ? existing.listName : getListName(values.requestType);
  const budgetHeadId = await getSiteUserId(values.budgetHead as IPerson, props);
  const isResubmit = !!existing && existing.status === 'Rework';

  // Step 4: save the item. A new request is first saved as Draft, so a failed upload leaves no half-submitted request.
  let itemId: number;
  if (existing) {
    itemId = existing.itemId;
    await updateItem(listName, itemId, buildItemFields(values, budgetHeadId), props);
  } else {
    itemId = await createItem(listName, {
      ...buildItemFields(values, budgetHeadId), Status: 'Draft', Stage: 0, InitiatorId: props.userId
    }, props);
  }

  try {
    // Step 5: upload the chosen files
    if (form.coreFile) {
      await uploadInitiatorCoreFile(listName, itemId, form.coreFile, props);
    }
    for (const file of form.supportingFiles) {
      await uploadSupportingFile(listName, itemId, file, props);
    }

    // Step 6: Request ID (kept if the request already has one) and start the approval
    const requestId = existing && existing.id ? existing.id : makeRequestId(values.department, itemId);
    await updateItem(listName, itemId, {
      RequestID: requestId,
      Status: 'Pending',
      Stage: 1,
      NextApproverId: firstApprover.id,
      NextApproverEmpId: firstApprover.empId,
      WFType: wfType,
      ApprovalMatrix: JSON.stringify(route)
    }, props);

    // Step 7: history
    const action = isResubmit ? 'Resubmitted' : 'Submitted';
    const note = await writeHistory(
      { id: requestId, listName: listName, itemId: itemId }, 0, 'Approval', action,
      action + ' by ' + props.userName + '. Sent to ' + route[1].name + '.',
      '', existing ? existing.status : '', 'Pending', props
    );
    return 'Request ' + requestId + ' was submitted for approval.' + note;
  } catch (error) {
    return failAfterSave(
      'The request was saved but could not be submitted. You can open it from My Requests and submit it again.',
      listName, itemId, error, props
    );
  }
}

/* ======================================================================
 * 6. BUTTON: Approve
 * ====================================================================== */

export async function approveRequest(request: IRequest, comment: string, props: IMgDigitalApprovalProps): Promise<string> {
  // Step 1: latest data + check it is still this user's turn
  const r = await loadForAction(request, props);

  // Step 2: mark this step as approved in the saved route
  const route = r.route.map((s) => ({ ...s }));
  route[r.stage] = {
    ...route[r.stage], status: 'Approved', action: 'Approved', actedBy: props.userName, actedAt: new Date().toISOString()
  };

  const stepName = route[r.stage].name;
  const hasNextStep = r.stage + 1 < route.length;

  if (hasNextStep) {
    // Step 3a: move to the next approver
    const next = route[r.stage + 1];
    await updateItem(r.listName, r.itemId, {
      Stage: r.stage + 1,
      NextApproverId: next.user.id,
      NextApproverEmpId: next.user.empId,
      ApprovalMatrix: JSON.stringify(route)
    }, props);
    const note = await writeHistory(
      r, r.stage, 'Approval', 'Approved', 'Approved by ' + props.userName + ' (' + stepName + '). Sent to ' + next.name + '.',
      comment.trim(), '', '', props
    );
    return 'Approved. The request was sent to ' + next.name + '.' + note;
  }

  // Step 3b: this was the last step, the request is approved
  await updateItem(r.listName, r.itemId, {
    Status: 'Approved',
    NextApproverId: null,
    NextApproverEmpId: '',
    ApprovalMatrix: JSON.stringify(route)
  }, props);
  const note = await writeHistory(
    r, r.stage, 'Approval', 'Approved', 'Final approval by ' + props.userName + ' (' + stepName + '). Request approved.',
    comment.trim(), 'Pending', 'Approved', props
  );
  return 'Final approval done. The request is approved.' + note;
}

/* ======================================================================
 * 7. BUTTON: Send for Rework (back to the initiator)
 * ====================================================================== */

export async function sendBackRequest(request: IRequest, comment: string, props: IMgDigitalApprovalProps): Promise<string> {
  // Step 1: a reason is required
  if (!comment.trim()) {
    throwUserError('Please write a comment. It is required to send the request for rework.');
  }

  // Step 2: latest data + check it is still this user's turn
  const r = await loadForAction(request, props);

  // Step 3: mark this step as "Rework" and give the request back to the initiator (Stage 0)
  const route = r.route.map((s) => ({ ...s }));
  route[r.stage] = {
    ...route[r.stage], status: 'Rework', action: 'Sent for rework', actedBy: props.userName, actedAt: new Date().toISOString()
  };
  await updateItem(r.listName, r.itemId, {
    Status: 'Rework',
    Stage: 0,
    NextApproverId: r.initiatorId,
    NextApproverEmpId: r.empId,
    ApprovalMatrix: JSON.stringify(route)
  }, props);

  // Step 4: history
  const note = await writeHistory(
    r, r.stage, 'Approval', 'Sent Back', 'Sent back to the initiator by ' + props.userName + ' (' + route[r.stage].name + ').',
    comment.trim(), 'Pending', 'Rework', props
  );
  return 'The request was sent back to the initiator for rework.' + note;
}

/* ======================================================================
 * 8. BUTTON: Reject
 * ====================================================================== */

export async function rejectRequest(request: IRequest, comment: string, props: IMgDigitalApprovalProps): Promise<string> {
  // Step 1: a reason is required
  if (!comment.trim()) {
    throwUserError('Please write a comment. It is required to reject the request.');
  }

  // Step 2: latest data + check it is still this user's turn
  const r = await loadForAction(request, props);

  // Step 3: mark this step as rejected. Nobody is waiting for the request any more.
  const route = r.route.map((s) => ({ ...s }));
  route[r.stage] = {
    ...route[r.stage], status: 'Rejected', action: 'Rejected', actedBy: props.userName, actedAt: new Date().toISOString()
  };
  await updateItem(r.listName, r.itemId, {
    Status: 'Rejected',
    NextApproverId: null,
    NextApproverEmpId: '',
    ApprovalMatrix: JSON.stringify(route)
  }, props);

  // Step 4: history
  const note = await writeHistory(
    r, r.stage, 'Approval', 'Rejected', 'Rejected by ' + props.userName + ' (' + route[r.stage].name + ').',
    comment.trim(), 'Pending', 'Rejected', props
  );
  return 'The request was rejected.' + note;
}

/* ======================================================================
 * 9. BUTTON: Add Comment
 * ====================================================================== */

export async function addComment(request: IRequest, comment: string, props: IMgDigitalApprovalProps): Promise<string> {
  if (!comment.trim()) {
    throwUserError('Please type a comment first.');
  }
  // Only a new history item is written. The request itself does not change.
  await addHistory(request, request.stage, 'Comment', 'Comment', 'Comment by ' + props.userName, comment.trim(), '', '', props);
  return 'Comment added.';
}

/* ======================================================================
 * 10. BUTTON: Save Finance Core File
 * ====================================================================== */

export async function saveFinanceFile(request: IRequest, file: File | null, props: IMgDigitalApprovalProps): Promise<string> {
  if (!file) {
    throwUserError('Please select a Finance Controller core file first.');
  }
  const r = await getRequest(request.listName, request.itemId, props);
  if (!r || !canUploadFinanceFile(r, props)) {
    throwUserError('You are not allowed to upload the Finance Controller core file for this request.');
  }
  const latest = r as IRequest;

  await uploadFinanceCoreFile(latest.listName, latest.itemId, file as File, props);
  const note = await writeHistory(
    latest, latest.stage, 'Audit', 'Finance Core File Uploaded', 'Finance Controller core file uploaded: ' + (file as File).name,
    '', '', '', props
  );
  return 'Finance Controller core file saved.' + note;
}

/* ======================================================================
 * 11. BUTTON: remove a saved supporting file (the form asks "Are you sure?" first)
 * ====================================================================== */

export async function removeSupportingFile(request: IRequest, file: IAttachment, props: IMgDigitalApprovalProps): Promise<string> {
  const r = (await loadEditable(request, props)) as IRequest;
  await deleteAttachment(file, props);
  const note = await writeHistory(r, r.stage, 'Audit', 'Attachment Removed', 'Supporting file removed: ' + file.name, '', '', '', props);
  return 'File removed.' + note;
}

