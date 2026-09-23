// Initialize theme immediately on page load
const initTheme = () => {
  const saved = localStorage.getItem('theme')
  const isDark = saved === 'dark'
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')
  return isDark
}

// Set theme and persist to localStorage
const setTheme = (isDark) => {
  localStorage.setItem('theme', isDark ? 'dark' : 'light')
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')
}

export { initTheme, setTheme }