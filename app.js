const fileInput = document.getElementById('fileInput');
const dropZone = document.getElementById('dropZone');
const dropContent = document.getElementById('dropContent');
const thumbnailContainer = document.getElementById('thumbnailContainer');
const thumbPreview = document.getElementById('thumbPreview');
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

// Eventos de selección de archivo seguros
dropZone.addEventListener('click', () => {
    fileInput.click();
});

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.style.borderColor = '#e67e22';
});

dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.style.borderColor = '#2c2c2c';
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.style.borderColor = '#2c2c2c';
    if (e.dataTransfer && e.dataTransfer.files.length > 0) {
        handleFile(e.dataTransfer.files[0]);
    }
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
        handleFile(e.target.files[0]);
    }
});

removeImage.addEventListener('click', (e) => {
    e.stopPropagation();
    loadedImage = null;
    fileInput.value = '';
    thumbnailContainer.classList.add('hidden');
    dropZone.classList.remove('hidden');
    processBtn.disabled = true;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    processedMaps = {};
});

function handleFile(file) {
    if (!file || !file.type.startsWith('image/')) {
        alert('Por favor, selecciona un archivo de imagen válido.');
        return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            loadedImage = img;
            thumbPreview.src = event.target.result;
            dropZone.classList.add('hidden');
            thumbnailContainer.classList.remove('hidden');
            processBtn.disabled = false;
            generateMapsPreview();
        };
        img.onerror = () => {
            alert('Error al cargar la imagen. Pruebe con otro archivo.');
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

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
    loadingText.textContent = 'Procesando textura y generando mapas PBR...';

    // Usar dimensiones reales de la imagen
    const targetWidth = loadedImage.naturalWidth || 2048;
    const targetHeight = loadedImage.naturalHeight || 2048;

    canvas.width = targetWidth;
    canvas.height = targetHeight;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, targetWidth, targetHeight);
    ctx.drawImage(loadedImage, 0, 0, targetWidth, targetHeight);

    let imgData = ctx.getImageData(0, 0, targetWidth, targetHeight);
    let data = imgData.data;

    let backupData = new Uint8ClampedArray(data);
    for (let y = 10; y < targetHeight - 10; y++) {
        for (let x = 10; x < targetWidth - 10; x++) {
            let idx = (y * targetWidth + x) * 4;
            let r = backupData[idx], g = backupData[idx+1], b = backupData[idx+2];
            let lum = (r * 0.299 + g * 0.587 + b * 0.114);
            
            if (lum > 140 && lum < 240) {
                let sampleX = (x + 120 < targetWidth) ? x + 120 : x - 120;
                let sampleIdx = (y * targetWidth + sampleX) * 4;
                
                data[idx] = backupData[sampleIdx];
                data[idx+1] = backupData[sampleIdx+1];
                data[idx+2] = backupData[sampleIdx+2];
            }
        }
    }

    let sharpData = new Uint8ClampedArray(data);
    let weight = 1.2;
    let centerWeight = 1.0 + (4 * weight);

    for (let y = 1; y < targetHeight - 1; y++) {
        for (let x = 1; x < targetWidth - 1; x++) {
            let idx = (y * targetWidth + x) * 4;
            let upIdx = ((y - 1) * targetWidth + x) * 4;
            let downIdx = ((y + 1) * targetWidth + x) * 4;
            let leftIdx = (y * targetWidth + (x - 1)) * 4;
            let rightIdx = (y * targetWidth + (x + 1)) * 4;

            for (let c = 0; c < 3; c++) {
                let newVal = centerWeight * data[idx + c] 
                             - weight * (data[upIdx + c] + data[downIdx + c] + data[leftIdx + c] + data[rightIdx + c]);
                sharpData[idx + c] = Math.min(255, Math.max(0, newVal));
            }
        }
    }

    for (let i = 0; i < data.length; i++) {
        data[i] = sharpData[i];
    }
    ctx.putImageData(imgData, 0, 0);
    processedMaps.basecolor = canvas.toDataURL('image/png');

    // Roughness
    const rCanvas = document.createElement('canvas');
    rCanvas.width = targetWidth; rCanvas.height = targetHeight;
    const rCtx = rCanvas.getContext('2d');
    rCtx.putImageData(imgData, 0, 0);
    const rData = rCtx.getImageData(0, 0, targetWidth, targetHeight);
    for (let i = 0; i < rData.data.length; i += 4) {
        let gray = (rData.data[i] * 0.299 + rData.data[i+1] * 0.587 + rData.data[i+2] * 0.114);
        let rough = 255 - gray;
        rData.data[i] = rough; rData.data[i+1] = rough; rData.data[i+2] = rough;
    }
    rCtx.putImageData(rData, 0, 0);
    processedMaps.roughness = rCanvas.toDataURL('image/png');

    // Height / AO
    const hCanvas = document.createElement('canvas');
    hCanvas.width = targetWidth; hCanvas.height = targetHeight;
    const hCtx = hCanvas.getContext('2d');
    hCtx.putImageData(imgData, 0, 0);
    const hData = hCtx.getImageData(0, 0, targetWidth, targetHeight);
    for (let i = 0; i < hData.data.length; i += 4) {
        let gray = (hData.data[i] * 0.299 + hData.data[i+1] * 0.587 + hData.data[i+2] * 0.114);
        hData.data[i] = gray; hData.data[i+1] = gray; hData.data[i+2] = gray;
    }
    hCtx.putImageData(hData, 0, 0);
    processedMaps.height = hCanvas.toDataURL('image/png');
    processedMaps.ao = processedMaps.height;

    // Normal Map
    const nCanvas = document.createElement('canvas');
    nCanvas.width = targetWidth; nCanvas.height = targetHeight;
    const nCtx = nCanvas.getContext('2d');
    nCtx.putImageData(imgData, 0, 0);
    const nPixels = nCtx.getImageData(0, 0, targetWidth, targetHeight).data;
    const outNormal = nCtx.createImageData(targetWidth, targetHeight);
    const outData = outNormal.data;
    const strength = 3.5;

    for (let y = 0; y < targetHeight; y++) {
        for (let x = 0; x < targetWidth; x++) {
            let idx = (y * targetWidth + x) * 4;
            let xLeft = (x > 0 ? (y * targetWidth + (x - 1)) : idx) * 4;
            let xRight = (x < targetWidth - 1 ? (y * targetWidth + (x + 1)) : idx) * 4;
            let yUp = (y > 0 ? ((y - 1) * targetWidth + x) : idx) * 4;
            let yDown = (y < targetHeight - 1 ? ((y + 1) * targetWidth + x) : idx) * 4;

            let dzdx = (nPixels[xRight] - nPixels[xLeft]) / 255.0 * strength;
            let dzdy = (nPixels[yDown] - nPixels[yUp]) / 255.0 * strength;

            let len = Math.sqrt(dzdx * dzdx + dzdy * dzdy + 1.0);
            outData[idx] = Math.floor((-dzdx / len * 0.5 + 0.5) * 255);
            outData[idx+1] = Math.floor((-dzdy / len * 0.5 + 0.5) * 255);
            outData[idx+2] = Math.floor((1.0 / len * 0.5 + 0.5) * 255);
            outData[idx+3] = 255;
        }
    }
    nCtx.putImageData(outNormal, 0, 0);
    processedMaps.normal = nCanvas.toDataURL('image/png');

    // HDRI Panorama
    const hdriCanvas = document.createElement('canvas');
    hdriCanvas.width = 4096; hdriCanvas.height = 2048;
    const hdriCtx = hdriCanvas.getContext('2d');
    hdriCtx.filter = 'blur(30px)';
    hdriCtx.drawImage(loadedImage, 0, 0, 4096, 2048);
    hdriCtx.filter = 'none';
    hdriCtx.drawImage(loadedImage, 1024, 512, 2048, 1024);
    processedMaps.hdri = hdriCanvas.toDataURL('image/png');

    loadingOverlay.classList.add('hidden');
    renderActiveTabPreview();
}

