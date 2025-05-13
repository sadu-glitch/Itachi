import { apiGet, apiPost } from './index';

// Get all parked measures awaiting assignment
export const getParkedMeasures = () => {
  return apiGet('data')
    .then(data => data.awaiting_assignment || {});
};

// Assign a single parked measure to a region and district
export const assignMeasure = (assignment) => {
  return apiPost('assign-measure', assignment);
};

// Bulk assign multiple parked measures
export const bulkAssignMeasures = (assignments) => {
  return apiPost('bulk-assign-measures', assignments);
};

// Trigger data processing
export const triggerProcessing = () => {
  return apiPost('process', {});
};

export default {
  getParkedMeasures,
  assignMeasure,
  bulkAssignMeasures,
  triggerProcessing
};