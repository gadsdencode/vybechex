// Constants for storage keys
const AUTH_TOKEN_KEY = 'auth_token';
const USER_ID_KEY = 'user_id';
const USER_DATA_KEY = 'user_data';

interface UserData {
  id: number;
  username: string;
  name: string | null;
  avatar?: string;
  isGroupCreator: boolean;
}

// Get the authentication token from localStorage
export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  } catch (error) {
    console.error('Error accessing auth token:', error);
    return null;
  }
}

// Get the user ID from localStorage
export function getUserId(): number | null {
  try {
    const userId = localStorage.getItem(USER_ID_KEY);
    const parsedId = userId ? parseInt(userId, 10) : null;
    return !isNaN(parsedId) ? parsedId : null;
  } catch (error) {
    console.error('Error accessing user ID:', error);
    return null;
  }
}

// Get the full user data from localStorage
export function getUserData(): UserData | null {
  try {
    const userData = localStorage.getItem(USER_DATA_KEY);
    return userData ? JSON.parse(userData) : null;
  } catch (error) {
    console.error('Error accessing user data:', error);
    return null;
  }
}

// Set the authentication token
export function setAuthToken(token: string): void {
  try {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  } catch (error) {
    console.error('Error setting auth token:', error);
  }
}

// Set the user ID
export function setUserId(id: number): void {
  try {
    localStorage.setItem(USER_ID_KEY, id.toString());
  } catch (error) {
    console.error('Error setting user ID:', error);
  }
}

// Set the full user data
export function setUserData(data: UserData): void {
  try {
    localStorage.setItem(USER_DATA_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('Error setting user data:', error);
  }
}

// Clear all auth data (for logout)
export function clearAuthData(): void {
  try {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(USER_ID_KEY);
    localStorage.removeItem(USER_DATA_KEY);
  } catch (error) {
    console.error('Error clearing auth data:', error);
  }
}
