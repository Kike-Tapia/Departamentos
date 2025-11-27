// Estado de la aplicación
let currentUser = null;
let departamentos = [];
let editingId = null;
let isOnline = navigator.onLine;
let pendingOperations = [];
let dbReady = false;

// Configuración de la API
const API_BASE_URL = './api';

// Inicialización
document.addEventListener('DOMContentLoaded', async () => {
    setupOnlineOfflineListeners();
    await initializeApp();
    checkAuth();
});

// Configurar listeners de conexión
function setupOnlineOfflineListeners() {
    window.addEventListener('online', async () => {
        isOnline = true;
        console.log('Conexión restaurada - Sincronizando operaciones pendientes...');
        // Sincronizar operaciones pendientes primero
        await syncPendingOperations();
        // Luego FORZAR recarga desde servidor (ignorar cualquier caché)
        console.log('Forzando recarga desde servidor después de volver online...');
        await loadDepartamentos(true);
    });

    window.addEventListener('offline', () => {
        isOnline = false;
        console.log('Sin conexión - Modo offline activado');
    });
}

// Inicializar la aplicación
async function initializeApp() {
    // Registrar service worker
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.register('./sw.js');
            console.log('Service Worker registrado:', registration);
        } catch (error) {
            console.error('Error al registrar Service Worker:', error);
        }
    }

    // Inicializar IndexedDB
    await initDB();
    
    // Cargar departamentos (si está online, cargará desde servidor)
    console.log('Estado de conexión al inicializar:', navigator.onLine ? 'Online' : 'Offline');
    await loadDepartamentos();
}

// Inicializar IndexedDB
function initDB() {
    return new Promise((resolve, reject) => {
        if (!window.indexedDB) {
            console.warn('IndexedDB no está disponible');
            dbReady = false;
            resolve();
            return;
        }

        const request = indexedDB.open('DepartamentosDB', 2);

        request.onerror = () => {
            console.error('Error al abrir IndexedDB:', request.error);
            dbReady = false;
            reject(request.error);
        };

        request.onsuccess = () => {
            window.db = request.result;
            dbReady = true;
            console.log('IndexedDB inicializado correctamente');
            resolve();
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('departamentos')) {
                const objectStore = db.createObjectStore('departamentos', { keyPath: 'id', autoIncrement: true });
                objectStore.createIndex('direccion', 'direccion', { unique: false });
                objectStore.createIndex('estado', 'estado', { unique: false });
            }
            if (!db.objectStoreNames.contains('pending_operations')) {
                db.createObjectStore('pending_operations', { keyPath: 'id', autoIncrement: true });
            }
        };
    });
}

