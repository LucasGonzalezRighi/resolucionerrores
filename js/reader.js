// App version shown in the main menu. Keep this in sync with CACHE_VERSION in
// sw.js so the displayed version matches the cached/served version on the device.
const APP_VERSION = 'v5';

const tableBody = document.getElementById('tableBody');
const currentSectionSpan = document.getElementById('currentSectionSpan');
const totalSectionsSpan = document.getElementById('totalSectionsSpan');
const totalItemsSection = document.getElementById('totalItemsSection');
const totalItems = document.getElementById('totalItems');
const sectionPlus = document.getElementById('sectionPlus');
const sectionMinus = document.getElementById('sectionMinus');
const sectionDelete = document.getElementById('sectionDelete');
const mainMenu = document.getElementById('mainMenu');
let sections = [[]];
let currentSection = 0;

document.addEventListener('DOMContentLoaded', () => {
    const sectionsData = localStorage.getItem('sections');
    if (sectionsData === null) return;
    sections = JSON.parse(sectionsData);
    currentSection = sections.length - 1;
    updateSections();
    updateTotalItems();
    checkSectionControls();

    // Prevent navigating away by accident
    window.onbeforeunload = function () {
        return "Estás seguro de querer salir?";
    };
});

function storeChanges() {
    localStorage.setItem('sections', JSON.stringify(sections));
}

function storeFilename(filename) {
    localStorage.setItem('filename', filename);
}

function getFilename() {
    return localStorage.getItem('filename') || 'backup';
}

function getItemsInSection(section) {
    return section.reduce((acc, line) => acc + line.amount, 0);
}

function updateItemsInSection() {
    totalItemsSection.innerText = getItemsInSection(sections[currentSection]);
}

function updateTotalItems() {
    totalItems.innerText = sections.reduce((acc, section) => acc + getItemsInSection(section), 0);
}

function updateSections() {
    currentSectionSpan.innerText = currentSection + 1;
    tableBody.innerHTML = '';
    if (sections[currentSection]){ 
        sections[currentSection].forEach(addBarcodeToTable);
    } else { // Initialize to empty array on first time
        sections[currentSection] = [];
    }
    updateItemsInSection();
    totalSectionsSpan.innerText = sections.length;
}

function deleteSection() {
    Swal.fire({
        title: `Borrar Seccion?`,
        text: `Esta sección contiene ${getItemsInSection(sections[currentSection])} items, borrar?`,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Borrar',
        cancelButtonText: 'Cancelar',
    }).then(result => {
        if (result.isConfirmed) {
            sections.splice(currentSection, 1);
            if(currentSection > 0) currentSection--;
            updateSections();
            updateTotalItems();
            checkSectionControls();
            storeChanges();
        }
    })
    
}

function checkSectionControls() {
    if (currentSection < 1) {
        sectionMinus.classList.add('disabled');
        sectionDelete.classList.add('disabled');
    } else {
        sectionMinus.classList.remove('disabled');
        sectionDelete.classList.remove('disabled');
    }
}

function sectionBack() {
    currentSection--;
    checkSectionControls();
    updateSections();
}

function sectionForward() {
    currentSection++;
    checkSectionControls();
    updateSections();
}

sectionPlus.addEventListener('click', sectionForward);
sectionMinus.addEventListener('click', sectionBack);
sectionDelete.addEventListener('click', deleteSection)

function addBarcode(barcode) {
    barcode = barcode.trim();
    if (barcode === '') return;
    // Si el código ya existe en la sección actual, suma +1 a su cantidad
    // en vez de crear una fila nueva.
    const existing = sections[currentSection].find(item => item.barcode === barcode);
    if (existing) {
        existing.amount += 1;
        updateBarcodeRow(existing);
    } else {
        const barcodeData = {barcode, index: sections[currentSection].length, amount: 1};
        sections[currentSection].push(barcodeData);
        addBarcodeToTable(barcodeData);
    }
    updateItemsInSection();
    updateTotalItems();
    storeChanges();
}

function addBarcodeToTable(barcodeData) {
    const tr = document.createElement('tr');
    tr.dataset.barcode = barcodeData.barcode;
    tr.dataset.index = barcodeData.index;
    tr.dataset.amount = barcodeData.amount;
    tr.classList.add('barcode');
    const td1 = document.createElement('td');
    td1.innerHTML = '<i class="bi bi-pencil"></i>';
    const td2 = document.createElement('td');
    td2.classList.add('amount');
    td2.innerText = barcodeData.amount;
    const td3 = document.createElement('td');
    td3.classList.add('barcode');
    td3.innerText = barcodeData.barcode;
    tr.appendChild(td1);
    tr.appendChild(td2);
    tr.appendChild(td3);
    tableBody.insertBefore(tr, tableBody.firstChild);
}

