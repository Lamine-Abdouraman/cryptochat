/* Umschalten zwischen dunklem (Standard) und hellem/beige Hintergrund.
 * Die Wahl wird lokal gespeichert (localStorage), kein Server beteiligt. */

const themeToggleBtn = document.getElementById("btn-theme-toggle");

function applyTheme(theme) {
  if (theme === "light") {
    document.documentElement.setAttribute("data-theme", "light");
    themeToggleBtn.textContent = "🌙";
    themeToggleBtn.title = "Dunkler Hintergrund";
  } else {
    document.documentElement.removeAttribute("data-theme");
    themeToggleBtn.textContent = "☀️";
    themeToggleBtn.title = "Heller Hintergrund";
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