// Verificar que IndexedDB esté listo
function ensureDBReady() {
    if (!dbReady || !window.db) {
        console.warn('IndexedDB no está listo, esperando...');
        return new Promise((resolve) => {
            const checkInterval = setInterval(() => {
                if (dbReady && window.db) {
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 100);
            
            // Timeout después de 5 segundos
            setTimeout(() => {
                clearInterval(checkInterval);
                console.warn('IndexedDB no se inicializó a tiempo');
                resolve();
            }, 5000);
        });
    }
    return Promise.resolve();
}

// Navegación entre páginas
function showLanding() {
    document.getElementById('landing-page').classList.add('active');
    document.getElementById('login-page').classList.remove('active');
    document.getElementById('departamentos-page').classList.remove('active');
}

function showLogin() {
    document.getElementById('landing-page').classList.remove('active');
    document.getElementById('login-page').classList.add('active');
    document.getElementById('departamentos-page').classList.remove('active');
}

function showDepartamentos() {
    document.getElementById('landing-page').classList.remove('active');
    document.getElementById('login-page').classList.remove('active');
    document.getElementById('departamentos-page').classList.add('active');
    loadDepartamentos();
}

// Autenticación con backend
async function handleLogin(event) {
    event.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    if (!username || !password) {
        alert('Por favor, complete todos los campos');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/login.php`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (response.ok && data.success) {
        currentUser = data.user;
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        const displayName = currentUser.nombre || currentUser.username;
        document.getElementById('user-display').textContent = `Usuario: ${displayName}`;
        showDepartamentos();
        } else {
            alert(data.error || 'Error al iniciar sesión');
        }
    } catch (error) {
        console.error('Error de conexión:', error);
        // Fallback: permitir login local si no hay conexión
        if (!isOnline) {
            currentUser = { username, id: Date.now() };
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            document.getElementById('user-display').textContent = `Usuario: ${username} (Offline)`;
            showDepartamentos();
        } else {
            alert('Error al conectar con el servidor. Verifique su conexión.');
        }
    }
}

function checkAuth() {
    const user = localStorage.getItem('currentUser');
    if (user) {
        currentUser = JSON.parse(user);
        const displayName = currentUser.nombre || currentUser.username;
        document.getElementById('user-display').textContent = `Usuario: ${displayName}`;
        showDepartamentos();
    } else {
        showLanding();
    }
}

function logout() {
    currentUser = null;
    localStorage.removeItem('currentUser');
    showLanding();
}

// CRUD de Departamentos - Conectado a MySQL
async function loadDepartamentos(forceReload = false) {
    // Verificar conexión real
    const realmenteOnline = navigator.onLine;
    console.log('Estado de conexión:', realmenteOnline ? 'Online' : 'Offline');
    
    if (realmenteOnline && isOnline) {
        try {
            // Solo sincronizar operaciones pendientes si no es una recarga forzada
            if (!forceReload) {
                await syncPendingOperations();
            }
            
            console.log('Cargando departamentos desde servidor (ignorando caché local)...');
            // Agregar timestamp para evitar caché del navegador
            const cacheBuster = `?t=${Date.now()}`;
            
            // Crear un timeout para la petición
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 segundos timeout
            
            const response = await fetch(`${API_BASE_URL}/departamentos.php${cacheBuster}`, {
                method: 'GET',
                cache: 'no-store',
                signal: controller.signal,
                headers: {
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0'
                }
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            console.log('Respuesta completa del servidor:', data);

            if (data.departamentos && Array.isArray(data.departamentos)) {
                // SIEMPRE usar los datos del servidor cuando está online
                departamentos = data.departamentos;
                console.log('Departamentos cargados desde servidor:', departamentos.length);
                console.log('IDs de departamentos:', departamentos.map(d => d.id));
                
                // Sincronizar con IndexedDB (servidor es la fuente de verdad)
                await syncToIndexedDB(departamentos);
                
                // Renderizar con los datos del servidor
                renderDepartamentos();
                console.log('UI actualizada con', departamentos.length, 'departamentos desde servidor');
            } else {
                console.error('Formato de respuesta inválido:', data);
                throw new Error('Formato de respuesta inválido del servidor');
            }
        } catch (error) {
            console.error('❌ Error al cargar desde servidor:', error);
            console.warn('⚠ Fallback a IndexedDB porque el servidor no responde');
            // Si falla la petición (timeout, error de red, etc.), SIEMPRE cargar desde IndexedDB
            isOnline = false; // Marcar como offline
            console.log('📴 Marcado como offline, ejecutando loadFromIndexedDB()...');
            try {
                const resultado = await loadFromIndexedDB();
                console.log('✅ loadFromIndexedDB completado, resultado:', resultado ? resultado.length : 0, 'departamentos');
            } catch (indexedDBError) {
                console.error('❌ Error crítico al cargar desde IndexedDB:', indexedDBError);
                departamentos = [];
                renderDepartamentos();
            }
        }
    } else {
        // Modo offline: cargar desde IndexedDB
        console.log('Modo offline: cargando desde IndexedDB');
        isOnline = false;
        await loadFromIndexedDB();
    }
}

// Sincronizar datos del servidor a IndexedDB
async function syncToIndexedDB(departamentosData) {
    await ensureDBReady();
    
    if (!window.db) {
        console.warn('IndexedDB no disponible, saltando sincronización');
        return Promise.resolve();
    }
    
    return new Promise((resolve, reject) => {
        try {
            const transaction = window.db.transaction(['departamentos'], 'readwrite');
            const objectStore = transaction.objectStore('departamentos');
        
        // Limpiar datos antiguos
        const clearRequest = objectStore.clear();
        
        clearRequest.onsuccess = () => {
            // Agregar nuevos datos
            let completed = 0;
            const total = departamentosData.length;
            
            if (total === 0) {
                resolve();
                return;
            }
            
            departamentosData.forEach(dept => {
                const addRequest = objectStore.add(dept);
                addRequest.onsuccess = () => {
                    completed++;
                    if (completed === total) {
                        console.log('Datos sincronizados a IndexedDB:', total, 'departamentos');
                        resolve();
                    }
                };
                addRequest.onerror = () => {
                    console.error('Error al agregar departamento a IndexedDB');
                };
            });
        };

        clearRequest.onerror = () => {
            console.error('Error al limpiar IndexedDB');
            reject(clearRequest.error);
        };
        } catch (error) {
            console.error('Error al crear transacción:', error);
            reject(error);
        }
    });
}

// Cargar desde IndexedDB
async function loadFromIndexedDB() {
    console.log('=== CARGANDO DESDE INDEXEDDB ===');
    console.log('Paso 1: Verificando IndexedDB...');
    await ensureDBReady();
    console.log('Paso 2: IndexedDB listo, continuando...');
    
    if (!window.db) {
        console.warn('IndexedDB no disponible, usando array vacío');
        departamentos = [];
        renderDepartamentos();
        return Promise.resolve([]);
    }
    
    return new Promise((resolve, reject) => {
        try {
            // Cargar departamentos y operaciones pendientes en paralelo
            const deptTransaction = window.db.transaction(['departamentos'], 'readonly');
            const deptObjectStore = deptTransaction.objectStore('departamentos');
            const deptRequest = deptObjectStore.getAll();

            const opTransaction = window.db.transaction(['pending_operations'], 'readonly');
            const opObjectStore = opTransaction.objectStore('pending_operations');
            const opRequest = opObjectStore.getAll();

            let deptData = null;
            let pendingOps = null;
            let completed = 0;

            const checkComplete = () => {
                completed++;
                console.log(`Completadas ${completed}/2 operaciones de carga`);
                if (completed === 2) {
                    console.log('Datos cargados de IndexedDB:', deptData ? deptData.length : 0, 'departamentos');
                    console.log('Operaciones pendientes:', pendingOps ? pendingOps.length : 0);
                    
                    // Filtrar departamentos que tienen operaciones DELETE pendientes
                    if (deptData && pendingOps) {
                        const deleteIds = pendingOps
                            .filter(op => op.operation === 'DELETE')
                            .map(op => op.data.id);
                        
                        console.log('IDs a filtrar (DELETE pendientes):', deleteIds);
                        departamentos = deptData.filter(dept => !deleteIds.includes(dept.id));
                        console.log(`✓ Cargados ${departamentos.length} departamentos desde IndexedDB (filtrados ${deleteIds.length} eliminados pendientes)`);
                        console.log('IDs de departamentos cargados:', departamentos.map(d => d.id));
                    } else {
                        departamentos = deptData || [];
                        console.log(`✓ Cargados ${departamentos.length} departamentos desde IndexedDB`);
                    }
                    
                    console.log('Renderizando departamentos desde IndexedDB...');
                    renderDepartamentos();
                    resolve(departamentos);
                }
            };

            deptRequest.onsuccess = () => {
                deptData = deptRequest.result || [];
                console.log('Departamentos cargados de IndexedDB:', deptData.length);
                checkComplete();
            };

            deptRequest.onerror = () => {
                console.error('Error al cargar departamentos desde IndexedDB:', deptRequest.error);
                deptData = [];
                checkComplete();
            };

            opRequest.onsuccess = () => {
                pendingOps = opRequest.result || [];
                console.log('Operaciones pendientes cargadas:', pendingOps.length);
                checkComplete();
            };

            opRequest.onerror = () => {
                console.error('Error al cargar operaciones pendientes:', opRequest.error);
                pendingOps = [];
                checkComplete();
            };
        } catch (error) {
            console.error('Error al crear transacción:', error);
            departamentos = [];
            renderDepartamentos();
            resolve([]);
        }
    });
}

// CREATE - Crear nuevo departamento
async function saveDepartamento(event) {
    event.preventDefault();

    const departamento = {
        direccion: document.getElementById('direccion').value,
        numero: parseInt(document.getElementById('numero').value),
        descripcion: document.getElementById('descripcion').value,
        estado: document.getElementById('estado').value
    };

    if (editingId) {
        // UPDATE
        departamento.id = editingId;
        await updateDepartamento(departamento);
    } else {
        // CREATE
        await createDepartamento(departamento);
    }

    closeDepartamentoModal();
    // No necesitamos recargar aquí porque createDepartamento ya lo hace
}

async function createDepartamento(departamento) {
    if (isOnline) {
        try {
            console.log('=== INICIANDO CREACIÓN DE DEPARTAMENTO ===');
            console.log('Datos a enviar:', departamento);
            
            const response = await fetch(`${API_BASE_URL}/departamentos.php`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(departamento)
            });

            const data = await response.json();
            console.log('Respuesta del servidor:', data);

            if (response.ok && data.success) {
                departamento.id = data.id;
                console.log('✓ Departamento creado con ID:', departamento.id);
                console.log('Estado actual de departamentos ANTES de agregar:', departamentos.length);
                
                // Agregar inmediatamente a la lista local
                departamentos.push({...departamento});
                console.log('Estado después de agregar:', departamentos.length);
                console.log('Último departamento en array:', departamentos[departamentos.length - 1]);
                
                // Renderizar INMEDIATAMENTE
                renderDepartamentos();
                console.log('✓ Tabla renderizada con nuevo registro');
                
                // Esperar y recargar desde servidor
                console.log('Esperando 800ms antes de recargar desde servidor...');
                await new Promise(resolve => setTimeout(resolve, 800));
                
                // Recargar desde servidor con cache buster
                console.log('=== RECARGANDO DESDE SERVIDOR ===');
                const cacheBuster = `?t=${Date.now()}`;
                const reloadResponse = await fetch(`${API_BASE_URL}/departamentos.php${cacheBuster}`, {
                    method: 'GET',
                    cache: 'no-store',
                    headers: {
                        'Cache-Control': 'no-cache, no-store, must-revalidate',
                        'Pragma': 'no-cache'
                    }
                });
                
                if (reloadResponse.ok) {
                    const reloadData = await reloadResponse.json();
                    console.log('Datos recargados del servidor:', reloadData);
                    
                    if (reloadData.departamentos && Array.isArray(reloadData.departamentos)) {
                        console.log('Cantidad de departamentos del servidor:', reloadData.departamentos.length);
                        console.log('IDs del servidor:', reloadData.departamentos.map(d => d.id));
                        
                        // ACTUALIZAR la lista con los datos del servidor
                        departamentos = reloadData.departamentos;
                        console.log('Lista actualizada con', departamentos.length, 'departamentos');
                        
                        // Sincronizar con IndexedDB
                        await syncToIndexedDB(departamentos);
                        
                        // RENDERIZAR NUEVAMENTE
                        renderDepartamentos();
                        console.log('✓ Tabla renderizada con datos del servidor');
                        
                        // Verificar
                        const encontrado = departamentos.find(d => d.id === departamento.id);
                        if (encontrado) {
                            console.log('✓✓✓ CONFIRMADO: Nuevo departamento está en la lista');
                        } else {
                            console.error('✗✗✗ ERROR: Nuevo departamento NO está en la lista después de recargar');
                            console.error('ID buscado:', departamento.id);
                            console.error('IDs disponibles:', departamentos.map(d => d.id));
                        }
                    }
                }
            } else {
                throw new Error(data.error || 'Error al crear departamento');
            }
        } catch (error) {
            console.error('Error al crear en servidor:', error);
            const tempId = Date.now();
            departamento.id = tempId;
            departamentos.push(departamento);
            renderDepartamentos();
            await saveToIndexedDB(departamento);
            await addPendingOperation('CREATE', departamento);
            backupToLocalStorage();
            alert('Departamento guardado localmente. Se sincronizará cuando haya conexión.');
        }
    } else {
        // Modo offline
        const tempId = Date.now();
        departamento.id = tempId;
        departamentos.push(departamento);
        renderDepartamentos();
        await saveToIndexedDB(departamento);
        await addPendingOperation('CREATE', departamento);
        backupToLocalStorage();
        alert('Departamento guardado localmente. Se sincronizará cuando haya conexión.');
    }
}

// UPDATE - Actualizar departamento
async function updateDepartamento(departamento) {
    if (isOnline) {
        try {
            const response = await fetch(`${API_BASE_URL}/departamentos.php`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(departamento)
            });

            const data = await response.json();

            if (response.ok && data.success) {
                // Actualizar en IndexedDB
                await updateInIndexedDB(departamento);
                backupToLocalStorage();
                alert('Departamento actualizado exitosamente');
            } else {
                throw new Error(data.error || 'Error al actualizar departamento');
            }
        } catch (error) {
            console.error('Error al actualizar en servidor:', error);
            // Actualizar en IndexedDB y marcar para sincronización
            await updateInIndexedDB(departamento);
            await addPendingOperation('UPDATE', departamento);
            backupToLocalStorage();
            alert('Cambios guardados localmente. Se sincronizarán cuando haya conexión.');
        }
    } else {
        // Modo offline
        await updateInIndexedDB(departamento);
        await addPendingOperation('UPDATE', departamento);
        backupToLocalStorage();
        alert('Cambios guardados localmente. Se sincronizarán cuando haya conexión.');
    }
}

// DELETE - Eliminar departamento
async function deleteDepartamento(id) {
    if (!confirm('¿Está seguro de que desea eliminar este departamento?')) {
        return;
    }

    // Eliminar de la lista local primero para feedback inmediato
    departamentos = departamentos.filter(d => d.id !== id);
    renderDepartamentos();

    if (isOnline) {
        try {
            const response = await fetch(`${API_BASE_URL}/departamentos.php?id=${id}`, {
                method: 'DELETE'
            });

            const data = await response.json();

            if (response.ok && data.success) {
                // Eliminar de IndexedDB también
                await deleteFromIndexedDB(id);
                backupToLocalStorage();
                // Recargar para asegurar sincronización
                await loadDepartamentos();
            } else {
                throw new Error(data.error || 'Error al eliminar departamento');
            }
        } catch (error) {
            console.error('Error al eliminar en servidor:', error);
            // Marcar para sincronización y mantener en IndexedDB temporalmente
            await addPendingOperation('DELETE', { id });
            // Guardar estado actual en IndexedDB sin el registro eliminado
            await syncToIndexedDB(departamentos);
            backupToLocalStorage();
            alert('Departamento eliminado localmente. Se sincronizará cuando haya conexión.');
        }
    } else {
        // Modo offline: eliminar de IndexedDB y marcar para sincronización
        console.log('Eliminando en modo offline, ID:', id);
        await deleteFromIndexedDB(id);
        await addPendingOperation('DELETE', { id });
        // Sincronizar el estado actual (sin el registro eliminado) a IndexedDB
        await syncToIndexedDB(departamentos);
        backupToLocalStorage();
        console.log('Departamento eliminado de IndexedDB y marcado para sincronización');
        alert('Departamento eliminado localmente. Se sincronizará cuando haya conexión.');
    }
}

// Operaciones con IndexedDB
async function saveToIndexedDB(departamento) {
    await ensureDBReady();
    
    if (!window.db) {
        console.warn('IndexedDB no disponible, saltando guardado local');
        return Promise.resolve();
    }
    
    return new Promise((resolve, reject) => {
        try {
            const transaction = window.db.transaction(['departamentos'], 'readwrite');
            const objectStore = transaction.objectStore('departamentos');
            const request = objectStore.put(departamento);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        } catch (error) {
            console.error('Error al guardar en IndexedDB:', error);
            resolve(); // Resolver en lugar de rechazar para no romper el flujo
        }
    });
}

async function updateInIndexedDB(departamento) {
    return saveToIndexedDB(departamento);
}

async function deleteFromIndexedDB(id) {
    await ensureDBReady();
    
    if (!window.db) {
        console.warn('IndexedDB no disponible, saltando eliminación local');
        return Promise.resolve();
    }
    
    return new Promise((resolve, reject) => {
        try {
            const transaction = window.db.transaction(['departamentos'], 'readwrite');
            const objectStore = transaction.objectStore('departamentos');
            const request = objectStore.delete(parseInt(id));

            request.onsuccess = () => {
                console.log('Registro eliminado de IndexedDB, ID:', id);
                resolve();
            };
            request.onerror = () => {
                console.error('Error al eliminar de IndexedDB:', request.error);
                // Intentar también con el ID como string
                const request2 = objectStore.delete(id);
                request2.onsuccess = () => {
                    console.log('Registro eliminado de IndexedDB (segundo intento), ID:', id);
                    resolve();
                };
                request2.onerror = () => {
                    console.error('Error al eliminar de IndexedDB (segundo intento):', request2.error);
                    reject(request2.error);
                };
            };
        } catch (error) {
            console.error('Error al crear transacción para eliminar:', error);
            resolve(); // Resolver en lugar de rechazar
        }
    });
}

// Gestión de operaciones pendientes
async function addPendingOperation(operation, data) {
    await ensureDBReady();
    
    if (!window.db) {
        console.warn('IndexedDB no disponible, saltando operación pendiente');
        return Promise.resolve();
    }
    
    return new Promise((resolve, reject) => {
        try {
            const transaction = window.db.transaction(['pending_operations'], 'readwrite');
            const objectStore = transaction.objectStore('pending_operations');
            const request = objectStore.add({ operation, data, timestamp: Date.now() });

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        } catch (error) {
            console.error('Error al agregar operación pendiente:', error);
            resolve(); // Resolver en lugar de rechazar
        }
    });
}

// Sincronizar operaciones pendientes
async function syncPendingOperations() {
    if (!isOnline) return;
    
    await ensureDBReady();
    
    if (!window.db) {
        console.warn('IndexedDB no disponible, saltando sincronización');
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        try {
            const transaction = window.db.transaction(['pending_operations'], 'readonly');
            const objectStore = transaction.objectStore('pending_operations');
            const request = objectStore.getAll();

        request.onsuccess = async () => {
            const operations = request.result || [];
            let synced = false;
            
            for (const op of operations) {
                try {
                    let response;
                    switch (op.operation) {
                        case 'CREATE':
                            response = await fetch(`${API_BASE_URL}/departamentos.php`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(op.data)
                            });
                            break;
                        case 'UPDATE':
                            response = await fetch(`${API_BASE_URL}/departamentos.php`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(op.data)
                            });
                            break;
                        case 'DELETE':
                            response = await fetch(`${API_BASE_URL}/departamentos.php?id=${op.data.id}`, {
                                method: 'DELETE'
                            });
                            break;
                    }

                    if (response && response.ok) {
                        // Eliminar operación pendiente solo si fue exitosa
                        await removePendingOperation(op.id);
                        synced = true;
                        console.log(`Operación ${op.operation} sincronizada exitosamente`);
                    } else {
                        console.warn(`Error al sincronizar operación ${op.operation}:`, response?.status);
                    }
                } catch (error) {
                    console.error('Error al sincronizar operación:', error);
                }
            }

            // Recargar departamentos después de sincronizar si hubo cambios
            if (synced) {
                console.log('Recargando departamentos después de sincronización...');
                // Cargar directamente desde servidor sin sincronizar operaciones pendientes de nuevo
                try {
                    const response = await fetch(`${API_BASE_URL}/departamentos.php`);
                    const data = await response.json();
                    if (response.ok && data.departamentos) {
                        departamentos = data.departamentos;
                        console.log('Departamentos recargados después de sincronización:', departamentos.length);
                        await syncToIndexedDB(departamentos);
                        renderDepartamentos();
                        console.log('UI actualizada después de sincronización');
                    } else {
                        console.error('Error en respuesta al recargar:', data);
                    }
                } catch (error) {
                    console.error('Error al recargar después de sincronizar:', error);
                }
            }
            resolve();
        };

        request.onerror = () => reject(request.error);
        } catch (error) {
            console.error('Error al sincronizar operaciones:', error);
            resolve(); // Resolver en lugar de rechazar
        }
    });
}

async function removePendingOperation(id) {
    await ensureDBReady();
    
    if (!window.db) {
        console.warn('IndexedDB no disponible, saltando eliminación de operación');
        return Promise.resolve();
    }
    
    return new Promise((resolve, reject) => {
        try {
            const transaction = window.db.transaction(['pending_operations'], 'readwrite');
            const objectStore = transaction.objectStore('pending_operations');
            const request = objectStore.delete(id);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        } catch (error) {
            console.error('Error al eliminar operación pendiente:', error);
            resolve(); // Resolver en lugar de rechazar
        }
    });
}

// Función adicional usando localStorage (requisito: 1 función CRUD con localStorage)
// Esta función guarda una copia de respaldo en localStorage
// NOTA: Este respaldo NO se usa para cargar datos, solo como backup
function backupToLocalStorage() {
    // Solo hacer backup si hay datos válidos
    if (departamentos && departamentos.length > 0) {
        const backup = {
            departamentos: departamentos,
            timestamp: new Date().toISOString()
        };
        localStorage.setItem('departamentos_backup', JSON.stringify(backup));
        console.log('Respaldo guardado en localStorage (solo backup, no se usa para cargar)');
    }
}

// Función para restaurar desde localStorage
function restoreFromLocalStorage() {
    const backup = localStorage.getItem('departamentos_backup');
    if (backup) {
        const data = JSON.parse(backup);
        // Restaurar departamentos a IndexedDB
        data.departamentos.forEach(async (dept) => {
            await saveToIndexedDB(dept);
        });
        loadDepartamentos();
        alert('Respaldo restaurado desde localStorage');
    } else {
        alert('No hay respaldo disponible');
    }
}

// Renderizar tabla de departamentos
function renderDepartamentos() {
    const tbody = document.getElementById('departamentos-tbody');
    const emptyState = document.getElementById('empty-state');
    
    if (!tbody) {
        console.error('ERROR: No se encontró el elemento tbody');
        return;
    }
    
    console.log('=== RENDERIZANDO DEPARTAMENTOS ===');
    console.log('Cantidad total:', departamentos.length);
    console.log('Array completo:', departamentos);
    
    if (departamentos.length === 0) {
        console.log('No hay departamentos, mostrando estado vacío');
        tbody.innerHTML = '';
        if (emptyState) emptyState.style.display = 'block';
        return;
    }

    if (emptyState) emptyState.style.display = 'none';
    
    // Verificar que todos los departamentos tengan ID
    const validDepartamentos = departamentos.filter(dept => dept && dept.id !== undefined && dept.id !== null);
    console.log('Departamentos válidos (con ID):', validDepartamentos.length);
    console.log('IDs válidos:', validDepartamentos.map(d => d.id));
    
    if (validDepartamentos.length !== departamentos.length) {
        console.warn('⚠ Algunos departamentos no tienen ID válido');
        const invalid = departamentos.filter(dept => !dept || dept.id === undefined || dept.id === null);
        console.warn('Departamentos inválidos:', invalid);
    }
    
    // Generar HTML
    const html = validDepartamentos.map(dept => {
        const estadoLower = (dept.estado || '').toLowerCase();
        return `
        <tr>
            <td>${dept.id}</td>
            <td>${dept.direccion || ''}</td>
            <td>${dept.numero || ''}</td>
            <td>${dept.descripcion || ''}</td>
            <td><span class="status-badge status-${estadoLower}">${dept.estado || ''}</span></td>
            <td>
                <div class="action-buttons">
                    <button class="btn-edit" onclick="editDepartamento(${dept.id})">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                        Editar
                    </button>
                    <button class="btn-delete" onclick="deleteDepartamento(${dept.id})">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                        Eliminar
                    </button>
                </div>
            </td>
        </tr>
    `;
    }).join('');
    
    // Actualizar el DOM
    tbody.innerHTML = html;
    console.log('✓ HTML generado y actualizado en el DOM');
    console.log('Filas en la tabla:', tbody.querySelectorAll('tr').length);
    
    // Guardar respaldo en localStorage después de renderizar
    backupToLocalStorage();
}

// Filtrar departamentos
function filterDepartamentos() {
    const searchTerm = document.getElementById('search-input').value.toLowerCase();
    const filtered = departamentos.filter(dept => 
        dept.direccion.toLowerCase().includes(searchTerm) ||
        dept.numero.toString().includes(searchTerm) ||
        dept.descripcion.toLowerCase().includes(searchTerm) ||
        dept.estado.toLowerCase().includes(searchTerm)
    );

    const tbody = document.getElementById('departamentos-tbody');
    const emptyState = document.getElementById('empty-state');
    
    if (filtered.length === 0 && searchTerm) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem;">No se encontraron resultados</td></tr>';
        emptyState.style.display = 'none';
        return;
    }

    if (filtered.length === 0) {
        renderDepartamentos();
        return;
    }

    emptyState.style.display = 'none';
    tbody.innerHTML = filtered.map(dept => `
        <tr>
            <td>${dept.id}</td>
            <td>${dept.direccion}</td>
            <td>${dept.numero}</td>
            <td>${dept.descripcion}</td>
            <td><span class="status-badge status-${dept.estado.toLowerCase()}">${dept.estado}</span></td>
            <td>
                <div class="action-buttons">
                    <button class="btn-edit" onclick="editDepartamento(${dept.id})">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                        Editar
                    </button>
                    <button class="btn-delete" onclick="deleteDepartamento(${dept.id})">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                        Eliminar
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

// Modal de departamento
function openDepartamentoModal(id = null) {
    editingId = id;
    const modal = document.getElementById('departamento-modal');
    const form = document.getElementById('departamento-form');
    const title = document.getElementById('modal-title');

    if (id) {
        const dept = departamentos.find(d => d.id === id);
        if (dept) {
            title.textContent = 'Editar Departamento';
            document.getElementById('departamento-id').value = dept.id;
            document.getElementById('direccion').value = dept.direccion;
            document.getElementById('numero').value = dept.numero;
            document.getElementById('descripcion').value = dept.descripcion;
            document.getElementById('estado').value = dept.estado;
        }
    } else {
        title.textContent = 'Nuevo Departamento';
        form.reset();
        document.getElementById('departamento-id').value = '';
    }

    modal.classList.add('active');
}

function closeDepartamentoModal() {
    const modal = document.getElementById('departamento-modal');
    modal.classList.remove('active');
    editingId = null;
    document.getElementById('departamento-form').reset();
}

function editDepartamento(id) {
    openDepartamentoModal(id);
}

// Cerrar modal al hacer clic fuera
document.addEventListener('click', (e) => {
    const modal = document.getElementById('departamento-modal');
    if (e.target === modal) {
        closeDepartamentoModal();
    }
});
