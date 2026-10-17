import SPCRUDOPS from '../DAL/SPCRUDOPS';
import { IMgDigitalApprovalProps } from '../../IMgDigitalApprovalProps';
import {
  IAttachment, IFormValues, IHistoryEvent, IPerson, IRequest, IRouteStep, LIST_NAMES, REQUEST_LISTS, RequestStatus, WF_FLEXIBLE
} from '../../utils/constants';
import { clean, escapeOData, safeFileName, safeParse } from '../../utils/helpers';
import { throwUserError } from '../../utils/messages';

/**
 * RequestBAL – plain read / write of request items, attachments and history.
 * No workflow decisions here (they are in ApprovalBAL.ts).
 *
 * A request is identified by  listName + itemId  (item ids repeat across lists).
 */

/** File-name prefixes: all files are attachments of the list item, the prefix tells which kind. */
const INITIATOR_PREFIX = 'Initiator__';
const SUPPORTING_PREFIX = 'Supporting__';
const FINANCE_PREFIX = 'FinanceCore__';

const NO_ORDER = { column: '', isAscending: true };

/* The Title column is not used. WorkflowHistory is not used (history is in SHIFT_RequestHistory). */
const SELECT =
  'Id,InitiatorEmpId,NextApproverEmpId,Department,RequestType,BudgetType,SubType,CostCenter,BusinessArea,' +
  'BudgetAvailability,FinancialImpact,ImpactvsBudget,Segment,Background,Requirement,RequestID,' +
  'ApprovalMatrix,Stage,WFType,Status,' +
  'BudgetHead/Id,BudgetHead/Title,BudgetHead/EMail,' +
  'Initiator/Id,Initiator/Title,Initiator/EMail,' +
  'NextApprover/Id,NextApprover/Title,NextApprover/EMail,' +
  'Author/Id,Author/Title,Created,Modified,AttachmentFiles/FileName,AttachmentFiles/ServerRelativeUrl';
const EXPAND = 'BudgetHead,Initiator,NextApprover,Author,AttachmentFiles';

/* ================================================================== */
/* Which SharePoint list belongs to a request type                      */
/* ================================================================== */

/** List name of a request type (from REQUEST_LISTS in constants.ts). */
export function getListName(requestType: string): string {
  const name = REQUEST_LISTS[requestType];
  if (!name) {
    throwUserError('No SharePoint list is set up for the request type "' + requestType + '". Please contact the SHIFT support team.');
  }
  return name;
}

/** Every request list (no duplicates). */
export function getRequestListNames(): string[] {
  const names: string[] = [];
  Object.keys(REQUEST_LISTS).forEach((type) => {
    if (names.indexOf(REQUEST_LISTS[type]) < 0) {
      names.push(REQUEST_LISTS[type]);
    }
  });
  return names;
}

/* ================================================================== */
/* Reading requests                                                    */
/* ================================================================== */

/** A person column -> IPerson (null when empty). */
function toPerson(value: any, empId?: string): IPerson | null {
  return value && value.Id ? { id: value.Id, name: clean(value.Title), email: clean(value.EMail), empId: empId } : null;
}

function toAttachment(file: any, prefix: string): IAttachment {
  const fileName: string = file.FileName;
  return {
    name: fileName.indexOf(prefix) === 0 ? fileName.substring(prefix.length) : fileName,
    fileName: fileName,
    serverUrl: file.ServerRelativeUrl,
    url: window.location.origin + file.ServerRelativeUrl
  };
}

/** One SharePoint list item -> one request object used by the screens. */
function toRequest(item: any, listName: string): IRequest {
  const files: any[] = item.AttachmentFiles || [];
  const filesWith = (prefix: string): any[] => files.filter((f) => f.FileName.indexOf(prefix) === 0);
  const initiatorFile = filesWith(INITIATOR_PREFIX)[0];
  const financeFile = filesWith(FINANCE_PREFIX)[0];

  const route = safeParse<IRouteStep[]>(item.ApprovalMatrix, []);
  const head = toPerson(item.BudgetHead);
  const initiator = toPerson(item.Initiator);
  const author = item.Author || {};

  return {
    key: listName + '|' + item.Id,
    itemId: item.Id,
    listName: listName,
    id: clean(item.RequestID),
    type: clean(item.RequestType),
    dept: clean(item.Department),
    status: (clean(item.Status) || 'Draft') as RequestStatus,
    wfType: clean(item.WFType),
    empId: clean(item.InitiatorEmpId),
    empName: initiator ? initiator.name : clean(author.Title),
    financial: Number(item.FinancialImpact) || 0,
    budget: clean(item.BudgetAvailability),
    impact: clean(item.ImpactvsBudget),
    costCenter: clean(item.CostCenter),
    businessArea: clean(item.BusinessArea),
    segment: clean(item.Segment),
    budgetHead: head ? head.name : '',
    budgetHeadId: head && head.id ? head.id : 0,
    budgetHeadEmail: head ? head.email : '',
    requestBudgetType: clean(item.BudgetType),
    subType: clean(item.SubType),
    background: item.Background || '',
    proposal: item.Requirement || '',
    created: item.Created,
    updated: item.Modified,
    // Older drafts may have no Initiator: use the person who created the item.
    initiatorId: initiator && initiator.id ? initiator.id : (author.Id || 0),
    stage: Number(item.Stage) || 0,
    nextApprover: toPerson(item.NextApprover, clean(item.NextApproverEmpId)),
    route: route,
    initiatorCoreFile: initiatorFile ? toAttachment(initiatorFile, INITIATOR_PREFIX) : null,
    financeControllerCoreFile: financeFile ? toAttachment(financeFile, FINANCE_PREFIX) : null,
    supportingFiles: filesWith(SUPPORTING_PREFIX).map((f) => toAttachment(f, SUPPORTING_PREFIX))
  };
}

