import { BUDGET_AVAILABILITY, BUSINESS_AREAS, IFormValues, IPerson, IRequest, IRequestMasterRow, SEGMENTS } from './constants';

/* ---------------- text ---------------- */

/** Trimmed text with single spaces ('' for null / undefined). */
export function clean(value: any): string {
  return String(value === null || value === undefined ? '' : value).replace(/\s+/g, ' ').trim();
}

/** Lower-case clean text, used to compare values that come from different lists. */
export function norm(value: any): string {
  return clean(value).toLowerCase();
}

/** Same as norm(), but "Not Applicable" / "NA" / blank all mean "no condition". */
export function normCondition(value: any): string {
  const n = norm(value);
  return n === 'not applicable' || n === 'na' || n === 'n/a' ? '' : n;
}

/** Makes a value safe to put inside an OData filter string. */
export function escapeOData(value: string): string {
  return String(value).replace(/'/g, "''");
}

/** Reads JSON text; returns the fallback if it is empty or broken. */
export function safeParse<T>(json: any, fallback: T): T {
  if (json == null || json === '') {
    return fallback;
  }

  if (typeof json !== 'string') {
    return json as T;
  }

  const raw = json.trim();

  try {
    return JSON.parse(raw) as T;
  } catch {
    try {
      // Extract JSON text from SharePoint HTML wrappers.
      const div = document.createElement('div');
      div.innerHTML = raw;

      const text = (div.textContent || '').trim();

      return JSON.parse(text) as T;
    } catch (error) {
      console.error(
        '[SHIFT] Could not read JSON column value',
        error
      );

      return fallback;
    }
  }
}

/** "28 Sept 2026, 3:10 pm". Empty text for an empty / invalid date. */
export function formatDateTime(value: string): string {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    return '';
  }
  const options = { dateStyle: 'medium', timeStyle: 'short' } as unknown as Intl.DateTimeFormatOptions;
  return date.toLocaleString('en-IN', options);
}

export function formatCrore(value: number | string): string {
  return '₹ ' + value + ' Cr';
}

/** "Selected: file.pdf" */
export function formatSelectedFile(files: File[]): string {
  return files.length ? 'Selected: ' + files[0].name : '';
}

/** "2 file(s): a.pdf, b.xlsx" */
export function formatSelectedFiles(files: File[]): string {
  return files.length + ' file(s): ' + files.map((f) => f.name).join(', ');
}

/* ---------------- Request Master: Request Type -> Sub Type -> Condition ---------------- */

function distinct(values: string[]): string[] {
  const result: string[] = [];
  values.forEach((v) => {
    if (v && result.indexOf(v) < 0) {
      result.push(v);
    }
  });
  return result;
}

export { distinct };

export function getRequestTypes(master: IRequestMasterRow[]): string[] {
  return distinct(master.map((m) => m.requestType));
}

/** Sub types of a request type ([] = this request type has no sub type). */
export function getSubTypes(master: IRequestMasterRow[], requestType: string): string[] {
  return distinct(master.filter((m) => m.requestType === requestType).map((m) => m.subType));
}

/** Conditions of a request type + sub type ([] = no condition). */
export function getConditions(master: IRequestMasterRow[], requestType: string, subType: string): string[] {
  return distinct(
    master.filter((m) => m.requestType === requestType && norm(m.subType) === norm(subType)).map((m) => m.condition)
  );
}

/* ---------------- people ---------------- */

/** True when `person` is the logged-in user (site user id, or e-mail if there is no id). */
export function isCurrentUser(person: IPerson | null | undefined, userId: number, userEmail: string): boolean {
  if (!person) {
    return false;
  }
  if (person.id && person.id === userId) {
    return true;
  }
  return !!person.email && norm(person.email) === norm(userEmail);
}

/* ---------------- request lists ---------------- */

/** Used by the search boxes and the Status / Department drop-downs of every list screen. */
export function filterRequests(requests: IRequest[], search: string, status: string = '', department: string = ''): IRequest[] {
  const q = search.toLowerCase().trim();
  return requests.filter((r) => {
    const text = [
      r.id, r.type, r.requestBudgetType, r.subType, r.dept, r.empId, r.empName, r.status, r.costCenter,
      r.businessArea, r.segment, r.budgetHead, r.background, r.proposal, r.nextApprover ? r.nextApprover.name : ''
    ].join(' ').toLowerCase();
    return (!status || r.status === status) && (!department || r.dept === department) && (!q || text.indexOf(q) > -1);
  });
}

