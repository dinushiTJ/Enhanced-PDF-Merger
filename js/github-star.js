(function () {
    var REPO = 'dinushiTJ/Enhanced-PDF-Merger';
    var CACHE_KEY = 'ghStarCache';
    var CACHE_TTL_MS = 60 * 1000;

    function formatCount(n) {
        if (n >= 1000) {
            return (Math.floor(n / 100) / 10) + 'k';
        }
        return String(n);
    }

    function showCount(n) {
        var el = document.querySelector('.github-star-count');
        if (!el) return;
        el.textContent = formatCount(n);
        el.style.display = '';
    }

    function readCache() {
        try {
            var raw = localStorage.getItem(CACHE_KEY);
            if (!raw) return null;
            var data = JSON.parse(raw);
            if (typeof data.count !== 'number' || typeof data.ts !== 'number') return null;
            if (Date.now() - data.ts > CACHE_TTL_MS) return null;
            return data.count;
        } catch (e) {
            return null;
        }
    }

    function writeCache(count) {
        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({ count: count, ts: Date.now() }));
        } catch (e) {
            // ignore (private browsing, storage disabled, etc.)
        }
    }

    function fetchCount() {
        fetch('https://api.github.com/repos/' + REPO)
            .then(function (res) {
                if (!res.ok) throw new Error('bad response');
                return res.json();
            })
            .then(function (data) {
                if (typeof data.stargazers_count === 'number') {
                    writeCache(data.stargazers_count);
                    showCount(data.stargazers_count);
                }
            })
            .catch(function () {
                // fail silently, button stays as icon + "Star"
            });
    }

    var cached = readCache();
    if (cached !== null) {
        showCount(cached);
    } else {
        fetchCount();
    }
})();
