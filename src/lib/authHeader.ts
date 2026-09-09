export function getAuthHeaders(): Record<string, string> {
  try {
    const directToken = localStorage.getItem('auth_token');
    if (directToken) {
      return { Authorization: `Bearer ${directToken}` };
    }
    const userStr = localStorage.getItem('user');
    if (userStr) {
      const parsed = JSON.parse(userStr);
      if (parsed?.token) {
        return { Authorization: `Bearer ${parsed.token}` };
      }
    }
  } catch {
    // Ignore storage parse error
  }
  return {};
}
