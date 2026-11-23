/**
 * SAHAYAK B2B — Toast Notification System (XSS-safe, click-to-dismiss)
 */

export function showToast(message, type = 'info', duration = 4000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.style.pointerEvents = 'auto';
  toast.style.cursor = 'pointer';

  const iconEl = document.createElement('span');
  iconEl.textContent = icons[type] || icons.info;
  const textEl = document.createElement('span');
  textEl.textContent = String(message ?? '');
  toast.appendChild(iconEl);
  toast.appendChild(textEl);

  const dismiss = () => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100px)';
    toast.style.transition = 'all 0.25s ease';
    setTimeout(() => toast.remove(), 250);
  };
  toast.addEventListener('click', dismiss);

  container.appendChild(toast);
  setTimeout(dismiss, duration);
}
