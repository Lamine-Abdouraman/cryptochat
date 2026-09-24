/* "Foto suchen"-Bildquelle über die Pixabay-API (echte Standbilder statt
 * GIFs) – verlustfrei nutzbar, keine Animations-/Frame-Problematik. */

const stockSearchInput = document.getElementById("stock-search-input");
const btnStockSearch = document.getElementById("btn-stock-search");
const stockResultsEl = document.getElementById("stock-results");
const stockErrorEl = document.getElementById("stock-error");

function showStockError(msg) {
  stockErrorEl.textContent = "⚠️ " + msg;
  stockErrorEl.classList.remove("hidden");
}

function clearStockError() {
  stockErrorEl.classList.add("hidden");
}

async function searchStockImages(query) {
  const url =
    "https://pixabay.com/api/" +
    `?key=${PIXABAY_API_KEY}&q=${encodeURIComponent(query)}&image_type=photo&per_page=24&safesearch=true`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Bildsuche fehlgeschlagen (" + response.status + ").");
  }
  const data = await response.json();
  return data.hits || [];
}

btnStockSearch.addEventListener("click", async () => {
  clearStockError();
  const query = stockSearchInput.value.trim();
  if (!query) return showStockError("Bitte einen Suchbegriff eingeben.");

  stockResultsEl.innerHTML = "";
  btnStockSearch.disabled = true;
  try {
    const results = await searchStockImages(query);
    if (results.length === 0) {
      return showStockError("Keine Bilder gefunden.");
    }
    for (const result of results) {
      const preview = result.previewURL;
      const full = result.webformatURL || result.previewURL;
      if (!preview || !full) continue;

      const thumb = document.createElement("img");
      thumb.src = preview;
      thumb.alt = result.tags || "Foto";
      thumb.className = "gif-thumb";
      thumb.addEventListener("click", () => selectStockImage(full, thumb));
      stockResultsEl.appendChild(thumb);
    }
  } catch (err) {
    showStockError(err.message || String(err));
  } finally {
    btnStockSearch.disabled = false;
  }
});

stockSearchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    btnStockSearch.click();
  }
});

async function selectStockImage(imageUrl, thumbEl) {
  clearStockError();
  document.querySelectorAll("#stock-results .gif-thumb.selected").forEach((el) => el.classList.remove("selected"));
  thumbEl.classList.add("selected");

  try {
    const img = await loadImageCrossOrigin(imageUrl);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext("2d").drawImage(img, 0, 0);
    // Canvas-Zugriff testen (schlägt fehl, falls die Quelle kein CORS erlaubt).
    canvas.getContext("2d").getImageData(0, 0, 1, 1);

    selectedStockCanvas = resizeCanvasToMax(canvas, MAX_CARRIER_DIMENSION);
    previewCanvasHide.width = selectedStockCanvas.width;
    previewCanvasHide.height = selectedStockCanvas.height;
    previewCanvasHide.getContext("2d").drawImage(selectedStockCanvas, 0, 0);
    refreshPreview();
  } catch (err) {
    selectedStockCanvas = null;
    showStockError("Dieses Bild kann nicht verwendet werden, bitte ein anderes wählen.");
  }
}
