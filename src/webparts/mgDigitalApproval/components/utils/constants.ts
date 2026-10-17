/* ================================================================== */
/* Types used by the screens and the services                          */
/* ================================================================== */

export type PageId = 'dashboard' | 'requests' | 'inbox' | 'create' | 'search' | 'masters';
export type RequestStatus = 'Draft' | 'Pending' | 'Approved' | 'Rejected' | 'Rework';

/** A person. `id` = SharePoint site user id, `empId` = Employee ID from UserMaster. */
export interface IPerson {
  id?: number;
  name: string;
  email: string;
  empId?: string;
}

/**
 * One step of the saved approval route (stored as JSON in the request's ApprovalMatrix column).
 * STAGE NUMBER = position in the route:
 *   route[0] = Initiator (Stage 0), route[1] = Level1 (Stage 1), route[2] = Level2 (Stage 2) ...
 */
export interface IRouteStep {
  /** Approver role, e.g. "HODs / Directors". */
  name: string;
  /** Pending | Approved | Rejected | Rework */
  status: string;
  action: string;
  /** The one person assigned to this step. */
  user: IPerson;
  actedBy?: string;
  actedAt?: string;
}

/** A file attached to the SharePoint list item. */
export interface IAttachment {
  /** Name shown to the user (prefix removed). */
  name: string;
  /** Real file name in SharePoint (with prefix). */
  fileName: string;
  serverUrl: string;
  url: string;
}

/** One row of SHIFT_RequestHistory. */
export interface IHistoryEvent {
  id: number;
  title: string;
  stepNo: number;
  actionType: string; // Approval | Comment | Audit
  action: string;
  actionTakenBy: string;
  comment: string;
  previousStatus: string;
  newStatus: string;
  /** SharePoint Created date. */
  at: string;
}

/** A request as the screens use it (one SharePoint list item). */
export interface IRequest {
  /** "<listName>|<itemId>" – unique on screen (item ids repeat across lists). */
  key: string;
  itemId: number;
  /** Source SharePoint list. listName + itemId identify the request. */
  listName: string;
  /** Business Request ID, e.g. "2026/Marketing/00007". Empty for a draft. */
  id: string;
  type: string;
  dept: string;
  status: RequestStatus;
  wfType: string;
  /** Initiator employee id + name. */
  empId: string;
  empName: string;
  financial: number;
  budget: string;
  impact: string;
  costCenter: string;
  businessArea: string;
  segment: string;
  budgetHead: string;
  budgetHeadId: number;
  budgetHeadEmail: string;
  /** BudgetType column = the selected Condition. */
  requestBudgetType: string;
  subType: string;
  background: string;
  proposal: string;
  created: string;
  updated: string;
  initiatorId: number;
  /** Current stage = index in `route` (0 = initiator). */
  stage: number;
  nextApprover: IPerson | null;
  route: IRouteStep[];
  initiatorCoreFile: IAttachment | null;
  financeControllerCoreFile: IAttachment | null;
  supportingFiles: IAttachment[];
}

/** Values typed on the request form (all text, converted when saved). */
export interface IFormValues {
  empId: string;
  empName: string;
  department: string;
  requestType: string;
  requestBudgetType: string;
  subType: string;
  costCenter: string;
  businessArea: string;
  budget: string;
  financial: string;
  impact: string;
  segment: string;
  budgetHead: IPerson | null;
  background: string;
  proposal: string;
}

/** One row of Request Master. */
export interface IRequestMasterRow {
  requestType: string;
  subType: string;
  condition: string;
}

/** One row of Approval Matrix = one complete route. */
export interface IMatrixRow {
  requestType: string;
  condition: string;
  wfType: string;
  department: string;
  /** Role names of Level1..Level16 (empty levels removed). */
  levels: string[];
}

/* ================================================================== */
/* Fixed values                                                        */
/* ================================================================== */

