const API_ARTISTS = (window.API_ARTISTS_URL) ? window.API_ARTISTS_URL : 'http://localhost:8080/api/artists';
const API_SONGS = (window.API_SONGS_URL) ? window.API_SONGS_URL : 'http://localhost:8081/api/songs';

// localForage / IndexedDB config
localforage.config({ name: 'cancionesfavo' });
const PENDING_KEY = 'pendingArtistsQueue';
const API_CACHE = 'cancionesfavo-api-v1';
const SHELL_CACHE = 'cancionesfavo-shell-v1';

async function savePendingQueue(queue) {
    await localforage.setItem(PENDING_KEY, queue);
}
async function getPendingQueue() {
    const q = await localforage.getItem(PENDING_KEY);
    return Array.isArray(q) ? q : [];
}
async function enqueuePendingArtist(partialArtist) {
    const queue = await getPendingQueue();
    const tempId = 'tmp-' + Date.now();
    const pending = { tempId, payload: partialArtist, retries: 0, createdAt: Date.now() };
    queue.push(pending);
    await savePendingQueue(queue);
    return pending;
}
async function removePendingByTempId(tempId) {
    const queue = await getPendingQueue();
    const newQueue = queue.filter(item => item.tempId !== tempId);
    await savePendingQueue(newQueue);
    return newQueue;
}

function backoffDelay(retries) {
    const base = 1000;
    return Math.min(30000, base * Math.pow(2, retries));
}


function addPendingArtistToUI(pending) {
    const container = document.getElementById('artistasList');
    if (!container) return;
    const item = document.createElement('div');
    item.className = 'list-group-item pending';
    item.id = pending.tempId;

    const nombre = document.createElement('h6');
    nombre.textContent = (pending.payload.nombre || 'Sin nombre') + ' ';
    const badge = document.createElement('span');
    badge.className = 'badge bg-warning text-dark';
    badge.textContent = 'Pendiente';
    nombre.appendChild(badge);
    item.appendChild(nombre);

    const meta = document.createElement('div');
    meta.className = 'small text-muted';
    const nac = pending.payload.nacionalidad ? `Nacionalidad: ${pending.payload.nacionalidad}` : '';
    const fn = pending.payload.fechaNacimiento ? ` - Nac: ${pending.payload.fechaNacimiento}` : '';
    const gen = pending.payload.genero ? ` - Género: ${pending.payload.genero}` : '';
    meta.textContent = `${nac}${fn}${gen}`;
    item.appendChild(meta);

    container.prepend(item);
}
function replacePendingArtistWithServer(tempId, serverArtist) {
    const el = document.getElementById(tempId);
    if (el) el.remove();
    // recargar listado del servidor
    load();
}

async function fetchArtistas() {
    const url = API_ARTISTS;
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('Error al obtener artistas');
        const data = await res.json();
        // cachear la respuesta GET
        try {
            if ('caches' in window) {
                const cache = await caches.open(API_CACHE);
                cache.put(url, new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } }));
            }
        } catch (err) {
            console.warn('No se pudo cachear respuesta API:', err);
        }
        return data;
    } catch (e) {
        console.warn('Fetch ARTISTAS falló, intentando caché...', e);
        if ('caches' in window) {
            try {
                const cache = await caches.open(API_CACHE);
                const cached = await cache.match(url);
                if (cached) return await cached.json();
            } catch (err) {
                console.error('Error leyendo caché:', err);
            }
        }
        return [];
    }
}

async function fetchCanciones() {
    const url = API_SONGS;
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('Error al obtener canciones');
        const data = await res.json();
        try {
            if ('caches' in window) {
                const cache = await caches.open(API_CACHE);
                cache.put(url, new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } }));
            }
        } catch (err) {
            console.warn('No se pudo cachear respuesta API (songs):', err);
        }
        return data;
    } catch (e) {
        console.warn('Fetch CANCIONES falló, intentando caché...', e);
        if ('caches' in window) {
            try {
                const cache = await caches.open(API_CACHE);
                const cached = await cache.match(url);
                if (cached) return await cached.json();
            } catch (err) {
                console.error('Error leyendo caché canciones:', err);
            }
        }
        return [];
    }
}

function renderArtistas(artistas) {
    const container = document.getElementById('artistasList');
    const select = document.getElementById('artistaSelect');
    if (!container || !select) return;
    container.innerHTML = '';
    select.innerHTML = '<option value="">Selecciona artista</option>';

    artistas.forEach(a => {
        const item = document.createElement('div');
        item.className = 'list-group-item';
        const nombre = document.createElement('h6');
        nombre.textContent = a.nombre;
        item.appendChild(nombre);

        const meta = document.createElement('div');
        meta.className = 'small text-muted';
        const nac = a.nacionalidad ? `Nacionalidad: ${a.nacionalidad}` : '';
        const fn = a.fechaNacimiento ? ` - Nac: ${a.fechaNacimiento}` : '';
        const gen = a.genero ? ` - Género: ${a.genero}` : '';
        meta.textContent = `${nac}${fn}${gen}`;
        item.appendChild(meta);

        container.appendChild(item);

        const opt = document.createElement('option');
        opt.value = a.idArtista ?? a.id ?? a.id_artista ?? '';
        opt.textContent = a.nombre;
        select.appendChild(opt);
    });
}