function renderActiveTabPreview() {
    if (!processedMaps[currentActiveTab]) return;
    const img = new Image();
    img.onload = () => {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
    };
    img.src = processedMaps[currentActiveTab];
}

processBtn.addEventListener('click', async () => {
    const assetName = assetNameInput.value.trim() || 'material_hd';
    loadingOverlay.classList.remove('hidden');
    loadingText.textContent = 'Empaquetando pack ZIP...';

    const zip = new JSZip();
    const folder = zip.folder(assetName);

    if (document.getElementById('genBaseColor').checked && processedMaps.basecolor) {
        folder.file(`${assetName}_BaseColor.png`, dataURLtoBlob(processedMaps.basecolor));
    }
    if (document.getElementById('genRoughness').checked && processedMaps.roughness) {
        folder.file(`${assetName}_Roughness.png`, dataURLtoBlob(processedMaps.roughness));
    }
    if (document.getElementById('genNormal').checked && processedMaps.normal) {
        folder.file(`${assetName}_Normal.png`, dataURLtoBlob(processedMaps.normal));
    }
    if (document.getElementById('genHeight').checked && processedMaps.height) {
        folder.file(`${assetName}_Height.png`, dataURLtoBlob(processedMaps.height));
    }
    if (document.getElementById('genAO').checked && processedMaps.ao) {
        folder.file(`${assetName}_AO.png`, dataURLtoBlob(processedMaps.ao));
    }
    if (document.getElementById('genHDRI').checked && processedMaps.hdri) {
        folder.file(`${assetName}_Environment.png`, dataURLtoBlob(processedMaps.hdri));
    }

    const content = await zip.generateAsync({ type: 'blob' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = `${assetName}_PBR_HD_Pack.zip`;
    link.click();

    loadingOverlay.classList.add('hidden');
});

function dataURLtoBlob(dataurl) {
    const arr = dataurl.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) { u8arr[n] = bstr.charCodeAt(n); }
    return new Blob([u8arr], { type: mime });
}
