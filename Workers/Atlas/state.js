/**
 * ATLAS — State Manager
 * Owns the tree data model. All mutations go through here.
 *
 * Mode FSM: BUILD → MENU → SELECTING → READY → ANIMATION → BUILD
 */

const AtlasInternalState = (() => {
    // ── valid modes ──────────────────────────────────────────────────────────
    const MODES = ['BUILD', 'MENU', 'SELECTING', 'READY', 'ANIMATION'];

    // ── internal store ──────────────────────────────────────────────────────
    let _nodes = {};          // id → node object
    let _root = null;        // id of root node
    let _nextId = 0;
    let _mode = 'BUILD';

    // ── animation context ────────────────────────────────────────────────────
    let _animatedNodeId = null;  // id of the node currently lit up during traversal

    // ── selection context (populated during MENU → SELECTING → READY) ─────
    let _selection = {
        action: null,     // 'insert' | 'delete' | 'search' | 'traversal'
        method: null,     // e.g. 'bfs', 'dfs-inorder', etc. (for traversal)
        nodeId: null,     // id of the node the user clicked in SELECTING mode
    };

    // ── helpers ─────────────────────────────────────────────────────────────
    function _makeId() { return `n${_nextId++}`; }

    function _createNode({ parentId = null, side = null, depth = 0 } = {}) {
        const id = _makeId();
        const node = {
            id,
            value: null,     // numeric value, null until activated
            left: null,     // child node id
            right: null,     // child node id
            parentId,
            side,               // 'left' | 'right' | null (root)
            depth,
            isActive: false,
            // positions computed by layout engine
            x: 0,
            y: 0,
        };
        _nodes[id] = node;
        return node;
    }



    /** Initialise the tree — creates the dimmed root placeholder. */
    function init() {
        _nodes = {};
        _root = null;
        _nextId = 0;
        _mode = 'BUILD';
        clearSelection();
        const root = _createNode({ depth: 0 });
        _root = root.id;
        return root;
    }

    /**
     * Activate a dimmed node: set value, mark active, generate children.
     * Returns the two new child placeholder nodes.
     */
    function activateNode(id, value) {
        if (_mode !== 'BUILD') return null;
        const node = _nodes[id];
        if (!node || node.isActive) return null;

        node.isActive = true;
        node.value = value;

        // spawn left child
        const leftChild = _createNode({ parentId: id, side: 'left', depth: node.depth + 1 });
        const rightChild = _createNode({ parentId: id, side: 'right', depth: node.depth + 1 });

        node.left = leftChild.id;
        node.right = rightChild.id;

        return { left: leftChild, right: rightChild };
    }

    // ── mode API ────────────────────────────────────────────────────────────
    function getMode() { return _mode; }

    function setMode(mode) {
        if (!MODES.includes(mode)) {
            console.warn(`[ATLAS STATE] Invalid mode: "${mode}"`);
            return;
        }
        _mode = mode;
    }

    // ── selection API ───────────────────────────────────────────────────────
    function getSelection() {
        return { action: _selection.action, method: _selection.method, nodeId: _selection.nodeId };
    }

    function setSelection(patch) {
        if (patch.action !== undefined) _selection.action = patch.action;
        if (patch.method !== undefined) _selection.method = patch.method;
        if (patch.nodeId !== undefined) _selection.nodeId = patch.nodeId;
    }

    function clearSelection() {
        _selection.action = null;
        _selection.method = null;
        _selection.nodeId = null;
    }

    function setSelectedNode(nodeId) {
        _selection.nodeId = nodeId;
    }

    // ── node accessors ──────────────────────────────────────────────────────
    function getNode(id) { return _nodes[id] ?? null; }
    function getAllNodes() { return Object.values(_nodes); }
    function getRootId() { return _root; }

    /** Backward-compatible: true whenever tree editing is disabled. */
    function isFrozen() { return _mode !== 'BUILD'; }

    function getSnapshot() {
        const activeNodes = getAllNodes().filter(n => n.isActive);

        const cleanNodes = activeNodes.map(n => ({
            id: n.id,
            value: n.value,
            left: n.left && _nodes[n.left]?.isActive ? n.left : null,
            right: n.right && _nodes[n.right]?.isActive ? n.right : null
        }));

        return {
            rootId: _nodes[_root]?.isActive ? _root : null,
            nodes: cleanNodes
        };
    }

    // Expose safe public accessors
    window.AtlasState = { getSnapshot };
    window.Bus = {
        getAtlas: () => ({
            snapshot: window.AtlasState.getSnapshot(),
            selection: getSelection(),
        }),
    };

    // ── animated-node API ────────────────────────────────────────────────────
    function getAnimatedNode()        { return _animatedNodeId; }
    function setAnimatedNode(id)      { _animatedNodeId = id; }
    function clearAnimatedNode()      { _animatedNodeId = null; }

    return {
        init, activateNode,
        getNode, getAllNodes, getRootId,
        isFrozen, getSnapshot,
        getMode, setMode,
        getSelection, setSelection, clearSelection, setSelectedNode,
        getAnimatedNode, setAnimatedNode, clearAnimatedNode,
    };
})();