function renderCanciones(canciones) {
    const container = document.getElementById('cancionesList');
    if (!container) return;
    container.innerHTML = '';

    canciones.forEach(s => {
        const item = document.createElement('div');
        item.className = 'list-group-item';
        const title = document.createElement('h6');
        title.textContent = s.titulo;
        item.appendChild(title);

        const meta = document.createElement('div');
        meta.className = 'small text-muted';
        const album = s.album ? `Álbum: ${s.album}` : '';
        const ano = s.ano ? ` - Año: ${s.ano}` : '';
        const gen = s.genero ? ` - Género: ${s.genero}` : '';
        const artist = s.artistaNombre ? ` - ${s.artistaNombre}` : (s.artistaId ? ` - artistaId:${s.artistaId}` : '');
        meta.textContent = `${album}${ano}${gen}${artist}`;
        item.appendChild(meta);

        container.appendChild(item);
    });
}

async function load() {
    updateConnectionBadge();
    const pending = await getPendingQueue();
    pending.forEach(p => addPendingArtistToUI(p));
    const [artistas, canciones] = await Promise.all([fetchArtistas(), fetchCanciones()]);
    renderArtistas(artistas);
    renderCanciones(canciones);
}

document.addEventListener('DOMContentLoaded', () => {
    const formArt = document.getElementById('formArtista');
    if (formArt) {
        formArt.addEventListener('submit', async e => {
            e.preventDefault();
            const nombre = document.getElementById('nombre').value.trim();
            const nacionalidad = document.getElementById('nacionalidad').value.trim();
            const fechaNacimiento = document.getElementById('fechaNacimiento').value || null;
            const genero = document.getElementById('generoArtista').value.trim() || null;
            if (!nombre) return alert('Nombre requerido');

            const payload = { nombre, nacionalidad, fechaNacimiento, genero };

            if (navigator.onLine) {
                try {
                    const res = await fetch(API_ARTISTS, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    if (res.ok) {
                        formArt.reset();
                        await load();
                        return;
                    } else {
                        console.warn('Error creando artista online, se encolará:', await res.text());
                    }
                } catch (err) {
                    console.warn('Error fetch creando artista, se encolará:', err);
                }
            }

            // offline o error
            const pending = await enqueuePendingArtist(payload);
            addPendingArtistToUI(pending);
            formArt.reset();
        });
    }

    const formCanc = document.getElementById('formCancion');
    if (formCanc) {
        formCanc.addEventListener('submit', async e => {
            e.preventDefault();

            if (!navigator.onLine) {
                return alert('No estás conectado. No se pueden agregar canciones mientras estés offline.');
            }

            const titulo = document.getElementById('titulo').value.trim();
            const album = document.getElementById('album').value.trim() || null;
            const ano = parseInt(document.getElementById('ano').value) || null;
            const generoCancion = document.getElementById('generoCancion').value.trim() || null;
            const artistaId = document.getElementById('artistaSelect').value;

            if (!titulo || !artistaId) return alert('Título y artista obligatorios');

            const payload = { titulo, album, ano, genero: generoCancion, artistaId: Number(artistaId) };

            try {
                const res = await fetch(API_SONGS, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (res.ok) {
                    formCanc.reset();
                    await load();
                    alert('Canción creada');
                } else {
                    const text = await res.text();
                    console.error('Error creando canción:', text);
                    alert('Error creando canción (ver consola)');
                }
            } catch (err) {
                console.error('Fetch error:', err);
                alert('Error en la petición (ver consola)');
            }
        });
    }


    load().then(() => {
        if (navigator.onLine) processPendingQueue();
    });
});

async function processPendingQueue() {
    const queue = await getPendingQueue();
    if (!queue.length) return;
    for (const item of [...queue]) {
        try {
            const res = await fetch(API_ARTISTS, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(item.payload)
            });
            if (res.ok) {
                const created = await res.json();
                replacePendingArtistWithServer(item.tempId, created);
                await removePendingByTempId(item.tempId);
            } else {
                const text = await res.text();
                console.error('Sync error for', item.tempId, text);
                item.retries = (item.retries || 0) + 1;
                const currentQueue = await getPendingQueue();
                const idx = currentQueue.findIndex(i => i.tempId === item.tempId);
                if (idx !== -1) {
                    currentQueue[idx].retries = item.retries;
                    await savePendingQueue(currentQueue);
                }
            }
        } catch (err) {
            console.warn('No se pudo sincronizar (probablemente offline).', err);
            break;
        }
        await new Promise(r => setTimeout(r, backoffDelay(item.retries || 0)));
    }
}

// detectar online/offline
window.addEventListener('online', () => {
    updateConnectionBadge();
    processPendingQueue();
});
window.addEventListener('offline', updateConnectionBadge);
function updateConnectionBadge() {
    const el = document.getElementById('connStatus');
    if (!el) return;
    if (navigator.onLine) {
        el.textContent = 'Online';
        el.className = 'badge bg-success';
    } else {
        el.textContent = 'Offline';
        el.className = 'badge bg-secondary';
    }
}

// retry periódico (opcional)
setInterval(async () => {
    const q = await getPendingQueue();
    if (q.length && navigator.onLine) processPendingQueue();
}, 30000);