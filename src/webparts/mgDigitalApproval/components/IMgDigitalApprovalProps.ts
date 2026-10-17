export interface IMgDigitalApprovalProps {
  description: string;
  isDarkTheme: boolean;
  environmentMessage: string;
  hasTeamsContext: boolean;
  /** Same value as `userName` (kept for the default SPFx component). */
  userDisplayName: string;
  currentSPContext: any;
  context?: any;
  /** Same value as `userId` (kept for existing code). */
  id: number;

  /* Logged-in user – set in MgDigitalApprovalWebPart.ts */
  /** SharePoint user id (site user information list). */
  userId: number;
  /** Display name. */
  userName: string;
  userEmail: string;
  userLoginName: string;
  /** EmployeeId from the parent site's UserMaster list ('' if not found). */
  employeeId: string;
  /** Set when the UserMaster lookup failed (shown on the New Request page). */
  employeeLookupError?: string;
}
