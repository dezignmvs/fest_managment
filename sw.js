const CACHE_NAME = 'festie-cache-v9'; // Increment this to force update
const URLS_TO_CACHE = [
    './',
    './index.html',
    './dashboard.html',
    './innerDashboard.html',
    './allCandidates.html',
    './allPrograms.html',
    './addSection.html',
    './addTeam.html',
    './addUser.html',
    './registrdProgram.html',
    './viewCandidateData.html',
    './viewProgramData.html',
    './viewSectionData.html',
    './viewTeamData.html',
    './teamDash.html',
    './tmPrograms.html',
    './tmTopicReg.html',
    './logo-192.svg',
    './logo-512.svg',
    './manifest.json',
    'https://cdn.tailwindcss.com',
    'https://cdn-uicons.flaticon.com/2.1.0/uicons-regular-rounded/css/uicons-regular-rounded.css',
    'https://cdn.jsdelivr.net/npm/toastify-js/src/toastify.min.css',
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
    'https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js',
    'https://www.gstatic.com/firebasejs/8.10.1/firebase-auth.js',
    'https://www.gstatic.com/firebasejs/8.10.1/firebase-firestore.js',
    'https://cdn.jsdelivr.net/npm/toastify-js'
];

// Add version to URLs to bypass browser HTTP cache when updating the service worker cache
const VERSIONED_URLS = URLS_TO_CACHE.map(url => {
    if (url.startsWith('http') || url === './') return url;
    return `${url}?v=${CACHE_NAME}`;
});

// Install event: cache the app shell
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Service Worker: Caching App Shell with cache busting');
                return cache.addAll(VERSIONED_URLS);
            })
    );
});

// Activate event: clean up old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Service Worker: Clearing old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch event: Network-first, fallback to cache
self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;

    // Force our own files to bypass the browser's HTTP disk cache 
    const fetchOptions = {};
    if (event.request.url.startsWith(self.location.origin)) {
        fetchOptions.cache = 'no-cache';
    }

    event.respondWith(
        fetch(event.request, fetchOptions)
            .then(response => {
                const responseClone = response.clone();
                caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, responseClone);
                });
                return response;
            }).catch(() => {
                return caches.match(event.request, { ignoreSearch: true });
        })
    );
});

// Message event: listen for skipWaiting
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});