export type RequestScope = 'all' | 'mine' | 'inbox';

/**
 * Reads the requests of every request list.
 *   'all'   = everything (other people's drafts are hidden)
 *   'mine'  = started by the logged-in user
 *   'inbox' = Pending and assigned to the logged-in user (NextApprover)
 * If one list cannot be read, the others are still returned and the failed list names are in `failedLists`.
 */
export async function getRequests(
  scope: RequestScope, props: IMgDigitalApprovalProps
): Promise<{ requests: IRequest[]; failedLists: string[] }> {
  const dal = await SPCRUDOPS();
  const me = props.userId;

  let filter = '';
  if (scope === 'mine') {
    filter = '(InitiatorId eq ' + me + ' or AuthorId eq ' + me + ')';
  } else if (scope === 'inbox') {
    filter = "Status eq 'Pending' and NextApproverId eq " + me;
  } else {
    filter = "(Status ne 'Draft' or InitiatorId eq " + me + ' or AuthorId eq ' + me + ')';
  }

  let requests: IRequest[] = [];
  const failedLists: string[] = [];
  for (const listName of getRequestListNames()) {
    try {
      const rows = await dal.getData(listName, SELECT, EXPAND, filter, { column: 'Modified', isAscending: false }, props);
      requests = requests.concat(rows.map((row) => toRequest(row, listName)));
    } catch (error) {
      console.error('[SHIFT] Could not read the list ' + listName, error);
      failedLists.push(listName);
    }
  }
  // newest first
  requests.sort((a, b) => (a.updated < b.updated ? 1 : a.updated > b.updated ? -1 : 0));
  return { requests: requests, failedLists: failedLists };
}

/** Reads ONE request again from SharePoint (always the latest data). */
export async function getRequest(listName: string, itemId: number, props: IMgDigitalApprovalProps): Promise<IRequest | null> {
  const dal = await SPCRUDOPS();
  const rows = await dal.getData(listName, SELECT, EXPAND, 'Id eq ' + itemId, NO_ORDER, props);
  return rows.length ? toRequest(rows[0], listName) : null;
}

/* ================================================================== */
/* Saving the request item                                             */
/* ================================================================== */

/** Request ID = Year/Department/0000 + item id, e.g. 2026/Marketing/00007 */
export function makeRequestId(department: string, itemId: number): string {
  return new Date().getFullYear() + '/' + department + '/0000' + itemId;
}

/** Form values -> SharePoint columns. Title is not written. Person columns are written through "...Id". */
export function buildItemFields(values: IFormValues, budgetHeadId: number | null): any {
  return {
    InitiatorEmpId: values.empId,
    Department: values.department,
    RequestType: values.requestType,
    BudgetType: values.requestBudgetType,
    SubType: values.subType,
    CostCenter: values.costCenter,
    BusinessArea: values.businessArea,
    BudgetAvailability: values.budget,
    FinancialImpact: Number(values.financial) || 0,
    ImpactvsBudget: values.impact,
    Segment: values.segment,
    BudgetHeadId: budgetHeadId,
    Background: values.background,
    Requirement: values.proposal,
    WFType: WF_FLEXIBLE
  };
}

/** Adds a new item and returns its id. */
export async function createItem(listName: string, fields: any, props: IMgDigitalApprovalProps): Promise<number> {
  const dal = await SPCRUDOPS();
  const result = await dal.insertData(listName, fields, props);
  const id = result && result.data ? result.data.Id : result && result.Id;
  if (!id) {
    throw new Error('The item was added to ' + listName + ' but SharePoint did not return its id.');
  }
  return id;
}

