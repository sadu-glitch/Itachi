// API configuration
// Default to localhost for development, but this will be overridden by the apiConfig
let API_BASE_URL = 'http://localhost:5000/api';

// Function to initialize the API with the correct base URL
export const initializeApi = (apiConfig) => {
  if (apiConfig && apiConfig.baseUrl) {
    API_BASE_URL = `${apiConfig.baseUrl}/api`;
    console.log('API initialized with base URL:', API_BASE_URL);
  }
};

// Helper function for API requests
const fetchWithErrorHandling = async (url, options = {}) => {
  try {
    const response = await fetch(url, options);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Request failed with status ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('API request error:', error);
    throw error;
  }
};

// Generic API request methods
export const apiGet = (endpoint) => {
  return fetchWithErrorHandling(`${API_BASE_URL}/${endpoint}`);
};

export const apiPost = (endpoint, data) => {
  return fetchWithErrorHandling(`${API_BASE_URL}/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
};

export default {
  initializeApi,
  apiGet,
  apiPost
};