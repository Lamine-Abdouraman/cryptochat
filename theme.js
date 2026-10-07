/* Umschalten zwischen dunklem (Standard) und hellem Design.
 * Die Wahl wird lokal gespeichert (localStorage), kein Server beteiligt. */

const themeToggleBtn = document.getElementById("btn-theme-toggle");

const ICON_SUN =
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>';
const ICON_MOON =
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';

function applyTheme(theme) {
  if (theme === "light") {
    document.documentElement.setAttribute("data-theme", "light");
    themeToggleBtn.innerHTML = ICON_MOON;
    themeToggleBtn.title = "Dunkles Design";
  } else {
    document.documentElement.removeAttribute("data-theme");
    themeToggleBtn.innerHTML = ICON_SUN;
    themeToggleBtn.title = "Helles Design";
  }
}

applyTheme(localStorage.getItem("cryptochat-theme") === "light" ? "light" : "dark");

themeToggleBtn.addEventListener("click", () => {
  const isLight = document.documentElement.getAttribute("data-theme") === "light";
  const next = isLight ? "dark" : "light";
  applyTheme(next);
  try {
    localStorage.setItem("cryptochat-theme", next);
  } catch (e) {}
});
