/**
 * Formats an ISO date string into a Brazilian format (DD/MM/YYYY).
 * 
 * @param {string|Date} dateString - The date to format
 * @returns {string} The formatted date string
 */
export function formatDateBR(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  
  // Check if date is valid
  if (isNaN(date.getTime())) return '-';

  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

/**
 * Formats an ISO date string into Brazilian format with time (DD/MM/YYYY HH:MM:SS).
 * 
 * @param {string|Date} dateString - The date to format
 * @returns {string} The formatted date and time string
 */
export function formatDateTimeBR(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  
  // Check if date is valid
  if (isNaN(date.getTime())) return '-';

  const dateStr = date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
  
  const timeStr = date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  return `${dateStr} ${timeStr}`;
}