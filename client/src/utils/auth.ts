// Store user data in localStorage for persistence
const USER_ID_KEY = 'user_id';
const USER_DATA_KEY = 'user_data';

interface UserData {
  id: number;
  username: string;
  name: string | null;
  avatar?: string;
  isGroupCreator: boolean;
  quizCompleted: boolean;
}

// Get the user ID from localStorage
export function getUserId(): number | null {
  try {
    const userId = localStorage.getItem(USER_ID_KEY);
    return userId ? parseInt(userId, 10) : null;
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

// Set the user ID
export function setUserId(id: number | undefined | null): void {
  try {
    if (id === undefined || id === null) {
      localStorage.removeItem(USER_ID_KEY);
      return;
    }
    localStorage.setItem(USER_ID_KEY, id.toString());
  } catch (error) {
    console.error('Error setting user ID:', error);
  }
}

// Set the full user data
export function setUserData(data: Partial<UserData> | null): void {
  try {
    if (!data) {
      localStorage.removeItem(USER_DATA_KEY);
      return;
    }
    const currentData = getUserData();
    const newData = {
      ...currentData,
      ...data,
      id: data.id || currentData?.id,
      username: data.username || currentData?.username,
      name: data.name || currentData?.name || data.username,
      isGroupCreator: data.isGroupCreator ?? currentData?.isGroupCreator ?? false,
      quizCompleted: data.quizCompleted ?? currentData?.quizCompleted ?? false
    };
    localStorage.setItem(USER_DATA_KEY, JSON.stringify(newData));
  } catch (error) {
    console.error('Error setting user data:', error);
  }
}

// Clear all auth data (for logout)
export function clearAuthData(): void {
  try {
    localStorage.removeItem(USER_ID_KEY);
    localStorage.removeItem(USER_DATA_KEY);
  } catch (error) {
    console.error('Error clearing auth data:', error);
  }
}