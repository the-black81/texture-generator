const fileInput = document.getElementById('fileInput');
const dropZone = document.getElementById('dropZone');
const dropContent = document.getElementById('dropContent');
const previewContainer = document.getElementById('previewContainer');
const imagePreview = document.getElementById('imagePreview');
const removeImage = document.getElementById('removeImage');
const processBtn = document.getElementById('processBtn');
const assetNameInput = document.getElementById('assetName');
const canvas = document.getElementById('renderCanvas');
const ctx = canvas.getContext('2d');
const loadingOverlay = document.getElementById('loadingOverlay');
const loadingText = document.getElementById('loadingText');

let loadedImage = null;
let currentActiveTab = 'basecolor';
let processedMaps = {};

// Eventos de arrastrar y soltar
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.style.borderColor = '#e67e22'; });
dropZone.addEventListener('dragleave', () => { dropZone.style.borderColor = '#2c2c2c'; });
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = '#2c2c2c';
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) handleFile(e.target.files[0]);
});

removeImage.addEventListener('click', (e) => {
    e.stopPropagation();
    loadedImage = null;
    fileInput.value = '';
    previewContainer.classList.add('hidden');
    dropContent.classList.remove('hidden');
    processBtn.disabled = true;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
});

function handleFile(file) {
    if (!file.type.startsWith('image/')) return alert('Por favor, selecciona un archivo de imagen válido.');
    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            loadedImage = img;
            imagePreview.src = event.target.result;
            dropContent.classList.add('hidden');
            previewContainer.classList.remove('hidden');
            processBtn.disabled = false;
            generateMapsPreview();
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

// Pestañas de previsualización
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        currentActiveTab = e.target.getAttribute('data-map');
        renderActiveTabPreview();
    });
});

async function generateMapsPreview() {
    if (!loadedImage) return;
    loadingOverlay.classList.remove('hidden');
    loadingText.textContent = 'Calculando mapas PBR...';

    // Usar una resolución estándar eficiente para web (ej: 1024x1024)
    const size = 1024;
    canvas.width = size;
    canvas.height = size;

    // 1. Base Color
    ctx.drawImage(loadedImage, 0, 0, size, size);
    processedMaps.basecolor = canvas.toDataURL('image/jpeg', 0.9);

    // 2. Grayscale base for filters
    const imgData = ctx.getImageData(0, 0, size, size);
    const data = imgData.data;

    // Roughness Map (Invertido y con contraste)
    const roughnessCanvas = document.createElement('canvas');
    roughnessCanvas.width = size;
    roughnessCanvas.height = size;
    const rCtx = roughnessCanvas.getContext('2d');
    rCtx.drawImage(loadedImage, 0, 0, size, size);
    const rData = rCtx.getImageData(0, 0, size, size);
    for (let i = 0; i < rData.data.length; i += 4) {
        let gray = (rData.data[i] * 0.299 + rData.data[i+1] * 0.587 + rData.data[i+2] * 0.114);
        let rough = 255 - gray; // Invertir para rugosidad
        rData.data[i] = rough; rData.data[i+1] = rough; rData.data[i+2] = rough;
    }
    rCtx.putImageData(rData, 0, 0);
    processedMaps.roughness = roughnessCanvas.toDataURL('image/jpeg', 0.9);

    // Height / Displacement Map
    const heightCanvas = document.createElement('canvas');
    heightCanvas.width = size;
    heightCanvas.height = size;
    const hCtx = heightCanvas.getContext('2d');
    hCtx.drawImage(loadedImage, 0, 0, size, size);
    const hData = hCtx.getImageData(0, 0, size, size);
    for (let i = 0; i < hData.data.length; i += 4) {
        let gray = (hData.data[i] * 0.299 + hData.data[i+1] * 0.587 + hData.data[i+2] * 0.114);
        hData.data[i] = gray; hData.data[i+1] = gray; hData.data[i+2] = gray;
    }
    hCtx.putImageData(hData, 0, 0);
    processedMaps.height = heightCanvas.toDataURL('image/jpeg', 0.9);

    // Ambient Occlusion (AO - Similar a height suavizado)
    processedMaps.ao = processedMaps.height;

    // Normal Map simulado por gradientes Sobel simplificados
    const normalCanvas = document.createElement('canvas');
    normalCanvas.width = size;
    normalCanvas.height = size;
    const nCtx = normalCanvas.getContext('2d');
    nCtx.drawImage(loadedImage, 0, 0, size, size);
    const nImgData = nCtx.getImageData(0, 0, size, size);
    const nPixels = nImgData.data;
    const outNormal = nCtx.createImageData(size, size);
    const outData = outNormal.data;
    const strength = 3.0;

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            let idx = (y * size + x) * 4;
            let xLeft = (x > 0 ? (y * size + (x - 1)) : idx) * 4;
            let xRight = (x < size - 1 ? (y * size + (x + 1)) : idx) * 4;
            let yUp = (y > 0 ? ((y - 1) * size + x) : idx) * 4;
            let yDown = (y < size - 1 ? ((y + 1) * size + x) : idx) * 4;

            let dzdx = (nPixels[xRight] - nPixels[xLeft]) / 255.0 * strength;
            let dzdy = (nPixels[yDown] - nPixels[yUp]) / 255.0 * strength;

            let len = Math.sqrt(dzdx * dzdx + dzdy * dzdy + 1.0);
            let nx = -dzdx / len;
            let ny = -dzdy / len;
            let nz = 1.0 / len;

            outData[idx] = Math.floor((nx * 0.5 + 0.5) * 255);     // R (X)
            outData[idx+1] = Math.floor((ny * 0.5 + 0.5) * 255); // G (Y)
            outData[idx+2] = Math.floor((nz * 0.5 + 0.5) * 255); // B (Z - Azulado)
            outData[idx+3] = 255;
        }
    }
    nCtx.putImageData(outNormal, 0, 0);
    processedMaps.normal = normalCanvas.toDataURL('image/jpeg', 0.9);

    // HDRI / Panorama Equirectangular (Simulado estirando y aplicando curvatura panorámica 2:1)
    const hdriCanvas = document.createElement('canvas');
    hdriCanvas.width = 2048;
    hdriCanvas.height = 1024;
    const hdriCtx = hdriCanvas.getContext('2d');
    // Fondo difuminado basado en la imagen para simular cielo/entorno 360
    hdriCtx.filter = 'blur(25px)';
    hdriCtx.drawImage(loadedImage, 0, 0, 2048, 1024);
    hdriCtx.filter = 'none';
    // Superponer la imagen original al centro en modo horizonte
    hdriCtx.drawImage(loadedImage, 512, 256, 1024, 512);
    processedMaps.hdri = hdriCanvas.toDataURL('image/jpeg', 0.9);

    loadingOverlay.classList.add('hidden');
    renderActiveTabPreview();
}

