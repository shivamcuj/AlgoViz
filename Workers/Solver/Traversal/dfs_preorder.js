/**
 * DFS Pre-Order Traversal — Solver
 *
 * Reads the final submitted Atlas snapshot from window.AtlasTreeOutput
 * (set by input.js on every "Confirm Selection" submit) and performs a
 * recursive DFS pre-order walk: Root → Left → Right.
 *
 * The ordered visit array is stored on the global Bus as:
 *   Bus.traversalResult  →  string[]   (node IDs in pre-order sequence)
 *
 * The module also registers a listener on the atlas:selection-submitted
 * event so it runs automatically whenever the user confirms a traversal
 * selection with method === 'dfs-preorder'.
 *
 * Manual trigger:
 *   DFSPreOrder.run()          // uses window.AtlasTreeOutput
 *   DFSPreOrder.runOn(snapshot) // accepts a raw snapshot object
 */

const DFSPreOrder = (() => {

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
     * Recursive pre-order walk: Root → Left → Right.
     * Pushes the node's ID into `result` at each visit.
     *
     * @param {string|null} nodeId   — current node id (null = base case)
     * @param {Object}      map      — id→node lookup
     * @param {string[]}    result   — accumulator array (mutated in place)
     */
    function _preorder(nodeId, map, result) {
        if (!nodeId || !map[nodeId]) return;          // base case: null / missing

        const node = map[nodeId];

        result.push(node.id);                         // 1. visit current node — store id
        _preorder(node.left,  map, result);           // 2. recurse left
        _preorder(node.right, map, result);           // 3. recurse right
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Run DFS pre-order on an explicit snapshot object.
     *
     * @param {{ rootId: string|null, nodes: Array }} snapshot
     * @returns {string[]}  ordered node-ID array (pre-order sequence)
     */
    function runOn(snapshot) {
        if (!snapshot || !snapshot.rootId || !Array.isArray(snapshot.nodes)) {
            console.warn('[DFS-PREORDER] Invalid or empty snapshot. Aborting.');
            return [];
        }

        const map    = _buildMap(snapshot.nodes);
        const result = [];

        _preorder(snapshot.rootId, map, result);

        // Publish to global Bus so every module can read it
        if (window.Bus) {
            window.Bus.traversalResult = result;
        }

        console.log(
            '%c[DFS-PREORDER] Traversal complete — node IDs →',
            'color:#a78bfa;font-weight:bold',
            result
        );

        return result;
    }

    /**
     * Run DFS pre-order using the latest submitted Atlas output
     * (window.AtlasTreeOutput, set by input.js on every submit).
     *
     * @returns {string[]}  ordered node-ID array, or [] if no data available
     */
    function run() {
        if (!window.AtlasTreeOutput) {
            console.warn('[DFS-PREORDER] No submitted Atlas data found. Submit the tree first.');
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

            if (selection.action === 'traversal' && selection.method === 'dfs-preorder') {
                console.log(
                    '%c[DFS-PREORDER] Triggered via Bus event.',
                    'color:#38bdf8;font-weight:bold'
                );
                runOn(snapshot);
            }
        });
    })();

    // ── Expose public interface ───────────────────────────────────────────────
    return { run, runOn };

})();