/** Numbers shown on the four dashboard cards. */
export function getDashboardCards(requests: IRequest[]): { label: string; value: number; tone: string }[] {
  const count = (statuses: string[]): number => requests.filter((r) => statuses.indexOf(r.status) > -1).length;
  return [
    { label: 'Total Requests', value: requests.filter((r) => r.status !== 'Draft').length, tone: '' },
    { label: 'Pending Approval', value: count(['Pending']), tone: 'orange' },
    { label: 'Approved', value: count(['Approved']), tone: 'green' },
    { label: 'Rejected / Rework', value: count(['Rejected', 'Rework']), tone: 'red' }
  ];
}

/** Empty form for a new request. */
export function getDefaultFormValues(empId: string, empName: string): IFormValues {
  return {
    empId: empId, empName: empName, department: '', requestType: '', requestBudgetType: '', subType: '',
    costCenter: '', businessArea: '', budget: '', financial: '0', impact: '0',
    segment: '', budgetHead: null, background: '', proposal: ''
  };
}

/** Form values of a saved request (Edit Draft / Edit & Resubmit). */
export function requestToFormValues(r: IRequest): IFormValues {
  return {
    empId: r.empId, empName: r.empName, department: r.dept, requestType: r.type,
    requestBudgetType: r.requestBudgetType, subType: r.subType, costCenter: r.costCenter,
    businessArea: r.businessArea, budget: r.budget, financial: String(r.financial), impact: r.impact,
    segment: r.segment,
    budgetHead: r.budgetHeadEmail || r.budgetHead
      ? { id: r.budgetHeadId || undefined, name: r.budgetHead, email: r.budgetHeadEmail }
      : null,
    background: r.background, proposal: r.proposal
  };
}

/** Rows of the Excel export. The keys are the Excel column headers. */
export function buildExportRows(requests: IRequest[]): Array<{ [header: string]: string | number }> {
  return requests.map((r) => ({
    'Request ID': r.id || 'Draft',
    'Request Type': r.type,
    'Budget Type': r.requestBudgetType,
    'Sub Type': r.subType,
    'Department': r.dept,
    'Status': r.status,
    'Requester ID': r.empId,
    'Requester': r.empName,
    'Cost Center': r.costCenter,
    'Business Area': r.businessArea,
    'Budget Availability': r.budget,
    'Financial Impact (INR Cr)': r.financial,
    'Impact vs Budget (INR Cr)': r.impact,
    'Segment': r.segment,
    'Budget Head': r.budgetHead,
    'Current Approver': r.status === 'Pending' && r.nextApprover ? r.nextApprover.name : '',
    'Created': formatDateTime(r.created),
    'Last Updated': formatDateTime(r.updated)
  }));
}

/* ---------------- files ---------------- */

export type PreviewKind = 'pdf' | 'image' | 'generic';

/** How a file preview is drawn (from a data-URL or a file URL). */
export function getPreviewKind(preview?: string): PreviewKind {
  const p = (preview || '').toLowerCase();
  if (p.indexOf('data:application/pdf') === 0 || /^https?:.*\.pdf(\?|#|$)/.test(p)) {
    return 'pdf';
  }
  if (p.indexOf('data:image/') === 0 || /^https?:.*\.(png|jpe?g|gif|webp|bmp|svg)(\?|#|$)/.test(p)) {
    return 'image';
  }
  return 'generic';
}

/** Reads a chosen file as a data-URL so it can be previewed before it is uploaded. */
export function readFilePreview(file: File | null | undefined): Promise<string> {
  return new Promise<string>((resolve) => {
    if (!file) {
      resolve('');
      return;
    }
    const reader = new FileReader();
    reader.onload = (): void => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = (): void => resolve('');
    reader.readAsDataURL(file);
  });
}

export function toFileArray(list: FileList | null): File[] {
  const files: File[] = [];
  if (list) {
    for (let i = 0; i < list.length; i++) {
      files.push(list[i]);
    }
  }
  return files;
}

/** SharePoint attachment names cannot contain  ~ " # % & * : < > ? / \ { | }  */
export function safeFileName(name: string): string {
  return name.replace(/[~"#%&*:<>?/\\{|}]/g, '_');
}
