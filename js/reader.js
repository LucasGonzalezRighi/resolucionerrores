// App version shown in the main menu. Keep this in sync with CACHE_VERSION in
// sw.js so the displayed version matches the cached/served version on the device.
const APP_VERSION = 'v3';

const barcodeInput = document.getElementById('barcodeInput');
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
    keepFocus();
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
    barcodeInput.value = "";
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
        didClose: keepFocus,
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
    // Add to list, table and reset
    const index = sections[currentSection].length;
    const barcodeData = {barcode, index, amount: 1};
    sections[currentSection].push(barcodeData);
    addBarcodeToTable(barcodeData);
    barcodeInput.value = '';
    updateItemsInSection();
    updateTotalItems();
    storeChanges();
    keepFocus();
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


barcodeInput.addEventListener('keyup', (e) => {
    if (e.key === 'Enter' || e.keyCode === 13) {
        addBarcode(barcodeInput.value);
    }
});

// --- Scan capture -----------------------------------------------------------
// The barcode scanner behaves like a keyboard (types the code + Enter). On the
// picker device, key events are only delivered to a focused element, so we keep
// barcodeInput focused at all times (see keepFocus). The input is readonly so
// the on-screen keyboard never appears — but that also means typed characters
// don't populate it, so we build the value ourselves here. Enter is committed by
// the keyup handler above. Manual hand-entry happens through manualEntry().

function flashInput() {
    barcodeInput.classList.add('capturing');
    clearTimeout(flashInput._timer);
    flashInput._timer = setTimeout(() => barcodeInput.classList.remove('capturing'), 150);
}

barcodeInput.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Enter' || e.keyCode === 13) return; // committed on keyup
    if (e.key === 'Backspace') {
        e.preventDefault();
        barcodeInput.value = barcodeInput.value.slice(0, -1);
        flashInput();
        return;
    }
    if (e.key && e.key.length === 1) { // printable character
        e.preventDefault();
        barcodeInput.value += e.key;
        flashInput();
    }
});

// Keep the scan input focused so the scanner's keystrokes always arrive, but
// never while a SweetAlert dialog is open (its fields need focus). The input is
// readonly, so focusing it does not summon the on-screen keyboard.
function keepFocus() {
    if (typeof Swal !== 'undefined' && Swal.isVisible && Swal.isVisible()) return;
    barcodeInput.focus({ preventScroll: true }); // preventScroll: input is off-screen
}

// Re-grab focus whenever a tap (e.g. a section button) steals it, and re-arm it
// on any tap on the page — covers the case where the initial programmatic focus
// didn't stick (Android often requires a user gesture). The setTimeout lets any
// dialog opened by the tap win the focus first (keepFocus skips while one is open).
barcodeInput.addEventListener('blur', () => setTimeout(keepFocus, 0));
document.addEventListener('pointerdown', () => setTimeout(keepFocus, 0));

// Manual hand-entry: a normal prompt whose own input gets the keyboard, then we
// return to readonly scanning. Used for damaged/unreadable barcodes.
function manualEntry() {
    Swal.fire({
        title: 'Ingresar código',
        input: 'text',
        inputPlaceholder: 'Código de Barras',
        showCancelButton: true,
        confirmButtonText: 'Agregar',
        cancelButtonText: 'Cancelar',
        didClose: keepFocus,
    }).then((result) => {
        if (result.isConfirmed && result.value) addBarcode(result.value);
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
        didClose: keepFocus,
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
        didClose: keepFocus,
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
        didClose: keepFocus,
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