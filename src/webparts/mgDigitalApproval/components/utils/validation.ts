import { IFormValues } from './constants';

function isBlank(value: string): boolean {
  return !value || !value.trim();
}

/** Checks for Save as Draft. Returns the list of problems (empty list = OK). */
export function checkDraft(values: IFormValues): string[] {
  const problems: string[] = [];
  if (isBlank(values.requestType)) {
    problems.push('Request Type is required.');
  }
  if (isBlank(values.department)) {
    problems.push('Department / Function is required.');
  }
  if (!isBlank(values.financial) && (isNaN(Number(values.financial)) || Number(values.financial) < 0)) {
    problems.push('Financial Impact must be a number of 0 or more.');
  }
  if (!isBlank(values.impact) && isNaN(Number(values.impact))) {
    problems.push('Impact vs Budget must be a number.');
  }
  return problems;
}

/**
 * Checks for Submit. Returns the list of problems (empty list = OK).
 * hasSubTypes / hasConditions: the Request Master has sub types / conditions for the chosen request type.
 * hasCoreFile: a core file is selected now, or one is already saved.
 */
export function checkSubmit(values: IFormValues, hasSubTypes: boolean, hasConditions: boolean, hasCoreFile: boolean): string[] {
  const problems = checkDraft(values);
  const required: { label: string; value: string }[] = [
    { label: 'Requester Employee ID', value: values.empId },
    { label: 'Requester Name', value: values.empName },
    { label: 'Cost Center', value: values.costCenter },
    { label: 'Business Area', value: values.businessArea },
    { label: 'Budget Availability', value: values.budget },
    { label: 'Financial Impact', value: values.financial },
    { label: 'Segment', value: values.segment },
    { label: 'Budget Head', value: values.budgetHead ? values.budgetHead.email : '' },
    { label: 'Background', value: values.background },
    { label: 'Requirement / Proposal', value: values.proposal }
  ];
  if (hasSubTypes) {
    required.push({ label: 'Sub Request Type', value: values.subType });
  }
  if (hasConditions) {
    required.push({ label: 'Request Budget Type', value: values.requestBudgetType });
  }
  required.forEach((field) => {
    if (isBlank(field.value)) {
      problems.push(field.label + ' is required.');
    }
  });
  if (!hasCoreFile) {
    problems.push('Core File Attachment – Initiator is required.');
  }
  return problems;
}