// Actualiza la cantidad mostrada de una fila ya existente (por su index).
function updateBarcodeRow(barcodeData) {
    const row = tableBody.querySelector(`tr[data-index="${barcodeData.index}"]`);
    if (!row) return;
    row.dataset.amount = barcodeData.amount;
    row.querySelector('.amount').innerText = barcodeData.amount;
}


// --- Scan capture -----------------------------------------------------------
// The barcode scanner behaves like a keyboard: it types the code's characters
// then Enter. We listen on the whole document and accumulate them into a buffer,
// committing on Enter. No input element, no focus management — we only ignore
// keystrokes while a modal (SweetAlert) is open, so its fields work normally.
let scanBuffer = '';

document.addEventListener('keydown', (e) => {
    if (Swal.isVisible && Swal.isVisible()) return;   // a modal is open — ignore
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Enter' || e.keyCode === 13) {
        e.preventDefault();                            // don't activate a focused button
        addBarcode(scanBuffer);
        scanBuffer = '';
    } else if (e.key === 'Backspace') {
        scanBuffer = scanBuffer.slice(0, -1);
    } else if (e.key && e.key.length === 1) {
        scanBuffer += e.key;
    }
});

// Entrada continua: la ventana queda ABIERTA y carga un código por vez, ya sea
// escaneando con la pistola o escribiendo a mano. Cada Enter agrega el código y
// limpia el campo para el siguiente. Se cierra con "Cerrar".
function manualEntry() {
    Swal.fire({
        title: 'Escanear / Ingresar',
        html: `
        <input type="text" id="manualInput" class="form-control" placeholder="Código de Barras"
               autocomplete="off" autocapitalize="off" spellcheck="false"/>
        <p class="manual-info">Escaneá o escribí y Enter — se cargan uno por uno.</p>
        <p class="manual-info">Cargados: <strong id="manualCount">0</strong><span id="manualLast"></span></p>
        `,
        showConfirmButton: false,
        showCancelButton: true,
        cancelButtonText: 'Cerrar',
        focusCancel: false,
        didOpen() {
            const input = document.getElementById('manualInput');
            const countEl = document.getElementById('manualCount');
            const lastEl = document.getElementById('manualLast');
            let count = 0;
            input.focus();
            input.addEventListener('keydown', (e) => {
                if (e.key !== 'Enter' && e.keyCode !== 13) return;
                e.preventDefault();      // no cerrar el diálogo
                e.stopPropagation();
                const code = input.value.trim();
                input.value = '';
                input.focus();
                if (code === '') return;
                addBarcode(code);        // misma lógica: si ya existe, suma cantidad
                count++;
                countEl.innerText = count;
                lastEl.innerText = ' · Último: ' + code;
            });
        },
    });
}

document.getElementById('manualEntry').addEventListener('click', manualEntry);

function deleteItem(index) {
    const indexToRemove = sections[currentSection].findIndex(el => el.index === index);
    sections[currentSection].splice(indexToRemove, 1);
    reindexSection();
}

function reindexSection() {
    sections[currentSection] = sections[currentSection].map((item, index) => {
        return {...item, index};
    });
    updateSections();
    updateTotalItems();
    storeChanges();
}

tableBody.addEventListener('click', (e) => {
    // Only listen for clicks on the edit button
    if (!e.target.classList.contains('bi-pencil')) return;
    const targetBarcodeRow = e.target.closest('tr');
    const index = parseInt(targetBarcodeRow.dataset.index);
    Swal.fire({
        title: `Editar ${targetBarcodeRow.dataset.barcode}`,
        html: `
        <div class="swal-edit">
            <p>Código de Barras/Cantidad</p>
            <div class="input-group">
                <input type="text" value="${targetBarcodeRow.dataset.barcode}" class="form-control barcode"/>
                <input type="number" value="${targetBarcodeRow.dataset.amount}" class="form-control amount"/>
            </div>
        </div>
        `,
        focusConfirm: false,
        showDenyButton: true,
        showCancelButton: true,
        confirmButtonText: 'Guardar',
        denyButtonText: 'Borrar',
        cancelButtonText: 'Cancelar',
        preConfirm: () => {
          return [
            document.querySelector('.swal-edit .barcode').value,
            document.querySelector('.swal-edit .amount').value
          ];
        }
      }).then((result) => {
            if (result.isDismissed) {
                return;
            } else if (result.isDenied) deleteItem(index);
            else if (result.isConfirmed) {
                const [barcode, amount] = result.value;
                console.log("Updating", barcode, amount)
                targetBarcodeRow.dataset.barcode = barcode;
                targetBarcodeRow.dataset.amount = amount;
                const indexToEdit = sections[currentSection].findIndex(el => el.index === index);
                sections[currentSection][indexToEdit] = {index, barcode, amount: parseInt(amount)};
                targetBarcodeRow.querySelector('.barcode').innerText = barcode;
                targetBarcodeRow.querySelector('.amount').innerText = amount;
                updateItemsInSection();
                updateTotalItems();
                storeChanges();
            }
      });
});

