/**
 * DFS Post-Order Traversal — Solver
 *
 * Reads the final submitted Atlas snapshot from window.AtlasTreeOutput
 * (set by input.js on every "Confirm Selection" submit) and performs a
 * recursive DFS post-order walk: Left → Right → Root.
 *
 * The ordered visit array is stored on the global Bus as:
 *   Bus.traversalResult  →  string[]   (node IDs in post-order sequence)
 *
 * The module also registers a listener on the atlas:selection-submitted
 * event so it runs automatically whenever the user confirms a traversal
 * selection with method === 'dfs-postorder'.
 *
 * Manual trigger:
 *   DFSPostOrder.run()           // uses window.AtlasTreeOutput
 *   DFSPostOrder.runOn(snapshot)  // accepts a raw snapshot object
 */

const DFSPostOrder = (() => {

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
     * Recursive post-order walk: Left → Right → Root.
     * Pushes the node's ID into `result` at each visit.
     *
     * @param {string|null} nodeId   — current node id (null = base case)
     * @param {Object}      map      — id→node lookup
     * @param {string[]}    result   — accumulator array (mutated in place)
     */
    function _postorder(nodeId, map, result) {
        if (!nodeId || !map[nodeId]) return;          // base case: null / missing

        const node = map[nodeId];

        _postorder(node.left,  map, result);          // 1. recurse left
        _postorder(node.right, map, result);          // 2. recurse right
        result.push(node.id);                         // 3. visit current node — store id
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Run DFS post-order on an explicit snapshot object.
     *
     * @param {{ rootId: string|null, nodes: Array }} snapshot
     * @returns {string[]}  ordered node-ID array (post-order sequence)
     */
    function runOn(snapshot) {
        if (!snapshot || !snapshot.rootId || !Array.isArray(snapshot.nodes)) {
            console.warn('[DFS-POSTORDER] Invalid or empty snapshot. Aborting.');
            return [];
        }

        const map    = _buildMap(snapshot.nodes);
        const result = [];

        _postorder(snapshot.rootId, map, result);

        // Publish to global Bus so every module can read it
        if (window.Bus) {
            window.Bus.traversalResult = result;
        }

        console.log(
            '%c[DFS-POSTORDER] Traversal complete — node IDs →',
            'color:#a78bfa;font-weight:bold',
            result
        );

        return result;
    }

    /**
     * Run DFS post-order using the latest submitted Atlas output
     * (window.AtlasTreeOutput, set by input.js on every submit).
     *
     * @returns {string[]}  ordered node-ID array, or [] if no data available
     */
    function run() {
        if (!window.AtlasTreeOutput) {
            console.warn('[DFS-POSTORDER] No submitted Atlas data found. Submit the tree first.');
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

            if (selection.action === 'traversal' && selection.method === 'dfs-postorder') {
                console.log(
                    '%c[DFS-POSTORDER] Triggered via Bus event.',
                    'color:#38bdf8;font-weight:bold'
                );
                runOn(snapshot);
            }
        });
    })();

    // ── Expose public interface ───────────────────────────────────────────────
    return { run, runOn };

})();
