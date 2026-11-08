// Device profiles for your readers
const DEVICE_PROFILES = [
  {
    id: "kobo-libra-2",
    name: "Kobo Libra 2",
    width: 1264,
    height: 1680
  },
  {
    id: "xteink-x3",
    name: "XTEink X3",
    width: 600,  // adjust to actual resolution
    height: 800
  },
  {
    id: "xteink-x4",
    name: "XTEink X4",
    width: 600,  // adjust to actual resolution
    height: 800
  },
  {
    id: "xteink-x4-pro",
    name: "XTEink X4 Pro",
    width: 600,  // adjust to actual resolution
    height: 800
  }
];

// UI elements
const pdfInput = document.getElementById("pdf-input");
const fileNameSpan = document.getElementById("file-name");
const deviceSelect = document.getElementById("device-select");
const fitSelect = document.getElementById("fit-select");
const exportButton = document.getElementById("export-button");
const thumbnailsContainer = document.getElementById("thumbnails");
const placeholder = document.getElementById("placeholder");

// App state
let currentFile = null;
let currentPdf = null;          // pdf.js document
let pageCount = 0;
let selectedPages = [];         // array of page numbers (1-based)

// Initialize device dropdown
function initDevices() {
  DEVICE_PROFILES.forEach((d) => {
    const opt = document.createElement("option");
    opt.value = d.id;
    opt.textContent = `${d.name} (${d.width}×${d.height})`;
    deviceSelect.appendChild(opt);
  });
}
initDevices();

function getCurrentDevice() {
  const id = deviceSelect.value || DEVICE_PROFILES[0].id;
  return DEVICE_PROFILES.find((d) => d.id === id) || DEVICE_PROFILES[0];
}

// PDF loading
async function loadPdfFromFile(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);

    const loadingTask = pdfjsLib.getDocument({ data: uint8 });
    const pdf = await loadingTask.promise;

    return pdf;
  } catch (err) {
    console.error("Error inside loadPdfFromFile:", err);
    throw err;
  }
}


// Thumbnail rendering
async function renderThumbnail(pdf, pageNumber, thumbWidth = 200) {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1.0 });
  const scale = thumbWidth / viewport.width;
  const scaledViewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = scaledViewport.width;
  canvas.height = scaledViewport.height;
  const ctx = canvas.getContext("2d");

  await page
    .render({
      canvasContext: ctx,
      viewport: scaledViewport
    })
    .promise;

  return canvas.toDataURL("image/png");
}

// Full-resolution rendering with grayscale + contrast
async function renderPageForDevice(pdf, pageNumber, device, fitMode = "fit") {
  const page = await pdf.getPage(pageNumber);
  const targetWidth = device.width;
  const targetHeight = device.height;

  const viewport = page.getViewport({ scale: 1.0 });
  const pageAspect = viewport.width / viewport.height;
  const targetAspect = targetWidth / targetHeight;

  let renderWidth = targetWidth;
  let renderHeight = targetHeight;

  if (fitMode === "fit") {
    if (pageAspect > targetAspect) {
      renderWidth = targetWidth;
      renderHeight = Math.round(targetWidth / pageAspect);
    } else {
      renderHeight = targetHeight;
      renderWidth = Math.round(targetHeight * pageAspect);
    }
  } else if (fitMode === "fill") {
    if (pageAspect > targetAspect) {
      renderHeight = targetHeight;
      renderWidth = Math.round(targetHeight * pageAspect);
    } else {
      renderWidth = targetWidth;
      renderHeight = Math.round(targetWidth / pageAspect);
    }
  }

  const scale = renderWidth / viewport.width;
  const scaledViewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, targetWidth, targetHeight);

  const offsetX = Math.round((targetWidth - renderWidth) / 2);
  const offsetY = Math.round((targetHeight - renderHeight) / 2);

  await page
    .render({
      canvasContext: ctx,
      viewport: scaledViewport,
      transform: [1, 0, 0, 1, offsetX, offsetY]
    })
    .promise;

  // Grayscale + slight contrast boost
  const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    let lum = 0.3 * r + 0.59 * g + 0.11 * b; // luminance

    lum = lum / 255;
    const contrast = 1.15; // tweak to taste
    lum = ((lum - 0.5) * contrast + 0.5) * 255;
    lum = Math.max(0, Math.min(255, lum));

    data[i] = data[i + 1] = data[i + 2] = lum;
  }
  ctx.putImageData(imageData, 0, 0);

  return canvas;
}

