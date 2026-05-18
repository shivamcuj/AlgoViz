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

    /**
     * Replay a list of mutation descriptors produced by BSTDelete.runOn().
     * Each mutation is one of:
     *   { op:'setValue',   id, value }
     *   { op:'setLink',    id, side, childId }  — side: 'left'|'right'
     *   { op:'setParent',  id, parentId, side }
     *   { op:'removeNode', id }                 — removes node + its dimmed placeholders
     *   { op:'setRoot',    id }
     *   { op:'deactivate', id }                 — make the node a dimmed placeholder
     *
     * @param {Array} mutations
     */
    function applyDeleteMutations(mutations) {
        for (const m of mutations) {
            switch (m.op) {

                case 'setValue': {
                    const n = _nodes[m.id];
                    if (n) n.value = m.value;
                    break;
                }

                case 'setLink': {
                    const n = _nodes[m.id];
                    if (n) {
                        n[m.side] = m.childId;   // null or an id
                    }
                    break;
                }

                case 'setParent': {
                    const n = _nodes[m.id];
                    if (n) {
                        n.parentId = m.parentId;
                        n.side     = m.side;
                    }
                    break;
                }

                case 'removeNode': {
                    const n = _nodes[m.id];
                    if (!n) break;

                    // Also purge any dimmed placeholder children that are now
                    // orphaned (they were the deleted node's empty slots).
                    function _purge(id) {
                        const node = _nodes[id];
                        if (!node) return;
                        if (node.left)  _purge(node.left);
                        if (node.right) _purge(node.right);
                        delete _nodes[id];
                    }

                    // Only recursively purge inactive (dimmed) children
                    if (n.left  && _nodes[n.left]  && !_nodes[n.left].isActive)  _purge(n.left);
                    if (n.right && _nodes[n.right] && !_nodes[n.right].isActive) _purge(n.right);

                    delete _nodes[m.id];
                    break;
                }

                case 'setRoot': {
                    _root = m.id;
                    break;
                }

                case 'deactivate': {
                    // Node becomes a dimmed placeholder again (empty tree case)
                    const n = _nodes[m.id];
                    if (n) {
                        n.isActive = false;
                        n.value    = null;
                        // purge any children it still holds
                        if (n.left)  { delete _nodes[n.left];  n.left  = null; }
                        if (n.right) { delete _nodes[n.right]; n.right = null; }
                    }
                    break;
                }

                default:
                    console.warn('[ATLAS STATE] Unknown delete mutation op:', m.op);
            }
        }
    }

    /**
     * Activate the correct placeholder node for a BST insert operation.
     * Works outside BUILD mode (used after tree is submitted).
     *
     * Cases:
     *   isRoot === true   — activate the existing root placeholder (empty tree)
     *   parentId !== null — activate parent[side] placeholder
     *
     * @param {string|null} parentId
     * @param {'left'|'right'|null} side
     * @param {number} value
     * @param {boolean} isRoot
     * @returns {boolean} true on success
     */
    function applyInsertMutation(parentId, side, value, isRoot = false) {
        let placeholderId;

        if (isRoot) {
            // Empty-tree case: the root node should already be a dimmed placeholder
            placeholderId = _root;
        } else {
            const parent = _nodes[parentId];
            if (!parent) {
                console.warn(`[ATLAS STATE] applyInsertMutation: parent "${parentId}" not found.`);
                return false;
            }
            placeholderId = parent[side];
        }

        const node = _nodes[placeholderId];
        if (!node) {
            console.warn(`[ATLAS STATE] applyInsertMutation: placeholder "${placeholderId}" not found.`);
            return false;
        }
        if (node.isActive) {
            console.warn(`[ATLAS STATE] applyInsertMutation: node "${placeholderId}" is already active.`);
            return false;
        }

        // Activate the placeholder
        node.isActive = true;
        node.value    = value;

        // Spawn fresh placeholder children
        const leftChild  = _createNode({ parentId: placeholderId, side: 'left',  depth: node.depth + 1 });
        const rightChild = _createNode({ parentId: placeholderId, side: 'right', depth: node.depth + 1 });
        node.left  = leftChild.id;
        node.right = rightChild.id;

        console.log(
            `%c[ATLAS STATE] Inserted value ${value} at node "${placeholderId}"`,
            'color:#4ade80;font-weight:bold'
        );
        return true;
    }

    /**
     * Replace a node's value with `newRootValue` and rebuild its entire subtree
     * as a valid BST using the `valuesToReinsert` array.
     *
     * Steps:
     *   1. Set node[nodeId].value = newRootValue
     *   2. Purge all descendants of nodeId from _nodes
     *   3. Give nodeId fresh placeholder children
     *   4. BST-insert each value from valuesToReinsert into the subtree
     *
     * @param {string}   nodeId            — ID of the node to overwrite
     * @param {number}   newRootValue      — new value for that node
     * @param {number[]} valuesToReinsert  — old subtree values (incl. old root value)
     * @returns {boolean}
     */
    function rebuildSubtreeAt(nodeId, newRootValue, valuesToReinsert) {
        const node = _nodes[nodeId];
        if (!node || !node.isActive) {
            console.warn(`[ATLAS STATE] rebuildSubtreeAt: node "${nodeId}" not found or inactive.`);
            return false;
        }

        // 1. Set the new value
        node.value = newRootValue;

        // 2. Purge all descendants (children stay as placeholders; we delete them entirely
        //    and create fresh ones so depth/parent metadata is clean).
        function _purgeAll(id) {
            const n = _nodes[id];
            if (!n) return;
            if (n.left)  _purgeAll(n.left);
            if (n.right) _purgeAll(n.right);
            delete _nodes[id];
        }
        if (node.left)  { _purgeAll(node.left);  node.left  = null; }
        if (node.right) { _purgeAll(node.right); node.right = null; }

        // 3. Spawn fresh placeholder children
        const lc = _createNode({ parentId: nodeId, side: 'left',  depth: node.depth + 1 });
        const rc = _createNode({ parentId: nodeId, side: 'right', depth: node.depth + 1 });
        node.left  = lc.id;
        node.right = rc.id;

        // 4. BST-insert each value into the subtree rooted at nodeId
        function _subtreeInsert(rootId, value) {
            let curId = rootId;
            while (true) {
                const cur = _nodes[curId];
                if (!cur) break;

                const side     = value < cur.value ? 'left' : 'right';
                const childId  = cur[side];
                const child    = _nodes[childId];

                if (!child) break;   // structural error guard

                if (child.isActive) {
                    curId = childId;  // descend
                } else {
                    // Activate this placeholder
                    child.isActive = true;
                    child.value    = value;
                    const newLc = _createNode({ parentId: childId, side: 'left',  depth: child.depth + 1 });
                    const newRc = _createNode({ parentId: childId, side: 'right', depth: child.depth + 1 });
                    child.left  = newLc.id;
                    child.right = newRc.id;
                    break;
                }
            }
        }

        for (const v of valuesToReinsert) {
            _subtreeInsert(nodeId, v);
        }

        console.log(
            `%c[ATLAS STATE] Subtree at "${nodeId}" rebuilt with root=${newRootValue}, ` +
            `reinserted: [${valuesToReinsert.join(', ')}]`,
            'color:#4ade80;font-weight:bold'
        );
        return true;
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
        init, activateNode, applyDeleteMutations, applyInsertMutation, rebuildSubtreeAt,
        getNode, getAllNodes, getRootId,
        isFrozen, getSnapshot,
        getMode, setMode,
        getSelection, setSelection, clearSelection, setSelectedNode,
        getAnimatedNode, setAnimatedNode, clearAnimatedNode,
    };
})();
