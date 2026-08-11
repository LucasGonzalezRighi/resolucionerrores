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
const itemList = document.querySelector('.item-list');
let sections = [[]];
let currentSection = 0;

// Las filas se agregan al final, así que tras cada carga bajamos la lista hasta
// el fondo para que el producto recién escaneado quede siempre a la vista. Si no
// hay scroll (pocos items) no pasa nada: ya está todo visible.
// Salto directo (sin animación): al escanear rápido, un scroll animado se
// reinicia con cada lectura y quedaría siempre atrasado.
function scrollToLatest() {
    if (!itemList) return;
    itemList.scrollTop = itemList.scrollHeight;
}

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
    scrollToLatest();   // al cambiar de sección, mostrar el final (lo último cargado)
}

// Color del botón que confirma un borrado. En rojo para que se distinga de
// un botón de acción común: lo que hace no se puede deshacer.
const DELETE_BUTTON_COLOR = '#dc3545';

function deleteSection() {
    Swal.fire({
        returnFocus: false,
        title: `Borrar Seccion?`,
        text: `Esta sección contiene ${getItemsInSection(sections[currentSection])} items, borrar?`,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Borrar',
        confirmButtonColor: DELETE_BUTTON_COLOR,
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

// Ningún botón de la app debe conservar el foco. Si lo conserva, el Enter que la
// pistola envía al final de cada lectura lo "activa" — por ejemplo, tras tocar
// "+" crearía una sección nueva por cada producto escaneado. Apenas un botón
// (fuera de un diálogo de SweetAlert) recibe foco, se lo quitamos. Los botones
// dentro de un diálogo se dejan intactos para no romper su navegación.
document.addEventListener('focusin', (e) => {
    if (Swal.isVisible && Swal.isVisible()) return;   // no interferir con un diálogo abierto
    const btn = e.target.closest && e.target.closest('button');
    if (btn && !btn.closest('.swal2-container')) btn.blur();
});

// --- Aviso de código rechazado -------------------------------------------
// Desde el navegador no se puede manejar la luz ni el beeper propios del
// equipo Zebra (eso lo hace DataWedge solo cuando decodifica bien), pero sí
// podemos hacer sonar el parlante con un tono grave de error, vibrar si el
// equipo lo permite, y poner la pantalla en rojo un instante.
let errorAudioCtx = null;

function playErrorSound() {
    try {
        errorAudioCtx = errorAudioCtx || new (window.AudioContext || window.webkitAudioContext)();
        if (errorAudioCtx.state === 'suspended') errorAudioCtx.resume();
        // Dos tonos graves cortos, bien distintos al beep agudo de lectura OK.
        [0, 0.28].forEach(offset => {
            const osc = errorAudioCtx.createOscillator();
            const gain = errorAudioCtx.createGain();
            osc.type = 'square';
            osc.frequency.value = 220;
            gain.gain.setValueAtTime(0.4, errorAudioCtx.currentTime + offset);
            osc.connect(gain);
            gain.connect(errorAudioCtx.destination);
            osc.start(errorAudioCtx.currentTime + offset);
            osc.stop(errorAudioCtx.currentTime + offset + 0.2);
        });
    } catch (e) { /* sin audio disponible, seguimos igual */ }
    if (navigator.vibrate) navigator.vibrate([180, 80, 180]);
}

function flashErrorScreen() {
    document.body.classList.add('scan-error');
    setTimeout(() => document.body.classList.remove('scan-error'), 700);
}

function scanError() {
    playErrorSound();
    flashErrorScreen();
}

function isValidBarcode(barcode) {
    return barcode.length >= 9 && barcode.length <= 25;
}

// "amount" es opcional: si no se pasa, se carga 1 unidad (comportamiento
// original del escáner). Solo la carga manual pasa una cantidad distinta.
// "showAlert" en false evita abrir el cartel de error: lo usa la ventana
// Manual, porque un Swal nuevo reemplazaría al diálogo abierto y lo cerraría.
// El sonido de error y el destello rojo se disparan igual en ambos casos.
function addBarcode(barcode, amount = 1, showAlert = true) {
    barcode = barcode.trim();
    amount = parseInt(amount);
    if (isNaN(amount) || amount < 1) amount = 1;

    if (barcode === '') return false;

    if (!isValidBarcode(barcode)) {
        scanError();

        if (showAlert) {
            Swal.fire({
                returnFocus: false,
                icon: 'error',
                title: 'Código inválido',
                text: `El código "${barcode}" tiene ${barcode.length} caracteres. Debe tener entre 9 y 25.`,
                timer: 3000,
                showConfirmButton: false
            });
        }

        return false;
    }

    const barcodeData = {
        barcode,
        index: sections[currentSection].length,
        amount
    };

    sections[currentSection].push(barcodeData);
    addBarcodeToTable(barcodeData);
    scrollToLatest();

    updateItemsInSection();
    updateTotalItems();
    storeChanges();

    return true;
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
    tableBody.appendChild(tr);
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
    // Carga manual: código + cantidad + "Aceptar". El botón verde confirma el
    // dato y lo agrega a la lista como una fila nueva; "Cerrar" cancela. Este
    // handler se define dentro de didOpen y preConfirm lo invoca sin cerrar
    // el diálogo (devolviendo false), para poder cargar uno tras otro.
    let confirmEntry = null;

    Swal.fire({
        returnFocus: false,
        title: 'Escanear / Ingresar',
        html: `
        <div class="swal-manual">
            <div class="manual-labels">
                <span class="manual-label-code">Código de barras</span>
                <span class="manual-label-amount">Cant.</span>
            </div>
            <div class="input-group">
                <input type="text" id="manualInput" class="form-control" placeholder="Escaneá o escribí"
                       autocomplete="off" autocapitalize="off" spellcheck="false"/>
                <input type="number" id="manualAmount" class="form-control" placeholder="1" min="1"
                       inputmode="numeric" title="Cantidad"/>
            </div>
            <p class="manual-info">Aceptar carga y cierra. Escaneando se carga solo.</p>
            <p class="manual-status">Cargados: <strong id="manualCount">0</strong><span id="manualLast"></span></p>
        </div>
        `,
        showConfirmButton: true,
        confirmButtonText: 'Aceptar',
        confirmButtonColor: '#198754',
        showCancelButton: true,
        cancelButtonText: 'Cerrar',
        focusCancel: false,
        focusConfirm: false,
        // Sube el cuadro: centrado tapaba las filas de la lista y quedaba
        // muy cerca del teclado en pantalla. Solo afecta a este diálogo.
        // La separación exacta con el borde de arriba se ajusta desde el CSS
        // (variable --manual-top en .swal-manual-pos).
        position: 'top',
        customClass: { container: 'swal-manual-pos' },
        preConfirm: () => {
            // Devolver true cierra el diálogo, false lo deja abierto. El botón
            // Aceptar es la carga manual: cargó bien -> se cierra solo. Si el
            // dato estaba mal, queda abierto para corregirlo sin reabrirlo.
            return confirmEntry ? confirmEntry() : false;
        },
        didOpen() {
            const input = document.getElementById('manualInput');
            const amountInput = document.getElementById('manualAmount');
            const countEl = document.getElementById('manualCount');
            const lastEl = document.getElementById('manualLast');
            let count = 0;   // unidades cargadas en esta sesión del diálogo

            // Confirma lo que haya en los campos: agrega el código a la lista con
            // la cantidad indicada (una fila nueva) y deja todo listo para el
            // siguiente. Sin cantidad escrita se carga 1, que es el caso del
            // escaneo con pistola o QR: el lector manda el código y Enter solo.
            // Devuelve true solo si el dato se cargó: preConfirm usa eso para
            // cerrar el diálogo cuando la carga fue por el botón Aceptar.
            confirmEntry = () => {
                const code = input.value.trim();

                if (code === '') {
                    lastEl.innerText = ' · Escribí un código';
                    input.focus();
                    return false;
                }

                const raw = amountInput.value.trim();
                const amount = raw === '' ? 1 : parseInt(raw);

                if (isNaN(amount) || amount < 1) {
                    scanError();
                    lastEl.innerText = ' · Cantidad inválida';
                    amountInput.focus();
                    return false;
                }

                // addBarcode valida el código (largo 9-25) y, si lo rechaza,
                // avisa con el sonido de error y la pantalla en rojo. Se le
                // pasa showAlert = false para que el cartel de error no cierre
                // esta ventana: el motivo se muestra acá abajo.
                const added = addBarcode(code, amount, false);

                // Los campos se limpian siempre: un código rechazado no debe
                // quedar en pantalla para volver a cargarse por accidente.
                input.value = '';
                amountInput.value = '';
                input.focus();

                if (!added) {
                    lastEl.innerText = ` · Rechazado: ${code} (${code.length} caracteres, deben ser 9 a 25)`;
                    return false;
                }

                count += amount;
                countEl.innerText = count;
                lastEl.innerText = ` · ${code} x${amount}`;
                return true;
            };

            input.focus();

// Enter en cualquiera de los dos campos hace lo mismo que el botón Aceptar.
// Es lo que permite que la pistola siga cargando sola: manda el código y un
// Enter al final, sin cantidad escrita, así que entra con 1.
const onEnter = (e) => {
    if (e.key !== 'Enter' && e.keyCode !== 13) return;
    e.preventDefault();
    e.stopPropagation();
    confirmEntry();
};

input.addEventListener('keydown', onEnter);
amountInput.addEventListener('keydown', onEnter);
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
        returnFocus: false,
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
        returnFocus: false,
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

// Borra todo sin preguntar. Ojo: importCSV() la usa para limpiar antes de
// cargar el archivo, así que la confirmación NO va acá adentro (si no,
// importar un CSV pediría confirmación en el medio). El botón "Borrar" del
// menú principal pasa por confirmDeleteAll().
function deleteAll() {
    sections = [[]];
    currentSection = 0;
    storeChanges();
    updateSections();
    updateTotalItems();
    checkSectionControls();
    Swal.close();
}

// Confirmación del "Borrar" del menú principal: se lleva puestas TODAS las
// secciones, así que avisa cuánto se pierde antes de hacerlo.
function confirmDeleteAll() {
    const items = sections.reduce((acc, section) => acc + getItemsInSection(section), 0);
    const plural = sections.length === 1 ? 'sección' : 'secciones';

    Swal.fire({
        returnFocus: false,
        title: 'Borrar todo?',
        text: `Se van a borrar ${items} items de ${sections.length} ${plural}. Esto no se puede deshacer.`,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Borrar',
        confirmButtonColor: DELETE_BUTTON_COLOR,
        cancelButtonText: 'Cancelar',
    }).then(result => {
        if (result.isConfirmed) deleteAll();
    });
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
        returnFocus: false,
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
            document.querySelector('.main-menu .delete').addEventListener('click', confirmDeleteAll);
            document.querySelector('.main-menu .cancel').addEventListener('click', () => {
                Swal.close();
            });
            document.querySelector('.main-menu .group').addEventListener('click', groupCurrentSection)
        }
      });
})