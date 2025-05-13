import { apiGet, apiPost } from './index';

// Get all budget allocations
export const getBudgetAllocations = () => {
  return apiGet('budget-allocation');
};

// Update budget allocations
export const updateBudgetAllocations = (budgetData) => {
  return apiPost('budget-allocation', budgetData);
};

// Helper function to update a single department's budget
export const updateDepartmentBudget = async (departmentId, amount) => {
  const currentBudgets = await getBudgetAllocations();
  
  // Create a new budget object with the updated department
  const updatedBudgets = {
    ...currentBudgets,
    departments: {
      ...currentBudgets.departments,
      [departmentId]: {
        allocated_budget: amount
      }
    }
  };
  
  return updateBudgetAllocations(updatedBudgets);
};

// Helper function to update a single region's budget
export const updateRegionBudget = async (departmentId, regionId, amount) => {
  const currentBudgets = await getBudgetAllocations();
  const regionKey = `${departmentId}|${regionId}`;
  
  // Create a new budget object with the updated region
  const updatedBudgets = {
    ...currentBudgets,
    regions: {
      ...currentBudgets.regions,
      [regionKey]: {
        allocated_budget: amount
      }
    }
  };
  
  return updateBudgetAllocations(updatedBudgets);
};

export default {
  getBudgetAllocations,
  updateBudgetAllocations,
  updateDepartmentBudget,
  updateRegionBudget
};