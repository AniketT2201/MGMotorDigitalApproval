import SPCRUDOPS from '../DAL/SPCRUDOPS';
import { IMgDigitalApprovalProps } from '../../IMgDigitalApprovalProps';
import { ACTIVE_STATUS, IMatrixRow, IPerson, IRequestMasterRow, LIST_NAMES, LOOKUP_SHOWS } from '../../utils/constants';
import { clean, escapeOData } from '../../utils/helpers';

/**
 * MasterBAL – reads the master lists (Request Master, Department Master, Approval Matrix,
 * Approver Role Master) and employee data from UserMaster (parent site).
 * Nothing here has a hardcoded fallback: if a list cannot be read, the error is thrown
 * and the screen shows it.
 */

const NO_ORDER = { column: '', isAscending: true };
const ACTIVE_FILTER = "Status eq '" + ACTIVE_STATUS + "'";

/** Reads a lookup (item.Column.Shows) or text (item.Column) value. */
function lookupText(item: any, column: string, shows: string): string {
  const value = item[column];
  return value && typeof value === 'object' ? clean(value[shows]) : clean(value);
}

/** Adds "Column/Shows" to $select and "Column" to $expand for a lookup column ('' shows = plain text). */
function addColumn(select: string[], expand: string[], column: string, shows: string): void {
  if (shows) {
    select.push(column + '/' + shows);
    expand.push(column);
  } else {
    select.push(column);
  }
}

/* ------------------------------------------------------------------ */
/* Request Master: Request Type -> Sub Type -> Condition (active rows)  */
/* ------------------------------------------------------------------ */

export async function getRequestMaster(props: IMgDigitalApprovalProps): Promise<IRequestMasterRow[]> {
  const dal = await SPCRUDOPS();
  const rows = await dal.getData(
    LIST_NAMES.requestMaster, 'Id,RequestType,SubType,Condition,Status', '', ACTIVE_FILTER, NO_ORDER, props
  );
  return rows
    .map((r): IRequestMasterRow => ({
      requestType: clean(r.RequestType),
      subType: clean(r.SubType),
      condition: clean(r.Condition)
    }))
    .filter((r) => !!r.requestType);
}

/* ------------------------------------------------------------------ */
/* Departments (active, no duplicates)                                  */
/* ------------------------------------------------------------------ */

export async function getDepartments(props: IMgDigitalApprovalProps): Promise<string[]> {
  const dal = await SPCRUDOPS();
  const rows = await dal.getData(
    LIST_NAMES.departments, 'Id,Department,Status', '', ACTIVE_FILTER,
    { column: 'Department', isAscending: true }, props
  );
  const names: string[] = [];
  rows.forEach((r) => {
    const name = clean(r.Department);
    if (name && names.indexOf(name) < 0) {
      names.push(name);
    }
  });
  return names;
}

/* ------------------------------------------------------------------ */
/* Approval Matrix: one row = one route (Level1..Level16 = role names)  */
/* ------------------------------------------------------------------ */

export async function getApprovalMatrix(props: IMgDigitalApprovalProps): Promise<IMatrixRow[]> {
  const dal = await SPCRUDOPS();
  const select: string[] = ['Id', 'WFType'];
  const expand: string[] = [];
  addColumn(select, expand, 'RequestType', LOOKUP_SHOWS.matrixRequestType);
  addColumn(select, expand, 'Condition', LOOKUP_SHOWS.matrixCondition);
  addColumn(select, expand, 'Department', LOOKUP_SHOWS.matrixDepartment);
  const levels: string[] = [];
  for (let i = 1; i <= 16; i++) {
    levels.push('Level' + i);
  }

  const rows = await dal.getData(
    LIST_NAMES.approvalMatrix, select.concat(levels).join(','), expand.join(','), '', NO_ORDER, props
  );

  return rows.map((r): IMatrixRow => ({
    requestType: lookupText(r, 'RequestType', LOOKUP_SHOWS.matrixRequestType),
    condition: lookupText(r, 'Condition', LOOKUP_SHOWS.matrixCondition),
    wfType: clean(r.WFType),
    department: lookupText(r, 'Department', LOOKUP_SHOWS.matrixDepartment),
    levels: levels.map((c) => clean(r[c])).filter((v) => !!v)
  }));
}

