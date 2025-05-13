/**
 * API Service for dashboard data
 * Centralizes all API calls in one place
 */

/**
 * Normalize API URL to prevent double slashes
 * @param {string} baseApiUrl - The base URL for API endpoints
 * @returns {string} - Normalized API URL without trailing slash
 */
const normalizeApiUrl = (baseApiUrl) => {
  if (!baseApiUrl) return '';
  return baseApiUrl.endsWith('/') ? baseApiUrl.slice(0, -1) : baseApiUrl;
};

/**
 * Base API configuration
 * @param {string} baseApiUrl - The base URL for API endpoints
 * @returns {Object} - API configuration object
 */
const createApiConfig = (baseApiUrl) => {
  const apiUrl = normalizeApiUrl(baseApiUrl) || 'http://localhost:5000';
  
  return {
    apiUrl,
    headers: {
      'Content-Type': 'application/json'
    }
  };
};

/**
 * Dashboard data API service
 */
export const dashboardApi = {
  /**
   * Get dashboard data (departments and regions)
   * @param {string} baseApiUrl - Base API URL
   * @returns {Promise<Object>} - Promise resolving to dashboard data
   */
  async getDashboardData(baseApiUrl) {
    const config = createApiConfig(baseApiUrl);
    
    const response = await fetch(`${config.apiUrl}/api/data`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch dashboard data: ${response.status} ${response.statusText}`);
    }
    
    return response.json();
  },
  
  /**
   * Get transactions for a department and optionally a region
   * @param {string} baseApiUrl - Base API URL
   * @param {string} department - Department name
   * @param {string|null} region - Optional region name
   * @returns {Promise<Object>} - Promise resolving to transactions data
   */
  async getTransactions(baseApiUrl, department, region = null) {
    const config = createApiConfig(baseApiUrl);
    
    let url = `${config.apiUrl}/api/transactions?department=${encodeURIComponent(department)}`;
    
    if (region) {
      url += `&region=${encodeURIComponent(region)}`;
    }
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch transactions: ${response.status} ${response.statusText}`);
    }
    
    return response.json();
  },
  
  /**
   * Assign a parked measure to a region/district
   * @param {string} baseApiUrl - Base API URL
   * @param {string} bestellnummer - Bestellnummer of the measure
   * @param {string} region - Region name
   * @param {string} district - District name
   * @returns {Promise<Object>} - Promise resolving to assignment result
   */
  async assignMeasure(baseApiUrl, bestellnummer, region, district) {
    const config = createApiConfig(baseApiUrl);
    
    const response = await fetch(`${config.apiUrl}/api/assign-measure`, {
      method: 'POST',
      headers: config.headers,
      body: JSON.stringify({
        bestellnummer,
        region,
        district
      })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to assign measure: ${response.status} ${response.statusText}`);
    }
    
    return response.json();
  },
  
  /**
   * Update budget allocation
   * @param {string} baseApiUrl - Base API URL
   * @param {string} department - Department name
   * @param {number} amount - Budget amount
   * @returns {Promise<Object>} - Promise resolving to budget update result
   */
  async updateBudget(baseApiUrl, department, amount) {
    const config = createApiConfig(baseApiUrl);
    
    const response = await fetch(`${config.apiUrl}/api/budget-allocation`, {
      method: 'POST',
      headers: config.headers,
      body: JSON.stringify({
        departments: {
          [department]: {
            allocated_budget: parseFloat(amount)
          }
        }
      })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to update budget: ${response.status} ${response.statusText}`);
    }
    
    return response.json();
  },
  
  /**
   * Get statistics data
   * @param {string} baseApiUrl - Base API URL
   * @returns {Promise<Object>} - Promise resolving to statistics data
   */
  async getStatistics(baseApiUrl) {
    const config = createApiConfig(baseApiUrl);
    
    const response = await fetch(`${config.apiUrl}/api/statistics`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch statistics: ${response.status} ${response.statusText}`);
    }
    
    return response.json();
  }
};