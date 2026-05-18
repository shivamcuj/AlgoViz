/**
 * BFS Level-Order Traversal — Solver
 *
 * Reads the final submitted Atlas snapshot from window.AtlasTreeOutput
 * (set by input.js on every "Confirm Selection" submit) and performs a
 * BFS level-order walk using a queue: visits nodes level by level,
 * left child before right child.
 *
 * The ordered visit array is stored on the global Bus as:
 *   Bus.traversalResult  →  string[]   (node IDs in level-order sequence)
 *
 * The module also registers a listener on the atlas:selection-submitted
 * event so it runs automatically whenever the user confirms a traversal
 * selection with method === 'bfs'.
 *
 * Manual trigger:
 *   BFSLevelOrder.run()           // uses window.AtlasTreeOutput
 *   BFSLevelOrder.runOn(snapshot)  // accepts a raw snapshot object
 */

const BFSLevelOrder = (() => {

    // ── Core algorithm ────────────────────────────────────────────────────────

    /**
     * Build a fast id→node lookup map from the flat nodes array.
     * @param {Array}  nodes  — array of { id, value, left, right }
     * @returns {Object}  map: id → node
     */
    function _buildMap(nodes) {
        const map = {};
        for (const node of nodes) {
            map[node.id] = node;
        }
        return map;
    }

    /**
     * Iterative BFS level-order walk using a queue.
     * Pushes each node's ID into `result` in the order visited.
     *
     * @param {string|null} rootId   — ID of the root node
     * @param {Object}      map      — id→node lookup
     * @returns {string[]}  ordered node-ID array (level-order sequence)
     */
    function _bfs(rootId, map) {
        const result = [];
        if (!rootId || !map[rootId]) return result;

        const queue = [rootId];

        while (queue.length > 0) {
            const currentId = queue.shift();
            const node = map[currentId];
            if (!node) continue;

            result.push(node.id);                         // visit current node

            if (node.left  && map[node.left])  queue.push(node.left);
            if (node.right && map[node.right]) queue.push(node.right);
        }

        return result;
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Run BFS level-order on an explicit snapshot object.
     *
     * @param {{ rootId: string|null, nodes: Array }} snapshot
     * @returns {string[]}  ordered node-ID array (level-order sequence)
     */
    function runOn(snapshot) {
        if (!snapshot || !snapshot.rootId || !Array.isArray(snapshot.nodes)) {
            console.warn('[BFS-LEVELORDER] Invalid or empty snapshot. Aborting.');
            return [];
        }

        const map    = _buildMap(snapshot.nodes);
        const result = _bfs(snapshot.rootId, map);

        // Publish to global Bus so every module can read it
        if (window.Bus) {
            window.Bus.traversalResult = result;
        }

        console.log(
            '%c[BFS-LEVELORDER] Traversal complete — node IDs →',
            'color:#a78bfa;font-weight:bold',
            result
        );

        return result;
    }

    /**
     * Run BFS level-order using the latest submitted Atlas output
     * (window.AtlasTreeOutput, set by input.js on every submit).
     *
     * @returns {string[]}  ordered node-ID array, or [] if no data available
     */
    function run() {
        if (!window.AtlasTreeOutput) {
            console.warn('[BFS-LEVELORDER] No submitted Atlas data found. Submit the tree first.');
            return [];
        }
        return runOn(window.AtlasTreeOutput.snapshot);
    }

    // ── Auto-trigger on atlas:selection-submitted ─────────────────────────────

    (function _attachBusListener() {
        if (!window.Bus) window.Bus = {};

        if (typeof window.Bus.on !== 'function') {
            const _listeners = {};

            window.Bus.on = function (event, fn) {
                if (!_listeners[event]) _listeners[event] = [];
                _listeners[event].push(fn);
            };

            window.Bus.emit = function (event, data) {
                (_listeners[event] || []).forEach(fn => fn(data));
            };
        }

        window.Bus.on('atlas:selection-submitted', (payload) => {
            const { selection, snapshot } = payload;

            if (selection.action === 'traversal' && selection.method === 'bfs') {
                console.log(
                    '%c[BFS-LEVELORDER] Triggered via Bus event.',
                    'color:#38bdf8;font-weight:bold'
                );
                runOn(snapshot);
            }
        });
    })();

    // ── Expose public interface ───────────────────────────────────────────────
    return { run, runOn };

})();