/* ------------------------------------------------------------------ */
/* Approver Role Master: role + department -> user                      */
/* ------------------------------------------------------------------ */

export interface IApproverRoleRow {
  role: string;
  department: string;
  user: IPerson | null;
}

/** Active rows only. */
export async function getApproverRoles(props: IMgDigitalApprovalProps): Promise<IApproverRoleRow[]> {
  const dal = await SPCRUDOPS();
  const select: string[] = ['Id', 'ApproverRole', 'Username/Id', 'Username/Title', 'Username/EMail'];
  const expand: string[] = ['Username'];
  addColumn(select, expand, 'Department', LOOKUP_SHOWS.roleDepartment);

  const rows = await dal.getData(
    LIST_NAMES.approverRoles, select.join(','), expand.join(','), ACTIVE_FILTER, NO_ORDER, props
  );

  return rows.map((r): IApproverRoleRow => ({
    role: clean(r.ApproverRole),
    department: lookupText(r, 'Department', LOOKUP_SHOWS.roleDepartment),
    user: r.Username && r.Username.Id
      ? { id: r.Username.Id, name: clean(r.Username.Title), email: clean(r.Username.EMail) }
      : null
  }));
}

/* ------------------------------------------------------------------ */
/* Employees (UserMaster on the PARENT site)                           */
/* ------------------------------------------------------------------ */

/** Employee ID (UserMaster, matched on CompanyEmailId) of any user. '' if the user is not in UserMaster. */
export async function getEmployeeIdByEmail(email: string, props: IMgDigitalApprovalProps): Promise<string> {
  if (!email) {
    return '';
  }
  const dal = await SPCRUDOPS();
  const rows = await dal.getRootData(
    LIST_NAMES.userMaster, 'Id,EmployeeId,CompanyEmailId', '',
    "CompanyEmailId eq '" + escapeOData(email) + "'", NO_ORDER, props
  );
  return rows.length ? clean(rows[0].EmployeeId) : '';
}

/** Employee ID of the logged-in user ('' if not found). */
export async function getEmployeeId(props: IMgDigitalApprovalProps): Promise<string> {
  return getEmployeeIdByEmail(props.userEmail, props);
}

/** People-picker suggestions: employees whose name or email contains the text. */
export async function searchEmployees(query: string, props: IMgDigitalApprovalProps): Promise<IPerson[]> {
  const text = clean(query);
  if (text.length < 2) {
    return [];
  }
  const dal = await SPCRUDOPS();
  const q = escapeOData(text);
  const rows = await dal.getRootData(
    LIST_NAMES.userMaster, 'Id,Title,CompanyEmailId', '',
    "substringof('" + q + "',Title) or substringof('" + q + "',CompanyEmailId)", NO_ORDER, props
  );
  return rows
    .filter((r) => !!clean(r.CompanyEmailId))
    .slice(0, 10)
    .map((r): IPerson => ({ name: clean(r.Title), email: clean(r.CompanyEmailId) }));
}

/** Site user id of a person (adds the user to the site if needed). Needed to save person columns. */
export async function getSiteUserId(person: IPerson, props: IMgDigitalApprovalProps): Promise<number> {
  if (person.id) {
    return person.id;
  }
  const dal = await SPCRUDOPS();
  const user = await dal.ensureUser('i:0#.f|membership|' + person.email, props);
  if (!user || !user.Id) {
    throw new Error('Could not find the SharePoint user for ' + person.email + '.');
  }
  return user.Id;
}