export const NAV_ITEMS: { id: PageId; icon: string; label: string }[] = [
  { id: 'dashboard', icon: '▦', label: 'Dashboard' },
  { id: 'requests', icon: '▤', label: 'My Requests' },
  { id: 'inbox', icon: '✓', label: 'Approval Inbox' },
  { id: 'create', icon: '＋', label: 'New Request' },
  { id: 'search', icon: '⌕', label: 'Search & History' },
  { id: 'masters', icon: '⚙', label: 'Masters' }
];

export const STATUS_OPTIONS: RequestStatus[] = ['Draft', 'Pending', 'Approved', 'Rejected', 'Rework'];
/** Choice values of the Segment / BudgetAvailability columns. */
export const SEGMENTS: string[] = ['MG', 'MG Select'];
export const BUDGET_AVAILABILITY: string[] = ['Yes', 'No'];
export const BUSINESS_AREAS: string[] = ['CEM : Vehicle', 'PDC : Parts & Accessories', 'Plant Requests'];
/** Rows per page in the request tables. */
export const PAGE_SIZE = 10;

/** Name of the first (Stage 0) step of every route. */
export const INITIATOR_ROLE = 'Initiator / Proposer';
/** Only the Flexible workflow (Approval Matrix) is built. DOA Master is for the future. */
export const WF_FLEXIBLE = 'Flexible';
/** Value of the Status choice column that means "in use" (Request / Department / Approver Role Master). */
export const ACTIVE_STATUS = 'Active';

/* ------------------------------------------------------------------ */
/* SharePoint configuration – change list names / lookup settings HERE */
/* ------------------------------------------------------------------ */

/** Master + history lists. UserMaster is on the PARENT site; everything else is on the app's site. */
export const LIST_NAMES = {
  requestMaster: 'RequestMaster',
  departments: 'DepartmentMaster',
  approverRoles: 'ApproverRoleMaster',
  approvalMatrix: 'ApprovalMatrix',
  history: 'RequestHistory', // list title as shown in SharePoint
  userMaster: 'UserMaster'
  // DOA Master is reserved for a later phase and is not used.
};

/**
 * Columns that are LOOKUPS in your lists: the value is the column the lookup shows.
 * Use '' when the column is plain text in your list.
 */
export const LOOKUP_SHOWS = {
  matrixRequestType: 'RequestType',
  matrixCondition: 'Condition',
  matrixDepartment: 'Department',
  roleDepartment: 'Department'
};

/** One SharePoint list per request type. Add a type here when its list is ready. */
export const REQUEST_LISTS: { [requestType: string]: string } = {
  // 'Monthly Scheme Bulletin': 'MonthlySchemeBulletin',
  'Adhoc Schemes': 'AdhocSchemes',
  // 'Additional Budget Requirement for Calendar Year': 'AdditionalBudgetRequirementforCalendarYear',
  // 'Changes in Existing Schemes : Corporate/Loyalty/Referral': 'ChangesinExistingSchemesCorporateLoyaltyReferral',
  // 'Dealer Incentive Deviation Approvals': 'DealerIncentiveDeviationApprovals',
  // 'New Vehicle Product Pricing': 'NewVehicleProductPricing',
  // 'Vehicle Price Change Approval': 'VehiclePriceChangeApproval',
  // 'PDC Part Price Change Approval': 'PDCPartPriceChangeApproval',
  // 'Credit Billing Approvals': 'CreditBillingApprovals',
  // 'Export Vehicle Pricing Approval': 'ExportVehiclePricingApproval',
  // 'PDC Air Freight Approval': 'PDCAirFreightApproval',
  // 'CEM Budget Transfer Approvals': 'CEMBudgetTransferApprovals',
  // 'Warranty Campaign Approvals': 'WarrantyCampaignApprovals',
  // 'Dealer Scheme Payout Approvals': 'DealerSchemePayoutApprovals',
  // 'Auction Car Approvals for Bidding / Auction Sales': 'AuctionCarApprovalsforBiddingAuctionSales'
};
