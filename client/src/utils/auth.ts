import { apiRequest } from "@/lib/queryClient";

export async function handleLogout() {
  try {
    await apiRequest('/api/auth/logout', 'POST');
    // Redirect to select year page after logout
    window.location.href = '/select-year';
  } catch (error) {
    console.error('Logout error:', error);
    // Even if logout fails, redirect to select year page to clear state
    window.location.href = '/select-year';
  }
}