function renderActiveTabPreview() {
    if (!processedMaps[currentActiveTab]) return;
    const img = new Image();
    img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
    };
    img.src = processedMaps[currentActiveTab];
}

// Botón de empaquetar y descargar ZIP
processBtn.addEventListener('click', async () => {
    const assetName = assetNameInput.value.trim() || 'material_custom';
    loadingOverlay.classList.remove('hidden');
    loadingText.textContent = 'Empaquetando ZIP...';

    const zip = new JSZip();
    const folder = zip.folder(assetName);

    if (document.getElementById('genBaseColor').checked && processedMaps.basecolor) {
        folder.file(`${assetName}_BaseColor.jpg`, dataURLtoBlob(processedMaps.basecolor));
    }
    if (document.getElementById('genRoughness').checked && processedMaps.roughness) {
        folder.file(`${assetName}_Roughness.jpg`, dataURLtoBlob(processedMaps.roughness));
    }
    if (document.getElementById('genNormal').checked && processedMaps.normal) {
        folder.file(`${assetName}_Normal.jpg`, dataURLtoBlob(processedMaps.normal));
    }
    if (document.getElementById('genHeight').checked && processedMaps.height) {
        folder.file(`${assetName}_Height.jpg`, dataURLtoBlob(processedMaps.height));
    }
    if (document.getElementById('genAO').checked && processedMaps.ao) {
        folder.file(`${assetName}_AO.jpg`, dataURLtoBlob(processedMaps.ao));
    }
    if (document.getElementById('genHDRI').checked && processedMaps.hdri) {
        folder.file(`${assetName}_Environment.jpg`, dataURLtoBlob(processedMaps.hdri));
    }

    const content = await zip.generateAsync({ type: 'blob' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = `${assetName}_PBR_Pack.zip`;
    link.click();

    loadingOverlay.classList.add('hidden');
});

function dataURLtoBlob(dataurl) {
    const arr = dataurl.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
}