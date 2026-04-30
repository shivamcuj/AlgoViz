/**
 * ATLAS — Input Handler
 * Manages all user interaction across mode transitions:
 *
 *   BUILD      — click dimmed node → open value prompt, build tree
 *   MENU       — action menu displayed, tree editing disabled
 *   SELECTING  — click active node → highlight + store selection
 *   READY      — submit button re-enabled to confirm selection
 *
 * Canvas panning (right-click drag) and hover work in ALL modes.
 */

const AtlasInput = (() => {

    let _canvas = null;
    let _overlay = null;   // the floating input DOM element
    let _pendingNodeId = null;
    let _onSubmit = null;  // callback({ snapshot, selection })

    // ── panning state ──────────────────────────────────────────────────────────
    let _isPanning = false;
    let _panOriginX = 0;   // mouse X when pan started (px)
    let _panOriginY = 0;
    let _camOriginX = 0;   // camera offset when pan started
    let _camOriginY = 0;

    // ── DOM references ─────────────────────────────────────────────────────────
    let _submitBtn = null;
    let _buildBtn = null;
    let _algoSelector = null;
    let _controlsBar = null;   // the .atlas-controls wrapper
    let _clearTreeBtn = null;  // injected dynamically in BUILD mode

    // ── action definitions ─────────────────────────────────────────────────────
    const ACTIONS = [
        { key: 'insert',    label: 'Insert',    icon: '＋' },
        { key: 'delete',    label: 'Delete',    icon: '✕' },
        { key: 'search',    label: 'Search',    icon: '⌕' },
        { key: 'traversal', label: 'Traversal', icon: '↻' },
    ];

    const TRAVERSALS = [
        { key: 'bfs',           label: 'BFS — Level Order' },
        { key: 'dfs-inorder',   label: 'DFS — In-order' },
        { key: 'dfs-preorder',  label: 'DFS — Pre-order' },
        { key: 'dfs-postorder', label: 'DFS — Post-order' },
    ];

    // ── init ─────────────────────────────────────────────────────────────────
    function init(canvas, onSubmitCallback) {
        _canvas = canvas;
        _onSubmit = onSubmitCallback;

        _submitBtn = document.getElementById('atlas-submit-btn');
        _buildBtn = document.getElementById('atlas-build-btn');
        _algoSelector = document.querySelector('.atlas-algo-selector');
        _controlsBar = document.querySelector('.atlas-controls');

        _buildBtn?.addEventListener('click', _handleBuildClick);

        _buildOverlay();

        canvas.addEventListener('mousemove', _onMouseMove);
        canvas.addEventListener('mousedown', _onMouseDown);
        canvas.addEventListener('mouseup', _onMouseUp);
        canvas.addEventListener('click', _onClick);
        canvas.addEventListener('mouseleave', _onMouseLeave);
        canvas.addEventListener('contextmenu', e => e.preventDefault());  // suppress browser menu

        _submitBtn?.addEventListener('click', _onSubmitBtn);
    }

    // ── overlay DOM ─────────────────────────────────────────────────────────
    function _buildOverlay() {
        _overlay = document.createElement('div');
        _overlay.id = 'atlas-input-overlay';
        _overlay.innerHTML = `
            <div class="atlas-overlay-card" id="atlas-overlay-card">
                <p class="atlas-overlay-label">Enter node value</p>
                <input
                    id="atlas-node-input"
                    type="number"
                    placeholder="e.g. 42"
                    autocomplete="off"
                />
                <div class="atlas-overlay-actions">
                    <button id="atlas-overlay-confirm">Add Node</button>
                    <button id="atlas-overlay-cancel" class="secondary">Cancel</button>
                </div>
            </div>
        `;
        _overlay.style.display = 'none';
        document.body.appendChild(_overlay);

        document.getElementById('atlas-overlay-confirm')
            .addEventListener('click', _confirmInput);
        document.getElementById('atlas-overlay-cancel')
            .addEventListener('click', _closeOverlay);

        // keyboard shortcuts
        document.getElementById('atlas-node-input')
            .addEventListener('keydown', e => {
                if (e.key === 'Enter') _confirmInput();
                if (e.key === 'Escape') _closeOverlay();
            });
    }

    // ── pan handlers ─────────────────────────────────────────────────────────
    function _onMouseDown(e) {
        if (e.button !== 2) return;           // right-click only
        e.preventDefault();
        _isPanning = true;
        const cam = AtlasRenderer.getCamera();
        _panOriginX = e.clientX;
        _panOriginY = e.clientY;
        _camOriginX = cam.x;
        _camOriginY = cam.y;
        _canvas.style.cursor = 'grabbing';
    }

    function _onMouseUp(e) {
        if (e.button !== 2) return;
        _isPanning = false;
        _canvas.style.cursor = 'default';
        AtlasRenderer.render();
    }

    // ── mouse events ─────────────────────────────────────────────────────────
    function _onMouseMove(e) {
        if (_isPanning) {
            // Shift camera by mouse delta
            const dx = e.clientX - _panOriginX;
            const dy = e.clientY - _panOriginY;
            AtlasRenderer.setCamera(_camOriginX + dx, _camOriginY + dy);
            AtlasRenderer.render();
            return;   // don't update hover while panning
        }

        const mode = AtlasInternalState.getMode();
        const pt = AtlasRenderer.eventToCanvas(e);
        const node = AtlasRenderer.hitTest(pt.x, pt.y);

        if (mode === 'BUILD') {
            // Hover on any node (active or inactive)
            AtlasRenderer.setHoveredNode(node ? node.id : null);
            _canvas.style.cursor = node ? 'pointer' : 'default';
        } else if (mode === 'SELECTING') {
            // Only hover on active nodes
            const hoverTarget = (node && node.isActive) ? node.id : null;
            AtlasRenderer.setHoveredNode(hoverTarget);
            _canvas.style.cursor = hoverTarget ? 'pointer' : 'default';
        } else {
            // MENU, READY — show hover for visual feedback but no pointer
            AtlasRenderer.setHoveredNode(node ? node.id : null);
            _canvas.style.cursor = 'default';
        }

        AtlasRenderer.render();
    }

    function _onMouseLeave() {
        if (_isPanning) {
            // Treat leaving canvas as releasing the pan
            _isPanning = false;
        }
        AtlasRenderer.setHoveredNode(null);
        _canvas.style.cursor = 'default';
        AtlasRenderer.render();
    }

    function _onClick(e) {
        if (_isPanning) return;            // ignore accidental clicks during pan
        if (e.button !== 0) return;        // left-click only

        const mode = AtlasInternalState.getMode();
        const pt = AtlasRenderer.eventToCanvas(e);
        const node = AtlasRenderer.hitTest(pt.x, pt.y);

        if (mode === 'BUILD') {
            // Current behavior: click inactive node → open overlay
            if (!node || node.isActive) return;
            _pendingNodeId = node.id;
            _openOverlay(e.clientX, e.clientY);

        } else if (mode === 'SELECTING') {
            // Click active node → select it → transition to READY
            if (!node || !node.isActive) return;
            AtlasInternalState.setSelectedNode(node.id);
            AtlasInternalState.setMode('READY');
            _updateControlsForMode('READY');
            AtlasRenderer.render();
        }
        // MENU, READY, ANIMATION — canvas clicks are no-ops
    }

    // ── overlay open/close ───────────────────────────────────────────────────
    function _openOverlay(clientX, clientY) {
        const input = document.getElementById('atlas-node-input');
        input.value = '';

        // position near the click, stay in viewport
        const OW = 220, OH = 130;
        let left = clientX + 12;
        let top = clientY + 12;
        if (left + OW > window.innerWidth) left = clientX - OW - 12;
        if (top + OH > window.innerHeight) top = clientY - OH - 12;

        _overlay.style.left = `${left}px`;
        _overlay.style.top = `${top}px`;
        _overlay.style.display = 'block';

        // animate in
        const card = document.getElementById('atlas-overlay-card');
        card.style.animation = 'none';
        requestAnimationFrame(() => {
            card.style.animation = 'atlasCardIn 0.22s cubic-bezier(0.34,1.56,0.64,1) forwards';
        });

        setTimeout(() => input.focus(), 50);
    }

    function _closeOverlay() {
        _overlay.style.display = 'none';
        _pendingNodeId = null;
    }

    // ── confirm value ─────────────────────────────────────────────────────────
    function _confirmInput() {
        const input = document.getElementById('atlas-node-input');
        const raw = input.value.trim();
        if (raw === '') { input.classList.add('shake'); setTimeout(() => input.classList.remove('shake'), 400); return; }

        const value = Number(raw);
        if (isNaN(value)) { input.classList.add('shake'); setTimeout(() => input.classList.remove('shake'), 400); return; }

        // Save before _closeOverlay() nulls it out
        const nodeId = _pendingNodeId;
        _closeOverlay();

        AtlasInternalState.activateNode(nodeId, value);
        AtlasLayout.compute(_canvas);
        AtlasRenderer.render();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ── Build Button ──────────────────────────────────────────────────────────
    // ═══════════════════════════════════════════════════════════════════════════
    function _handleBuildClick() {
        if (!_controlsBar) return;

        // Hide everything in the controls bar
        _controlsBar.innerHTML = '';

        // Inject a single Clear Tree button
        _clearTreeBtn = document.createElement('button');
        _clearTreeBtn.id = 'atlas-clear-btn';
        _clearTreeBtn.textContent = 'Clear Tree';
        _clearTreeBtn.addEventListener('click', _handleClearTree);
        _controlsBar.appendChild(_clearTreeBtn);

        AtlasInternalState.clearSelection();
        AtlasInternalState.setMode('BUILD');
        AtlasRenderer.render();
        console.log('%c[ATLAS] Mode → BUILD (edit)', 'color:#38bdf8;font-weight:bold');
    }

    /** Clear Tree: reset all nodes, restore original BUILD controls. */
    function _handleClearTree() {
        // Reset the entire tree back to a single dimmed root
        AtlasInternalState.init();
        AtlasLayout.compute(_canvas);

        // Rebuild the original controls bar content
        _restoreBuildControls();

        AtlasRenderer.render();
        console.log('%c[ATLAS] Tree Cleared → BUILD', 'color:#f87171;font-weight:bold');
    }

    /** Rebuild the original .atlas-controls DOM (algo-selector + submit btn wrapper). */
    function _restoreBuildControls() {
        if (!_controlsBar) return;
        _controlsBar.innerHTML = '';

        // Re-create algo selector (hidden by default)
        const algoDiv = document.createElement('div');
        algoDiv.className = 'atlas-algo-selector';
        algoDiv.style.display = 'none';
        _controlsBar.appendChild(algoDiv);
        _algoSelector = algoDiv;

        // Re-create button wrapper
        const btnWrap = document.createElement('div');
        btnWrap.style.cssText = 'display:flex;flex-direction:column;gap:0.4rem;';

        _buildBtn = document.createElement('button');
        _buildBtn.id = 'atlas-build-btn';
        _buildBtn.style.display = 'none';
        _buildBtn.textContent = 'Build Tree';
        _buildBtn.addEventListener('click', _handleBuildClick);
        btnWrap.appendChild(_buildBtn);

        _submitBtn = document.createElement('button');
        _submitBtn.id = 'atlas-submit-btn';
        _submitBtn.textContent = 'Submit Tree';
        _submitBtn.addEventListener('click', _onSubmitBtn);
        btnWrap.appendChild(_submitBtn);

        _controlsBar.appendChild(btnWrap);

        // Reset button state for BUILD mode
        _updateControlsForMode('BUILD');
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ── Submit Button — Mode-aware ────────────────────────────────────────────
    // ═══════════════════════════════════════════════════════════════════════════
    function _onSubmitBtn() {
        const mode = AtlasInternalState.getMode();

        if (mode === 'BUILD') {
            _handleBuildSubmit();
        } else if (mode === 'READY') {
            _handleReadySubmit();
        }
        // MENU, SELECTING — button is disabled, no-op
    }

    /** First submit: freeze tree, show action menu. */
    function _handleBuildSubmit() {
        // Validate: at least one active node
        const activeCount = AtlasInternalState.getAllNodes().filter(n => n.isActive).length;
        if (activeCount === 0) return;

        AtlasInternalState.setMode('MENU');
        _showMenu();
        _updateControlsForMode('MENU');
        AtlasRenderer.render();

        console.log('%c[ATLAS] Mode → MENU', 'color:#38bdf8;font-weight:bold');
    }

    /** Second submit: dispatch selection to solver; run traversal animation if applicable. */
    function _handleReadySubmit() {
        const payload = Bus.getAtlas();

        // Console output
        console.group('%c[ATLAS] Selection Submitted', 'color:#a78bfa;font-weight:bold');
        console.log('Action:', payload.selection.action);
        console.log('Method:', payload.selection.method);
        console.log('Node ID:', payload.selection.nodeId);
        console.log('Root ID:', payload.snapshot.rootId);
        console.log('Nodes:', payload.snapshot.nodes);
        console.groupEnd();

        // Expose on window for external algorithm workers
        window.AtlasTreeOutput = payload;

        // Fire user callback (bus emit etc.)
        if (typeof _onSubmit === 'function') _onSubmit(payload);

        // ── Traversal animation branch ────────────────────────────────────────
        const { action, method } = payload.selection;
        const DFS_METHODS = ['dfs-inorder', 'dfs-preorder', 'dfs-postorder'];

        if (action === 'traversal' && DFS_METHODS.includes(method)) {
            _runTraversalAnimation(payload.snapshot, method);
            return;   // animation handles its own mode transitions
        }

        // ── Default: return to MENU ───────────────────────────────────────────
        AtlasInternalState.setMode('MENU');
        _showMenu();
        _updateControlsForMode('MENU');

        if (_buildBtn) _buildBtn.style.display = 'inline-flex';

        AtlasRenderer.render();
        console.log('%c[ATLAS] Mode → MENU (cycle complete)', 'color:#38bdf8;font-weight:bold');
    }

    // ── Traversal animation driver ────────────────────────────────────────────
    /**
     * Enter ANIMATION mode, step through each node id in the traversal result
     * with a delay, highlight it on the canvas, then restore BUILD mode.
     *
     * @param {{ rootId: string, nodes: Array }} snapshot
     * @param {string} method  — 'dfs-inorder' | 'dfs-preorder' | 'dfs-postorder'
     */
    function _runTraversalAnimation(snapshot, method) {
        // Pick the correct solver based on method
        const SOLVERS = {
            'dfs-inorder':   typeof DFSInOrder   !== 'undefined' ? DFSInOrder   : null,
            'dfs-preorder':  typeof DFSPreOrder  !== 'undefined' ? DFSPreOrder  : null,
            'dfs-postorder': typeof DFSPostOrder !== 'undefined' ? DFSPostOrder : null,
        };
        const solver = SOLVERS[method];

        if (!solver) {
            console.warn(`[ATLAS] No solver registered for method "${method}". Aborting animation.`);
            _finishAnimation();
            return;
        }

        // Run the solver to obtain the ordered node-ID array
        const nodeIds = solver.runOn(snapshot);   // string[]

        if (!nodeIds || nodeIds.length === 0) {
            console.warn('[ATLAS] Traversal produced no nodes — skipping animation.');
            _finishAnimation();
            return;
        }

        // ── Enter ANIMATION mode — freezes canvas interaction ────────────────
        AtlasInternalState.setMode('ANIMATION');
        AtlasInternalState.clearAnimatedNode();

        // Update submit button to reflect locked state
        if (_submitBtn) {
            _submitBtn.textContent = 'Animating…';
            _submitBtn.disabled = true;
            _submitBtn.classList.add('submitted');
        }

        console.log('%c[ATLAS] Mode → ANIMATION', 'color:#fbbf24;font-weight:bold');

        const STEP_DELAY_MS  = 700;   // time each node stays highlighted (ms)
        const CLEAR_DELAY_MS = 300;   // brief gap between steps

        let step = 0;

        function _nextStep() {
            if (step >= nodeIds.length) {
                // ── All nodes visited — wrap up ──────────────────────────────
                AtlasInternalState.clearAnimatedNode();
                AtlasRenderer.render();

                // Short pause so the last node's highlight is visible before reset
                setTimeout(_finishAnimation, 500);
                return;
            }

            const currentId = nodeIds[step];
            step++;

            // Light up the current node
            AtlasInternalState.setAnimatedNode(currentId);
            AtlasRenderer.render();

            const node = AtlasInternalState.getNode(currentId);
            console.log(
                `%c[DFS-INORDER] Step ${step}/${nodeIds.length} — node ${currentId} (value: ${node?.value ?? '?'})`,
                'color:#fbbf24'
            );

            // Hold highlight, then clear briefly before the next step
            setTimeout(() => {
                AtlasInternalState.clearAnimatedNode();
                AtlasRenderer.render();
                setTimeout(_nextStep, CLEAR_DELAY_MS);
            }, STEP_DELAY_MS);
        }

        // Kick off the chain
        _nextStep();
    }

    /** Called once the animation sequence ends — restores BUILD mode. */
    function _finishAnimation() {
        AtlasInternalState.clearAnimatedNode();
        AtlasInternalState.clearSelection();
        AtlasInternalState.setMode('BUILD');

        // Rebuild the full controls bar in BUILD state
        _restoreBuildControls();

        AtlasRenderer.render();
        console.log('%c[ATLAS] Animation complete → BUILD', 'color:#38bdf8;font-weight:bold');
    }



    // ═══════════════════════════════════════════════════════════════════════════
    // ── Action Menu (replaces algo-selector content) ──────────────────────────
    // ═══════════════════════════════════════════════════════════════════════════
    function _showMenu() {
        if (!_algoSelector) return;
        
        _algoSelector.style.display = 'flex'; // show the menu now that we are in MENU mode

        _algoSelector.innerHTML = '';
        _algoSelector.classList.add('atlas-action-menu');

        const label = document.createElement('span');
        label.className = 'atlas-algo-label';
        label.textContent = 'Action';
        _algoSelector.appendChild(label);

        ACTIONS.forEach(action => {
            const btn = document.createElement('button');
            btn.className = 'atlas-action-btn';
            btn.dataset.action = action.key;
            btn.innerHTML = `<span class="atlas-action-icon">${action.icon}</span>${action.label}`;
            btn.addEventListener('click', () => _onActionSelected(action.key));
            _algoSelector.appendChild(btn);
        });
    }

    function _onActionSelected(actionKey) {
        if (actionKey === 'traversal') {
            _showTraversalSubmenu();
            return;
        } else if (actionKey === 'search') {
            _showSearchSubmenu();
            return;
        }

        AtlasInternalState.setSelection({ action: actionKey, method: null });
        AtlasInternalState.setMode('SELECTING');
        _updateControlsForMode('SELECTING');
        _highlightActiveAction(actionKey);
        AtlasRenderer.render();

        console.log(`%c[ATLAS] Mode → SELECTING (action: ${actionKey})`, 'color:#38bdf8;font-weight:bold');
    }

    // ── Search Submenu ────────────────────────────────────────────────────────
    function _showSearchSubmenu() {
        if (!_algoSelector) return;

        _algoSelector.innerHTML = '';

        const backBtn = document.createElement('button');
        backBtn.className = 'atlas-action-btn atlas-back-btn';
        backBtn.innerHTML = '← Back';
        backBtn.addEventListener('click', () => {
            _showMenu();
        });
        _algoSelector.appendChild(backBtn);

        const label = document.createElement('span');
        label.className = 'atlas-algo-label';
        label.textContent = 'Search Method';
        _algoSelector.appendChild(label);

        TRAVERSALS.forEach(trav => {
            const btn = document.createElement('button');
            btn.className = 'atlas-action-btn';
            btn.dataset.method = trav.key;
            btn.textContent = trav.label;
            btn.addEventListener('click', () => {
                AtlasInternalState.setSelection({ action: 'search', method: trav.key });
                AtlasInternalState.setMode('SELECTING');
                _updateControlsForMode('SELECTING');
                _highlightActiveAction(trav.key);
                AtlasRenderer.render();

                console.log(`%c[ATLAS] Mode → SELECTING (search method: ${trav.key})`, 'color:#38bdf8;font-weight:bold');
            });
            _algoSelector.appendChild(btn);
        });
    }

    // ── Traversal Submenu ─────────────────────────────────────────────────────
    function _showTraversalSubmenu() {
        if (!_algoSelector) return;

        _algoSelector.innerHTML = '';

        const backBtn = document.createElement('button');
        backBtn.className = 'atlas-action-btn atlas-back-btn';
        backBtn.innerHTML = '← Back';
        backBtn.addEventListener('click', () => {
            _showMenu();
        });
        _algoSelector.appendChild(backBtn);

        const label = document.createElement('span');
        label.className = 'atlas-algo-label';
        label.textContent = 'Traversal';
        _algoSelector.appendChild(label);

        TRAVERSALS.forEach(trav => {
            const btn = document.createElement('button');
            btn.className = 'atlas-action-btn';
            btn.dataset.method = trav.key;
            btn.textContent = trav.label;
            btn.addEventListener('click', () => {
                AtlasInternalState.setSelection({ action: 'traversal', method: trav.key });
                AtlasInternalState.setMode('READY');
                _updateControlsForMode('READY');
                _highlightActiveAction(trav.key);
                AtlasRenderer.render();

                console.log(`%c[ATLAS] Mode → READY (traversal: ${trav.key})`, 'color:#38bdf8;font-weight:bold');
            });
            _algoSelector.appendChild(btn);
        });
    }

    // ── Highlight active action in menu ───────────────────────────────────────
    function _highlightActiveAction(key) {
        if (!_algoSelector) return;
        _algoSelector.querySelectorAll('.atlas-action-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.action === key || btn.dataset.method === key);
        });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ── Controls state management ─────────────────────────────────────────────
    // ═══════════════════════════════════════════════════════════════════════════
    function _updateControlsForMode(mode) {
        if (!_submitBtn) return;

        switch (mode) {
            case 'BUILD':
                _submitBtn.textContent = 'Submit Tree';
                _submitBtn.disabled = false;
                _submitBtn.classList.remove('submitted');
                break;

            case 'MENU':
                _submitBtn.textContent = 'Select an action…';
                _submitBtn.disabled = true;
                _submitBtn.classList.add('submitted');
                break;

            case 'SELECTING':
                _submitBtn.textContent = 'Click a node…';
                _submitBtn.disabled = true;
                _submitBtn.classList.add('submitted');
                break;

            case 'READY':
                _submitBtn.textContent = 'Confirm Selection';
                _submitBtn.disabled = false;
                _submitBtn.classList.remove('submitted');
                break;
        }
    }

    return { init };
})();
