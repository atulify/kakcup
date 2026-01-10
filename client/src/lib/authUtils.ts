export function isUnauthorizedError(error: Error): boolean {
  return error.message.includes("401") || error.message.includes("Unauthorized");
}

export function isAdminError(error: Error): boolean {
  return /^403: .*Admin access required/.test(error.message);
}