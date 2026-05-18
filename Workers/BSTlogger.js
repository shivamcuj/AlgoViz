/**
 * BSTLogger — Event-driven Activity Log
 *
 * Listens to Atlas Bus events and exposes a small hook API so input.js
 * can call BSTLogger.log() at every meaningful user interaction.
 *
 * Log types and their accent colours (left border):
 *   'info'       — #6c63ff  (purple)   general status, mode changes
 *   'action'     — #a78bfa  (violet)   user picked an action/method
 *   'select'     — #38bdf8  (sky blue) user clicked a node
 *   'animate'    — #fbbf24  (amber)    traversal / search step
 *   'found'      — #34d399  (emerald)  search target found
 *   'delete'     — #f87171  (red)      node deleted
 *   'success'    — #4ade80  (green)    operation complete
 *   'warn'       — #fb923c  (orange)   something not found / warnings
 *   'system'     — #94a3b8  (muted)    internal / reset messages
 */

const BSTLogger = (() => {

    // ── DOM refs ───────────────────────────────────────────────────────────────
    let _logArea  = null;   // scrollable div that holds log entries
    let _countBadge = null; // entry count badge in the header

    let _entryCount = 0;

    // ── type → colour map ──────────────────────────────────────────────────────
    const TYPE_COLOR = {
        info:    '#6c63ff',
        action:  '#a78bfa',
        select:  '#38bdf8',
        animate: '#fbbf24',
        found:   '#34d399',
        delete:  '#f87171',
        success: '#4ade80',
        warn:    '#fb923c',
        system:  '#64748b',
    };

    const TYPE_ICON = {
        info:    'ℹ',
        action:  '⚡',
        select:  '◎',
        animate: '▶',
        found:   '✓',
        delete:  '✕',
        success: '★',
        warn:    '⚠',
        system:  '⋯',
    };

    // ── init ───────────────────────────────────────────────────────────────────
    function init() {
        _logArea    = document.getElementById('bst-log-area');
        _countBadge = document.getElementById('bst-log-count');

        const clearBtn = document.getElementById('bst-log-clear');
        if (clearBtn) clearBtn.addEventListener('click', clear);

        // Attach to Bus events emitted by the DFS/BFS solvers
        _attachBusListeners();

        log('BST Logger ready. Build a tree to get started.', 'system');
    }

    // ── public log API ─────────────────────────────────────────────────────────
    /**
     * Append a log entry.
     * @param {string} message — HTML allowed (use sparingly, prefer text + highlights)
     * @param {string} type    — one of the TYPE_COLOR keys
     */
    function log(message, type = 'info') {
        if (!_logArea) return;

        _entryCount++;

        const color = TYPE_COLOR[type] ?? TYPE_COLOR.info;
        const icon  = TYPE_ICON[type]  ?? TYPE_ICON.info;

        const now = new Date();
        const ts  = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;

        const entry = document.createElement('div');
        entry.className = 'bst-log-entry';
        entry.style.borderLeftColor = color;
        entry.innerHTML = `
            <span class="bst-log-icon" style="color:${color}">${icon}</span>
            <span class="bst-log-body">${message}</span>
            <span class="bst-log-ts">${ts}</span>
        `;

        _logArea.appendChild(entry);
        _logArea.scrollTop = _logArea.scrollHeight;

        if (_countBadge) _countBadge.textContent = _entryCount;
    }

    /** Clear all entries. */
    function clear() {
        if (!_logArea) return;
        _logArea.innerHTML = '';
        _entryCount = 0;
        if (_countBadge) _countBadge.textContent = '0';
        log('Log cleared.', 'system');
    }

    // ── Bus listener — attach once ─────────────────────────────────────────────
    function _attachBusListeners() {
        if (!window.Bus) window.Bus = {};

        if (typeof window.Bus.on !== 'function') {
            const _listeners = {};
            window.Bus.on   = (e, fn) => { (_listeners[e] ??= []).push(fn); };
            window.Bus.emit = (e, d)  => (_listeners[e] ?? []).forEach(fn => fn(d));
        }

        // Fired by input.js on every confirmed submit
        window.Bus.on('atlas:selection-submitted', (payload) => {
            const { action, method, nodeId } = payload.selection;
            const node = AtlasInternalState.getNode(nodeId);
            const val  = node ? `<em style="color:#e2e8f0">${node.value}</em>` : '—';

            log(
                `Selection confirmed — Action: <strong>${action}</strong>` +
                (method ? `, Method: <strong>${method}</strong>` : '') +
                (nodeId ? `, Node: <strong style="color:#38bdf8">${nodeId}</strong> (value: ${val})` : ''),
                'info'
            );
        });
    }

    // ── hooks called directly from input.js ────────────────────────────────────
    //  (These are called by patched versions of the mode transitions)

    /** Called when the tree is submitted (BUILD → MENU). */
    function onTreeSubmitted(activeCount) {
        log(`Tree submitted with <strong>${activeCount}</strong> active node${activeCount !== 1 ? 's' : ''}.`, 'success');
        log('Choose an action from the menu.', 'info');
    }

    /** Called when user picks an action from the menu. */
    function onActionSelected(actionKey) {
        const labels = { insert: 'Insert', delete: 'Delete', search: 'Search', traversal: 'Traversal' };
        log(`Action selected: <strong style="color:#a78bfa">${labels[actionKey] ?? actionKey}</strong>. Click a node on the canvas.`, 'action');
    }

    /** Called when user picks a traversal or search method. */
    function onMethodSelected(action, methodKey) {
        const labels = {
            'bfs':           'BFS — Level Order',
            'dfs-inorder':   'DFS — In-order',
            'dfs-preorder':  'DFS — Pre-order',
            'dfs-postorder': 'DFS — Post-order',
        };
        const actionLabel = action === 'search' ? 'Search' : 'Traversal';
        log(
            `${actionLabel} method: <strong style="color:#a78bfa">${labels[methodKey] ?? methodKey}</strong>. ` +
            (action === 'search' ? 'Click the node to search for.' : 'Click Confirm to begin.'),
            'action'
        );
    }

    /** Called when user clicks a node in SELECTING mode. */
    function onNodeSelected(nodeId, value, action) {
        const actionHints = {
            insert:    'ready to insert at this position',
            delete:    'will be <span style="color:#f87171">deleted</span>',
            search:    'will be <span style="color:#38bdf8">searched</span>',
            traversal: 'traversal will start from root',
        };
        const hint = actionHints[action] ?? '';
        log(
            `Node clicked — ID: <strong style="color:#38bdf8">${nodeId}</strong>, Value: <strong style="color:#e2e8f0">${value}</strong>` +
            (hint ? ` <span style="color:#64748b">(${hint})</span>` : '') +
            `. Press <em>Confirm Selection</em>.`,
            'select'
        );
    }

    /** Called each step during traversal animation. */
    function onTraversalStep(method, step, total, nodeId, value) {
        log(
            `<span style="color:#fbbf24">[${method.toUpperCase()}]</span> Step ${step}/${total} — ` +
            `Node <strong style="color:#38bdf8">${nodeId}</strong> (value: <strong>${value}</strong>)`,
            'animate'
        );
    }

    /** Called each step during search animation. */
    function onSearchStep(method, step, total, nodeId, value) {
        log(
            `<span style="color:#fbbf24">[SEARCH·${method.toUpperCase()}]</span> Visiting ${step}/${total} — ` +
            `Node <strong style="color:#38bdf8">${nodeId}</strong> (value: <strong>${value}</strong>)`,
            'animate'
        );
    }

    /** Called when search finds the target. */
    function onSearchFound(method, nodeId, value) {
        log(
            `<span style="color:#34d399">✓ FOUND</span> — ` +
            `Node <strong style="color:#38bdf8">${nodeId}</strong> (value: <strong style="color:#e2e8f0">${value}</strong>) ` +
            `located via <strong>${method.toUpperCase()}</strong>.`,
            'found'
        );
    }

    /** Called when search exhausts all nodes without finding the target. */
    function onSearchNotFound(method, targetId) {
        log(
            `<span style="color:#fb923c">✕ NOT FOUND</span> — ` +
            `Node <strong style="color:#38bdf8">${targetId}</strong> was not found ` +
            `using <strong>${method.toUpperCase()}</strong>.`,
            'warn'
        );
    }

    /** Called when a node is confirmed for deletion. */
    function onDeleteStart(nodeId, value) {
        log(
            `Deleting node <strong style="color:#f87171">${nodeId}</strong> (value: <strong>${value}</strong>)…`,
            'delete'
        );
    }

    /** Called after delete mutations are applied. */
    function onDeleteComplete(nodeId, value) {
        log(
            `Node <strong style="color:#f87171">${nodeId}</strong> (value: <strong>${value}</strong>) removed. Tree rebalanced.`,
            'success'
        );
    }

    /** Called when traversal / search / delete animation finishes — back to BUILD. */
    function onAnimationComplete(action) {
        const labels = { traversal: 'Traversal', search: 'Search', delete: 'Deletion' };
        log(`${labels[action] ?? action} complete. Tree returned to edit mode.`, 'success');
    }

    /** Called when tree is cleared. */
    function onTreeCleared() {
        log('Tree cleared. Start building a new tree.', 'system');
    }

    /** Called when a new node value is added during BUILD mode. */
    function onNodeActivated(nodeId, value) {
        log(
            `Node added — ID: <strong style="color:#38bdf8">${nodeId}</strong>, Value: <strong style="color:#4ade80">${value}</strong>.`,
            'info'
        );
    }

    // ── expose ─────────────────────────────────────────────────────────────────
    return {
        init, log, clear,
        // hooks
        onTreeSubmitted, onActionSelected, onMethodSelected,
        onNodeSelected, onNodeActivated,
        onTraversalStep, onSearchStep, onSearchFound, onSearchNotFound,
        onDeleteStart, onDeleteComplete, onAnimationComplete,
        onTreeCleared,
    };

})();
