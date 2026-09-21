// Shared "1-3, 5, 8-10" page-range parser, returns 0-based page indices.
const PageRanges = (() => {
    function parse(text, pageCount) {
        const indices = new Set();
        for (const part of text.split(',')) {
            const trimmed = part.trim();
            if (!trimmed) continue;
            const m = trimmed.match(/^(\d+)\s*-\s*(\d+)$/) || trimmed.match(/^(\d+)$/);
            if (!m) throw new Error(`Could not understand the range "${trimmed}". Use a format like 1-3, 5, 8-10.`);
            let start = parseInt(m[1], 10);
            let end = m[2] ? parseInt(m[2], 10) : start;
            if (start > end) [start, end] = [end, start];
            start = Math.max(1, start);
            end = Math.min(pageCount, end);
            for (let p = start; p <= end; p++) indices.add(p - 1);
        }
        return Array.from(indices).sort((a, b) => a - b);
    }

    // Blank input = every page.
    function parseOrAll(text, pageCount) {
        if (!text || !text.trim()) {
            return Array.from({ length: pageCount }, (_, i) => i);
        }
        return parse(text, pageCount);
    }

    return { parse, parseOrAll };
})();