// UI helpers
function clearThumbnails() {
  thumbnailsContainer.innerHTML = "";
  thumbnailsContainer.classList.add("hidden");
  placeholder.classList.remove("hidden");
}

function updateExportButton() {
  exportButton.disabled = !currentPdf || selectedPages.length === 0;
  if (selectedPages.length > 0) {
    exportButton.textContent = `Export ${selectedPages.length} page${
      selectedPages.length === 1 ? "" : "s"
    }`;
  } else {
    exportButton.textContent = "Export selected pages";
  }
}

function togglePageSelection(pageNumber, cardElement) {
  const idx = selectedPages.indexOf(pageNumber);
  if (idx === -1) {
    selectedPages.push(pageNumber);
    cardElement.classList.add("selected");
  } else {
    selectedPages.splice(idx, 1);
    cardElement.classList.remove("selected");
  }
  updateExportButton();
}

// Build thumbnail grid for the current PDF
async function buildThumbnails() {
  if (!currentPdf) return;

  thumbnailsContainer.innerHTML = "";
  thumbnailsContainer.classList.remove("hidden");
  placeholder.classList.add("hidden");

  pageCount = currentPdf.numPages;
  selectedPages = [];
  updateExportButton();

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
    const card = document.createElement("div");
    card.className = "thumb-card";

    const imageWrapper = document.createElement("div");
    imageWrapper.className = "thumb-image";

    const footer = document.createElement("div");
    footer.className = "thumb-footer";

    const label = document.createElement("span");
    label.textContent = `Page ${pageNumber}`;

    const badge = document.createElement("span");
    badge.className = "selected-badge";
    badge.textContent = ""; // filled when selected

    footer.appendChild(label);
    footer.appendChild(badge);

    const placeholderDiv = document.createElement("div");
    placeholderDiv.className = "thumb-placeholder";
    placeholderDiv.textContent = `Page ${pageNumber}`;
    imageWrapper.appendChild(placeholderDiv);

    card.appendChild(imageWrapper);
    card.appendChild(footer);
    thumbnailsContainer.appendChild(card);

    // Click to select/deselect
    card.addEventListener("click", () => {
      togglePageSelection(pageNumber, card);
      badge.textContent = selectedPages.includes(pageNumber) ? "Selected" : "";
    });

    // Render the actual thumbnail image
    try {
      const dataUrl = await renderThumbnail(currentPdf, pageNumber, 200);
      const img = document.createElement("img");
      img.src = dataUrl;
      img.alt = `Page ${pageNumber}`;
      imageWrapper.innerHTML = "";
      imageWrapper.appendChild(img);
    } catch (err) {
      console.error("Thumbnail render failed for page", pageNumber, err);
    }
  }
}

// File input handler
pdfInput.addEventListener("change", async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  currentFile = file;
  fileNameSpan.textContent = file.name;
  clearThumbnails();
  updateExportButton();

  try {
    currentPdf = await loadPdfFromFile(file);
    await buildThumbnails();
  } catch (err) {
    console.error("Failed to load PDF", err);
    alert("Failed to load PDF. See console for details.");
    currentPdf = null;
    clearThumbnails();
    fileNameSpan.textContent = "";
  }
});

// Export button handler
exportButton.addEventListener("click", async () => {
  if (!currentPdf || selectedPages.length === 0) return;

  exportButton.disabled = true;
  exportButton.textContent = "Exporting…";

  const device = getCurrentDevice();
  const fitMode = fitSelect.value || "fit";

  try {
    const zip = new JSZip();

    // Sort pages so filenames come out in order
    const pagesToRender = [...selectedPages].sort((a, b) => a - b);

    for (const pageNumber of pagesToRender) {
      const canvas = await renderPageForDevice(
        currentPdf,
        pageNumber,
        device,
        fitMode
      );
      const blob = await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/png")
      );

      zip.file(`${device.id}-page-${pageNumber}.png`, blob);
    }

    const zipBlob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${device.id}-sleep-screens.zip`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error("Export failed", err);
    alert("Export failed. See console for details.");
  } finally {
    updateExportButton();
  }
});
