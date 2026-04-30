/**
 * DFS In-Order Traversal — Solver
 *
 * Reads the final submitted Atlas snapshot from window.AtlasTreeOutput
 * (set by input.js on every "Confirm Selection" submit) and performs a
 * recursive DFS in-order walk: Left → Root → Right.
 *
 * The ordered visit array is stored on the global Bus as:
 *   Bus.traversalResult  →  number[]   (node values in in-order sequence)
 *
 * The module also registers a listener on the atlas:selection-submitted
 * event so it runs automatically whenever the user confirms a traversal
 * selection with method === 'dfs-inorder'.
 *
 * Manual trigger (e.g. from the console or another module):
 *   DFSInOrder.run()   // uses window.AtlasTreeOutput
 *   DFSInOrder.runOn(snapshot)  // accepts a raw snapshot object
 */

const DFSInOrder = (() => {

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
     * Recursive in-order walk: Left → Visit → Right.
     * Pushes the node's numeric value into `result` at each visit.
     *
     * @param {string|null} nodeId   — current node id (null = base case)
     * @param {Object}      map      — id→node lookup
     * @param {number[]}    result   — accumulator array (mutated in place)
     */
    function _inorder(nodeId, map, result) {
        if (!nodeId || !map[nodeId]) return;          // base case: null / missing

        const node = map[nodeId];

        _inorder(node.left,  map, result);            // 1. recurse left
        result.push(node.id);                         // 2. visit current node — store id
        _inorder(node.right, map, result);            // 3. recurse right
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Run DFS in-order on an explicit snapshot object.
     *
     * @param {{ rootId: string|null, nodes: Array }} snapshot
     * @returns {string[]}  ordered node-ID array (in-order sequence)
     */
    function runOn(snapshot) {
        if (!snapshot || !snapshot.rootId || !Array.isArray(snapshot.nodes)) {
            console.warn('[DFS-INORDER] Invalid or empty snapshot. Aborting.');
            return [];
        }

        const map    = _buildMap(snapshot.nodes);
        const result = [];

        _inorder(snapshot.rootId, map, result);

        // Publish to global Bus so every module can read it
        if (window.Bus) {
            window.Bus.traversalResult = result;
        }

        console.log(
            '%c[DFS-INORDER] Traversal complete — node IDs →',
            'color:#a78bfa;font-weight:bold',
            result
        );

        return result;
    }

    /**
     * Run DFS in-order using the latest submitted Atlas output
     * (window.AtlasTreeOutput, set by input.js on every submit).
     *
     * @returns {string[]}  ordered node-ID array, or [] if no data available
     */
    function run() {
        if (!window.AtlasTreeOutput) {
            console.warn('[DFS-INORDER] No submitted Atlas data found. Submit the tree first.');
            return [];
        }
        return runOn(window.AtlasTreeOutput.snapshot);
    }

    // ── Auto-trigger on atlas:selection-submitted ─────────────────────────────
    //
    // atlas.js calls Bus.emit('atlas:selection-submitted', payload) whenever the
    // user confirms a selection. We hook in here to run automatically when the
    // chosen method is 'dfs-inorder'.

    (function _attachBusListener() {
        // Bus.emit / Bus.on may not exist yet (state.js only adds getAtlas).
        // We extend Bus with a minimal pub/sub if it is absent, so this module
        // stays self-contained and does not require changes to state.js.
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

            if (selection.action === 'traversal' && selection.method === 'dfs-inorder') {
                console.log(
                    '%c[DFS-INORDER] Triggered via Bus event.',
                    'color:#38bdf8;font-weight:bold'
                );
                runOn(snapshot);
            }
        });
    })();

    // ── Expose public interface ───────────────────────────────────────────────
    return { run, runOn };

})();
