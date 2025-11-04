// Service Worker ajustado: no asume iconos presentes
const CACHE_NAME = 'cancionesfavo-shell-v1';
const API_CACHE = 'cancionesfavo-api-v1';

const PRECACHE_URLS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/app.js',
    '/styles.css',
    '/sw-register.js'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(PRECACHE_URLS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    const expected = [CACHE_NAME, API_CACHE];
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.map(key => {
                if (!expected.includes(key)) return caches.delete(key);
            }))
        ).then(() => self.clients.claim())
    );
});

function isNavigationRequest(request) {
    return request.mode === 'navigate' ||
        (request.method === 'GET' && request.headers.get('accept') && request.headers.get('accept').includes('text/html'));
}

self.addEventListener('fetch', event => {
    const req = event.request;
    const url = new URL(req.url);

    // no manejar peticiones cross-origin
    if (!req.url.startsWith(self.location.origin)) return;

    // API requests
    if (url.pathname.startsWith('/api/')) {
        if (req.method !== 'GET') {
            event.respondWith(
                fetch(req).catch(() =>
                    new Response(JSON.stringify({ error: 'offline' }), {
                        status: 503,
                        headers: { 'Content-Type': 'application/json' }
                    })
                )
            );
            return;
        }

        event.respondWith(
            fetch(req)
                .then(networkResponse => {
                    const clone = networkResponse.clone();
                    caches.open(API_CACHE).then(cache => cache.put(req, clone));
                    return networkResponse;
                })
                .catch(() =>
                    caches.match(req).then(cached => cached || new Response(JSON.stringify([]), {
                        status: 200, headers: { 'Content-Type': 'application/json' }
                    }))
                )
        );
        return;
    }

    if (isNavigationRequest(req)) {
        event.respondWith(
            caches.match('/index.html').then(cached => cached || fetch(req).catch(() => new Response('<h1>Offline</h1><p>Conéctate para cargar la aplicación.</p>', { headers: { 'Content-Type': 'text/html' } })))
        );
        return;
    }

    event.respondWith(
        caches.match(req).then(cached => cached || fetch(req).then(networkResponse => {
            if (req.method === 'GET' && (req.destination === 'script' || req.destination === 'style' || req.destination === 'image' || req.destination === 'document')) {
                const cloned = networkResponse.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(req, cloned));
            }
            return networkResponse;
        }).catch(() => {
            // si falla y era una imagen, no hay icon fallback -> simplemente indefinido
            if (req.destination === 'image') {
                return new Response(null, { status: 404 });
            }
        }))
    );
});