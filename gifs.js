/* GIF-Bildquelle über die GIPHY-API. Ausgewähltes GIF wird als Standbild
 * (erster Frame) auf ein Canvas gezeichnet und wie jedes andere Trägerbild
 * behandelt (siehe selectedGifCanvas in app.js). */

const gifSearchInput = document.getElementById("gif-search-input");
const btnGifSearch = document.getElementById("btn-gif-search");
const gifResultsEl = document.getElementById("gif-results");
const gifErrorEl = document.getElementById("gif-error");

function showGifError(msg) {
  gifErrorEl.textContent = "⚠️ " + msg;
  gifErrorEl.classList.remove("hidden");
}

function clearGifError() {
  gifErrorEl.classList.add("hidden");
}

async function searchGifs(query) {
  const url =
    "https://api.giphy.com/v1/gifs/search" +
    `?q=${encodeURIComponent(query)}&api_key=${GIPHY_API_KEY}&limit=24&rating=g`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("GIF-Suche fehlgeschlagen (" + response.status + ").");
  }
  const data = await response.json();
  return data.data || [];
}

btnGifSearch.addEventListener("click", async () => {
  clearGifError();
  const query = gifSearchInput.value.trim();
  if (!query) return showGifError("Bitte einen Suchbegriff eingeben.");

  gifResultsEl.innerHTML = "";
  btnGifSearch.disabled = true;
  try {
    const results = await searchGifs(query);
    if (results.length === 0) {
      return showGifError("Keine GIFs gefunden.");
    }
    for (const result of results) {
      const preview = result.images?.fixed_width_small?.url || result.images?.original?.url;
      const full = result.images?.original?.url || preview;
      if (!preview || !full) continue;

      const thumb = document.createElement("img");
      thumb.src = preview;
      thumb.alt = result.title || "GIF";
      thumb.className = "gif-thumb";
      thumb.addEventListener("click", () => selectGif(full, thumb));
      gifResultsEl.appendChild(thumb);
    }
  } catch (err) {
    showGifError(err.message || String(err));
  } finally {
    btnGifSearch.disabled = false;
  }
});

gifSearchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    btnGifSearch.click();
  }
});

async function selectGif(gifUrl, thumbEl) {
  clearGifError();
  document.querySelectorAll(".gif-thumb.selected").forEach((el) => el.classList.remove("selected"));
  thumbEl.classList.add("selected");

  try {
    const img = await loadImageCrossOrigin(gifUrl);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext("2d").drawImage(img, 0, 0);
    // Canvas-Zugriff testen (schlägt fehl, falls die Quelle kein CORS erlaubt).
    canvas.getContext("2d").getImageData(0, 0, 1, 1);

    selectedGifCanvas = resizeCanvasToMax(canvas, MAX_CARRIER_DIMENSION);
    previewCanvasHide.width = selectedGifCanvas.width;
    previewCanvasHide.height = selectedGifCanvas.height;
    previewCanvasHide.getContext("2d").drawImage(selectedGifCanvas, 0, 0);
    refreshPreview();
  } catch (err) {
    selectedGifCanvas = null;
    showGifError("Dieses GIF kann nicht verwendet werden, bitte ein anderes wählen.");
  }
}

function loadImageCrossOrigin(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}
