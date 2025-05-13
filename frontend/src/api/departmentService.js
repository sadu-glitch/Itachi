import { apiGet, apiPost } from './index';

// Get all departments data
export const getDepartments = () => {
  return apiGet('data')
    .then(data => data.departments || { departments: [] });
};

// Get all regions data
export const getAllRegions = () => {
  return apiGet('data')
    .then(data => data.regions || { regions: [] });
};

// Get regions for a specific department
export const getRegionsForDepartment = (departmentId) => {
  return getAllRegions()
    .then(data => {
      return {
        regions: data.regions.filter(region => 
          region.department === departmentId
        )
      };
    });
};

// Get department by ID (constructs the department from data as needed)
export const getDepartmentById = (departmentId) => {
  return getDepartments()
    .then(data => {
      const department = data.departments.find(d => d.name === departmentId);
      if (!department) {
        throw new Error(`Department with ID ${departmentId} not found`);
      }
      return department;
    });
};

export default {
  getDepartments,
  getAllRegions,
  getRegionsForDepartment,
  getDepartmentById
};