export async function updateItem(listName: string, itemId: number, fields: any, props: IMgDigitalApprovalProps): Promise<void> {
  const dal = await SPCRUDOPS();
  await dal.updateData(listName, itemId, fields, props);
}

/* ================================================================== */
/* Attachments                                                         */
/* ================================================================== */

/**
 * Uploads one file as an attachment of the list item.
 *  - A file with the same name is replaced.
 *  - replaceOldOfSameKind = true: other files with the same prefix are removed too
 *    (initiator core file / finance core file: only one allowed).
 */
async function uploadFile(
  listName: string, itemId: number, file: File, prefix: string, replaceOldOfSameKind: boolean, props: IMgDigitalApprovalProps
): Promise<void> {
  const dal = await SPCRUDOPS();
  const storedName = prefix + safeFileName(file.name);

  const rows = await dal.getData(
    listName, 'Id,AttachmentFiles/FileName,AttachmentFiles/ServerRelativeUrl', 'AttachmentFiles', 'Id eq ' + itemId, NO_ORDER, props
  );
  const existing: any[] = rows.length ? (rows[0].AttachmentFiles || []) : [];
  for (const old of existing) {
    const sameName = old.FileName === storedName;
    const sameKind = replaceOldOfSameKind && old.FileName.indexOf(prefix) === 0;
    if (sameName || sameKind) {
      await dal.deleteFile(old.ServerRelativeUrl, props);
    }
  }
  await dal.addAttachmentInList(file, listName, itemId, storedName, props);
}

export async function uploadInitiatorCoreFile(listName: string, itemId: number, file: File, props: IMgDigitalApprovalProps): Promise<void> {
  await uploadFile(listName, itemId, file, INITIATOR_PREFIX, true, props);
}

export async function uploadSupportingFile(listName: string, itemId: number, file: File, props: IMgDigitalApprovalProps): Promise<void> {
  await uploadFile(listName, itemId, file, SUPPORTING_PREFIX, false, props);
}

export async function uploadFinanceCoreFile(listName: string, itemId: number, file: File, props: IMgDigitalApprovalProps): Promise<void> {
  await uploadFile(listName, itemId, file, FINANCE_PREFIX, true, props);
}

export async function deleteAttachment(attachment: IAttachment, props: IMgDigitalApprovalProps): Promise<void> {
  const dal = await SPCRUDOPS();
  await dal.deleteFile(attachment.serverUrl, props);
}

/* ================================================================== */
/* SHIFT_RequestHistory (approval history, comments, audit trail)       */
/* ================================================================== */

/**
 * Adds ONE new history item. Old history items are never changed.
 * ActionType: 'Approval' (submit / approve / reject / send back / resubmit),
 *             'Comment' (comment or query), 'Audit' (draft saved, file uploaded ...).
 * The event time is the SharePoint "Created" date.
 */
export async function addHistory(
  request: { id: string; listName: string; itemId: number },
  stepNo: number, actionType: string, action: string, title: string,
  comment: string, previousStatus: string, newStatus: string,
  props: IMgDigitalApprovalProps
): Promise<void> {
  const dal = await SPCRUDOPS();
  await dal.insertData(LIST_NAMES.history, {
    Title: title,
    RequestID: request.id,
    RequestListName: request.listName,
    RequestItemID: String(request.itemId), // single line of text in SharePoint
    StepNo: stepNo,
    ActionType: actionType,
    Action: action,
    ActionTakenById: props.userId,
    Comment: comment,
    PreviousStatus: previousStatus,
    NewStatus: newStatus
  }, props);
}

/** All history items of ONE request (list name + item id), oldest first. */
export async function getHistory(listName: string, itemId: number, props: IMgDigitalApprovalProps): Promise<IHistoryEvent[]> {
  const dal = await SPCRUDOPS();
  const filter = "RequestListName eq '" + escapeOData(listName) + "' and RequestItemID eq '" + itemId + "'";
  const rows = await dal.getData(
    LIST_NAMES.history,
    'Id,Title,StepNo,ActionType,Action,Comment,PreviousStatus,NewStatus,Created,ActionTakenBy/Title',
    'ActionTakenBy', filter, { column: 'Id', isAscending: true }, props
  );
  return rows.map((r): IHistoryEvent => ({
    id: r.Id,
    title: clean(r.Title),
    stepNo: Number(r.StepNo) || 0,
    actionType: clean(r.ActionType),
    action: clean(r.Action),
    actionTakenBy: r.ActionTakenBy ? clean(r.ActionTakenBy.Title) : '',
    comment: r.Comment || '',
    previousStatus: clean(r.PreviousStatus),
    newStatus: clean(r.NewStatus),
    at: r.Created
  }));
}