function exportCSV() {
    Swal.close();
    let filename = getFilename();
    Swal.fire({
        title: 'Exportar a archivo...',
        html: `<div class="swal-save">
            <input type="text" value="${filename}" class="form-control" id="filename"/>
        </div>
        `,
        showCancelButton: true,
        didOpen() {
            const filenameInput = document.getElementById('filename')
            filenameInput.addEventListener('change', () => {
                filename = filenameInput.value;
                storeFilename(filename);
            });
        }
    }).then(result => {
        if (!result.isConfirmed) return;
        let csvString = 'Cantidad,Codigo,Seccion\r\n';
        sections.forEach((section, section_idx) => 
            section.forEach(item => 
                csvString += `"${item.amount}","${item.barcode}","${section_idx + 1}"\r\n`));
        var element = document.createElement('a');
        element.setAttribute('href', 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvString));
        element.setAttribute('download', filename + ".csv");
        element.click();
    })
    
}

function importCSV() {
    const fileInput = document.createElement('input');
    fileInput.type = "file";
    fileInput.accept = ".csv, text/csv";
    
    fileInput.addEventListener('change', (e) => {
        if (fileInput.files[0]) {
            const reader = new FileReader();
            reader.onload = () => {
                // Parse the results into a JSON
                const parsedCSV = Papa.parse(reader.result, { header: true });
                deleteAll();

                const validData =  parsedCSV.data.filter(item => 
                    item.hasOwnProperty('Cantidad') && item.hasOwnProperty('Codigo') && item.hasOwnProperty('Seccion'));
                const detectedSections = new Set();
                validData.forEach((item) => detectedSections.add(parseInt(item['Seccion']) - 1));
                const sortedSections = [...detectedSections].sort()
                sortedSections.forEach(sectionIdx => sections[sectionIdx] = []);
                validData.forEach((item) => {
                    const itemSection = parseInt(item['Seccion']) - 1;
                    const currIndex = sections[itemSection].length;
                    sections[itemSection].push({barcode: item['Codigo'], amount: parseInt(item['Cantidad']), index: currIndex});
                });
                // Finally Reset UI
                currentSection = sections.length - 1;
                updateSections();
                updateTotalItems();
                checkSectionControls();
                storeChanges();
            }
            reader.readAsText(fileInput.files[0]);
        }
    });
    
    fileInput.click();
}

function deleteAll() {
    sections = [[]];
    currentSection = 0;
    storeChanges();
    updateSections();
    updateTotalItems();
    Swal.close();
}

function groupCurrentSection() {
    const grouped = {}
    sections[currentSection].forEach(item => {
        grouped[item.barcode] = grouped[item.barcode] === undefined ? item.amount : (grouped[item.barcode] + item.amount);
    });
    sections[currentSection] = Object.keys(grouped).map((barcode, index) => {
        return {index, barcode, amount: grouped[barcode]};
    })
    updateSections();
    storeChanges();
    Swal.close();
}

mainMenu.addEventListener('click', () => {
    Swal.fire({
        title: `Menú Principal`,
        customClass: 'main-menu',
        html: `
        <div class="container">
            <div class="row mt-2">
                <div class="col">
                    <button class="btn btn-primary export">Exportar</button>
                    <button class="btn btn-success import">Importar</button>
                    <button class="btn btn-danger delete">Borrar</button>
                </div>
            </div>
            <div class="row mt-2">
                <div class="col">
                    <button class="btn btn-info group">Agrupar</button>
                    <button class="btn btn-light cancel">Cancelar</button>
                </div>
            </div>
            <p class="app-version">Versión ${APP_VERSION}</p>
        </div>
        `,
        showConfirmButton: false,
        didOpen() {
            document.querySelector('.main-menu .export').addEventListener('click', exportCSV);
            document.querySelector('.main-menu .import').addEventListener('click', importCSV);
            document.querySelector('.main-menu .delete').addEventListener('click', deleteAll);
            document.querySelector('.main-menu .cancel').addEventListener('click', () => {
                Swal.close();
            });
            document.querySelector('.main-menu .group').addEventListener('click', groupCurrentSection)
        }
      });
})