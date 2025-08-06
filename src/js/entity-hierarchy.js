/**
 * @file entity-hierarchy.js
 * @description Manages the three-level entity hierarchy for the Non-Profit Fund Accounting System.
 * Provides visualization, management, and consolidation functionality for the organizational structure:
 * - Level 1: The Principle Foundation (top-level organization)
 * - Level 2: Entities (TPF, TPF-ES, IFCSN)
 * - Level 3: Funds under each entity
 */

(function(window) {
    'use strict';

    // Private module state
    const _state = {
        hierarchyData: null,
        selectedEntityId: null,
        visualizationInitialized: false,
        entityTypes: {
            ROOT: 'root',
            ENTITY: 'entity',
            FUND: 'fund'
        },
        debugMode: true // Enable for detailed logging
    };

    // DOM element references
    const _elements = {
        hierarchyContainer: null,
        entitySelector: null,
        entityRelationshipViz: null,
        consolidatedViewToggle: null
    };

    /**
     * Logs debug messages when debug mode is enabled
     * @param {string} message - The message to log
     * @param {'info'|'warn'|'error'} level - Log level
     */
    function _debug(message, level = 'info') {
        if (!_state.debugMode) return;
        
        const prefix = 'EntityHierarchy:';
        switch(level) {
            case 'warn':
                console.warn(`${prefix} ${message}`);
                break;
            case 'error':
                console.error(`${prefix} ${message}`);
                break;
            default:
                console.log(`${prefix} ${message}`);
        }
    }

    /**
     * Initializes the entity hierarchy module
     */
    function init() {
        _debug('Initializing entity hierarchy module');
        
        // Inject minimal CSS for visualization container
        _injectVisualizationStyles();
        
        // Cache DOM elements with robust error checking
        _cacheElements();
        
        // Set up event listeners
        _setupEventListeners();
        
        // Load initial data
        loadHierarchyData();
        
        _debug('Entity hierarchy module initialized');
    }

    /**
     * Injects minimal CSS required for visualization
     */
    function _injectVisualizationStyles() {
        const styleId = 'entity-hierarchy-styles';
        
        // Don't add styles if they already exist
        if (document.getElementById(styleId)) {
            return;
        }
        
        _debug('Injecting visualization styles');
        
        const css = `
            .hierarchy-visualization {
                min-height: 300px;
                max-height: 600px;
                overflow: auto;
                border: 1px solid #ddd;
                border-radius: 4px;
                padding: 15px;
                margin: 15px 0;
                background-color: #f9f9f9;
            }
            
            /* Basic node styling if entity-hierarchy.css isn't loaded */
            .hierarchy-node {
                margin: 5px 0;
                padding: 5px;
                border-left: 3px solid #ccc;
            }
            
            .node-header {
                display: flex;
                justify-content: space-between;
                padding: 5px;
                background-color: #f0f0f0;
                border-radius: 3px;
            }
            
            .node-children {
                margin-left: 20px;
                padding-left: 10px;
                border-left: 1px dashed #ccc;
            }
            
            .btn-icon {
                background: none;
                border: none;
                cursor: pointer;
                padding: 3px;
                margin: 0 2px;
            }
        `;
        
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = css;
        document.head.appendChild(style);
    }

    /**
     * Caches DOM elements with robust error checking
     */
    function _cacheElements() {
        _debug('Caching DOM elements');
        
        // Try multiple selectors for the visualization container
        _elements.entityRelationshipViz = document.getElementById('entity-relationship-viz');
        
        if (!_elements.entityRelationshipViz) {
            _elements.entityRelationshipViz = document.querySelector('.entity-relationship-viz');
        }
        
        if (!_elements.entityRelationshipViz) {
            _elements.entityRelationshipViz = document.querySelector('[data-component="entity-hierarchy"]');
        }
        
        // Log the result of our search
        if (_elements.entityRelationshipViz) {
            _debug(`Found entity relationship visualization container: #${_elements.entityRelationshipViz.id}`);
        } else {
            _debug('Entity relationship visualization container not found!', 'error');
            
            // Create a fallback container if needed
            const settingsEntitiesTab = document.querySelector('#settings-entities');
            if (settingsEntitiesTab) {
                _debug('Creating fallback visualization container', 'warn');
                _elements.entityRelationshipViz = document.createElement('div');
                _elements.entityRelationshipViz.id = 'entity-relationship-viz';
                _elements.entityRelationshipViz.className = 'entity-relationship-viz';
                
                // Find a good place to insert it
                const insertTarget = settingsEntitiesTab.querySelector('h4.mt-20') || 
                                    settingsEntitiesTab.querySelector('table') ||
                                    settingsEntitiesTab.firstElementChild;
                
                if (insertTarget) {
                    settingsEntitiesTab.insertBefore(_elements.entityRelationshipViz, insertTarget.nextSibling);
                } else {
                    settingsEntitiesTab.appendChild(_elements.entityRelationshipViz);
                }
            }
        }
        
        // Cache other elements
        _elements.hierarchyContainer = document.getElementById('entity-hierarchy-container');
        _elements.entitySelector = document.getElementById('entity-selector');
        _elements.consolidatedViewToggle = document.getElementById('consolidated-view-toggle');
        
        // Log what we found
        _debug(`Entity selector found: ${Boolean(_elements.entitySelector)}`);
        _debug(`Consolidated view toggle found: ${Boolean(_elements.consolidatedViewToggle)}`);
    }

    /**
     * Sets up event listeners for the module
     */
    function _setupEventListeners() {
        _debug('Setting up event listeners');
        
        // Entity selector change event
        if (_elements.entitySelector) {
            _elements.entitySelector.addEventListener('change', handleEntitySelection);
            _debug('Entity selector event listener attached');
        }
        
        // Consolidated view toggle event
        if (_elements.consolidatedViewToggle) {
            _elements.consolidatedViewToggle.addEventListener('change', handleConsolidatedViewToggle);
            _debug('Consolidated view toggle event listener attached');
        }
        
        // Add Entity button click event
        const addEntityBtn = document.getElementById('btn-add-entity');
        if (addEntityBtn) {
            addEntityBtn.addEventListener('click', handleAddEntity);
            _debug('Add entity button event listener attached');
        }
        
        // Settings tab click event
        const settingsEntitiesTab = document.querySelector('.tab-item[data-tab="settings-entities"]');
        if (settingsEntitiesTab) {
            settingsEntitiesTab.addEventListener('click', function() {
                _debug('Settings entities tab clicked');
                if (!_state.visualizationInitialized) {
                    initializeHierarchyVisualization();
                } else {
                    // Refresh visualization even if already initialized
                    initializeHierarchyVisualization(true);
                }
            });
            _debug('Settings entities tab event listener attached');
        }
        
        // Listen for DOM changes that might affect visualization
        _observeRelevantDomChanges();
    }

    /**
     * Sets up a MutationObserver to watch for DOM changes that might affect our visualization
     */
    function _observeRelevantDomChanges() {
        if (!window.MutationObserver) {
            _debug('MutationObserver not supported in this browser', 'warn');
            return;
        }
        
        // Watch for tab changes and page navigation
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'attributes' && 
                    mutation.attributeName === 'class' && 
                    mutation.target.classList.contains('active')) {
                    
                    // Check if we're looking at the entities tab
                    if (mutation.target.id === 'settings-entities' || 
                        (mutation.target.classList.contains('tab-panel') && 
                         mutation.target.id === 'settings-entities')) {
                        
                        _debug('Entities tab became active via DOM mutation');
                        setTimeout(() => initializeHierarchyVisualization(true), 50);
                    }
                }
            }
        });
        
        // Observe tab panels
        const tabPanels = document.querySelectorAll('.tab-panel');
        tabPanels.forEach(panel => {
            observer.observe(panel, { attributes: true });
        });
    }

    /**
     * Loads the entity hierarchy data from the database
     * @param {boolean} [refreshVisualization=true] - Whether to refresh the visualization after loading data
     * @returns {Promise<boolean>} Success status
     */
    async function loadHierarchyData(refreshVisualization = true) {
        _debug('Loading hierarchy data...');
        
        try {
            // Check if db module is available
            if (!window.db || typeof window.db.fetchEntities !== 'function') {
                _debug('Database module not available or missing fetchEntities method', 'error');
                return false;
            }
            
            // Fetch entities
            _debug('Fetching entities from database');
            const entities = await window.db.fetchEntities();
            _debug(`Fetched ${entities.length} entities`);
            
            // Fetch funds
            _debug('Fetching funds from database');
            const funds = await window.db.fetchFunds();
            _debug(`Fetched ${funds.length} funds`);
            
            // Process and structure the hierarchy data
            _debug('Building hierarchy data structure');
            _state.hierarchyData = buildHierarchyData(entities, funds);
            
            // Update the UI with the new data
            _debug('Updating entity selector');
            updateEntitySelector();
            
            // Initialize or refresh visualization if needed
            if (refreshVisualization) {
                _debug('Checking if visualization should be refreshed');
                // Check if we're on the settings page and entities tab is active
                const entitiesTabActive = document.querySelector('.tab-panel#settings-entities.active');
                if (entitiesTabActive) {
                    _debug('Entities tab is active, refreshing visualization');
                    initializeHierarchyVisualization(true); // Force refresh
                }
            }
            
            _debug('Hierarchy data loaded successfully');
            return true;
        } catch (error) {
            _debug(`Error loading hierarchy data: ${error.message}`, 'error');
            console.error(error); // Log the full error object for debugging
            
            // Show error in UI if toast is available
            if (window.ui && typeof window.ui.showToast === 'function') {
                window.ui.showToast(`Failed to load entity hierarchy: ${error.message}`, 'error');
            }
            
            return false;
        }
    }

    /**
     * Builds a structured hierarchy object from entities and funds
     * @param {Array} entities - List of entities
     * @param {Array} funds - List of funds
     * @returns {Object} Structured hierarchy data
     */
    function buildHierarchyData(entities, funds) {
        _debug('Building hierarchy data structure');
        
        if (!entities || !Array.isArray(entities)) {
            _debug('Invalid entities data provided', 'error');
            return { root: null, entities: {}, flatList: [] };
        }
        
        if (!funds || !Array.isArray(funds)) {
            _debug('Invalid funds data provided', 'warn');
            funds = [];
        }
        
        // Create a map for quick entity lookup
        const entityMap = {};
        entities.forEach(entity => {
            entityMap[entity.id] = {
                ...entity,
                type: _state.entityTypes.ENTITY,
                children: []
            };
        });
        
        // Find the root entity (The Principle Foundation)
        let rootEntity = entities.find(entity => 
            entity.parent_entity_id === null && 
            (entity.name === 'The Principle Foundation' || entity.code === 'TPF_PARENT')
        );
        
        // If no root entity exists yet, use the first entity without a parent
        if (!rootEntity) {
            _debug('No specific root entity found, using first entity without a parent', 'warn');
            rootEntity = entities.find(entity => entity.parent_entity_id === null);
        }
        
        if (rootEntity) {
            _debug(`Root entity identified: ${rootEntity.name} (${rootEntity.code})`);
        } else {
            _debug('No root entity found!', 'warn');
        }
        
        // Build the entity hierarchy
        const hierarchy = {
            root: rootEntity ? entityMap[rootEntity.id] : null,
            entities: entityMap,
            flatList: entities
        };
        
        // Add child entities to their parents
        _debug('Mapping child entities to parents');
        entities.forEach(entity => {
            if (entity.parent_entity_id && entityMap[entity.parent_entity_id]) {
                entityMap[entity.parent_entity_id].children.push(entityMap[entity.id]);
            }
        });
        
        // Add funds to their respective entities
        _debug('Mapping funds to entities');
        funds.forEach(fund => {
            const fundObj = {
                ...fund,
                type: _state.entityTypes.FUND,
                children: []
            };
            
            if (entityMap[fund.entity_id]) {
                entityMap[fund.entity_id].children.push(fundObj);
            } else {
                _debug(`Fund ${fund.name} (${fund.code}) has invalid entity_id: ${fund.entity_id}`, 'warn');
            }
        });
        
        return hierarchy;
    }

    /**
     * Updates the entity selector dropdown with the current hierarchy
     */
    function updateEntitySelector() {
        _debug('Updating entity selector');
        
        if (!_elements.entitySelector) {
            _debug('Entity selector element not found', 'warn');
            return;
        }
        
        if (!_state.hierarchyData) {
            _debug('No hierarchy data available', 'warn');
            return;
        }
        
        // Clear existing options
        _elements.entitySelector.innerHTML = '';
        
        // Add option for the top-level organization
        if (_state.hierarchyData.root) {
            const rootOption = document.createElement('option');
            rootOption.value = _state.hierarchyData.root.id;
            rootOption.textContent = `${_state.hierarchyData.root.name} (All Consolidated)`;
            _elements.entitySelector.appendChild(rootOption);
            _debug(`Added root entity to selector: ${_state.hierarchyData.root.name}`);
        }
        
        // Add options for second-level entities
        if (_state.hierarchyData.root && _state.hierarchyData.root.children) {
            _state.hierarchyData.root.children.forEach(entity => {
                if (entity.type === _state.entityTypes.ENTITY) {
                    const option = document.createElement('option');
                    option.value = entity.id;
                    option.textContent = entity.name;
                    _elements.entitySelector.appendChild(option);
                    _debug(`Added entity to selector: ${entity.name}`);
                }
            });
        }
        
        // If no root entity exists yet, add all entities
        if (!_state.hierarchyData.root) {
            _debug('No root entity, adding all entities to selector');
            _state.hierarchyData.flatList.forEach(entity => {
                const option = document.createElement('option');
                option.value = entity.id;
                option.textContent = entity.name;
                _elements.entitySelector.appendChild(option);
            });
        }
    }

    /**
     * Initializes the hierarchy visualization in the settings panel
     * @param {boolean} [forceRefresh=false] - Whether to force a refresh of the visualization
     */
    function initializeHierarchyVisualization(forceRefresh = false) {
        _debug(`Initializing hierarchy visualization (forceRefresh: ${forceRefresh})`);
        
        try {
            // Check if we have the required elements and data
            if (!_elements.entityRelationshipViz) {
                _debug('Entity relationship visualization container not found', 'error');
                
                // Try to find it again - it might have been added to the DOM since we last checked
                _elements.entityRelationshipViz = document.getElementById('entity-relationship-viz');
                
                if (!_elements.entityRelationshipViz) {
                    _debug('Still cannot find visualization container, aborting', 'error');
                    return;
                }
            }
            
            // If we don't have hierarchy data, try to load it first
            if (!_state.hierarchyData) {
                _debug('No hierarchy data available, attempting to load');
                loadHierarchyData();
                return;
            }
            
            // Skip if already initialized and not forcing refresh
            if (_state.visualizationInitialized && !forceRefresh) {
                _debug('Visualization already initialized, skipping (use forceRefresh to override)');
                return;
            }
            
            // Clear existing visualization
            _elements.entityRelationshipViz.innerHTML = '';
            _debug('Cleared existing visualization');
            
            // Create the visualization container
            const vizContainer = document.createElement('div');
            vizContainer.className = 'hierarchy-visualization';
            
            // Create the hierarchy tree
            _debug('Creating hierarchy tree');
            const hierarchyTree = createHierarchyTree(_state.hierarchyData);
            vizContainer.appendChild(hierarchyTree);
            
            // Add the visualization to the DOM
            _elements.entityRelationshipViz.appendChild(vizContainer);
            
            _state.visualizationInitialized = true;
            _debug('Visualization initialized successfully');
            
            // Add a class to the body to indicate the visualization is ready
            document.body.classList.add('entity-hierarchy-ready');
        } catch (error) {
            _debug(`Error initializing hierarchy visualization: ${error.message}`, 'error');
            console.error(error); // Log the full error object for debugging
            
            // Create a simple error message in the container
            if (_elements.entityRelationshipViz) {
                _elements.entityRelationshipViz.innerHTML = `
                    <div class="error-message" style="color: #d32f2f; padding: 10px; border: 1px solid #ffcdd2; background-color: #ffebee; border-radius: 4px;">
                        <h4>Error Displaying Entity Hierarchy</h4>
                        <p>${error.message}</p>
                        <button onclick="window.entityHierarchy.initializeHierarchyVisualization(true)" class="action-button">
                            Retry
                        </button>
                    </div>
                `;
            }
            
            // Show error in UI if toast is available
            if (window.ui && typeof window.ui.showToast === 'function') {
                window.ui.showToast(`Failed to display entity hierarchy: ${error.message}`, 'error');
            }
        }
    }

    /**
     * Creates a visual tree representation of the entity hierarchy
     * @param {Object} hierarchyData - The structured hierarchy data
     * @returns {HTMLElement} The hierarchy tree element
     */
    function createHierarchyTree(hierarchyData) {
        _debug('Creating hierarchy tree visualization');
        
        const treeContainer = document.createElement('div');
        treeContainer.className = 'hierarchy-tree';
        
        try {
            // If we have a root entity, build the tree starting from there
            if (hierarchyData.root) {
                _debug(`Building tree from root: ${hierarchyData.root.name}`);
                const rootNode = createHierarchyNode(hierarchyData.root);
                if (rootNode) {
                    rootNode.classList.add('root-node'); // Special class for root node
                    treeContainer.appendChild(rootNode);
                }
            } else {
                // Otherwise, show all top-level entities
                _debug('No root entity, showing all top-level entities');
                const entities = hierarchyData.flatList.filter(entity => entity.parent_entity_id === null);
                
                if (entities.length > 0) {
                    _debug(`Found ${entities.length} top-level entities`);
                    entities.forEach(entity => {
                        const entityNode = createHierarchyNode(hierarchyData.entities[entity.id]);
                        if (entityNode) {
                            treeContainer.appendChild(entityNode);
                        }
                    });
                } else {
                    // No entities exist yet
                    _debug('No entities found');
                    const noEntitiesMsg = document.createElement('p');
                    noEntitiesMsg.textContent = 'No entities have been created yet. Use the "Add Entity" button to create your first entity.';
                    treeContainer.appendChild(noEntitiesMsg);
                }
            }
        } catch (error) {
            _debug(`Error creating hierarchy tree: ${error.message}`, 'error');
            
            // Create error message
            const errorMsg = document.createElement('div');
            errorMsg.className = 'error-message';
            errorMsg.innerHTML = `<p>Error creating hierarchy tree: ${error.message}</p>`;
            treeContainer.appendChild(errorMsg);
        }
        
        return treeContainer;
    }

    /**
     * Creates a visual node for an entity or fund in the hierarchy
     * @param {Object} node - The entity or fund data
     * @returns {HTMLElement} The node element
     */
    function createHierarchyNode(node) {
        if (!node) {
            _debug('Attempted to create node with null data', 'warn');
            return null;
        }
        
        try {
            const nodeContainer = document.createElement('div');
            nodeContainer.className = `hierarchy-node ${node.type}-node`;
            nodeContainer.dataset.id = node.id;
            nodeContainer.dataset.type = node.type;
            
            // Create node header
            const nodeHeader = document.createElement('div');
            nodeHeader.className = 'node-header';
            
            // Create node title
            const nodeTitle = document.createElement('div');
            nodeTitle.className = 'node-title';
            nodeTitle.textContent = `${node.name} ${node.code ? `(${node.code})` : ''}`;
            
            // Create node actions
            const nodeActions = document.createElement('div');
            nodeActions.className = 'node-actions';
            
            // Add edit button for entities
            if (node.type === _state.entityTypes.ENTITY) {
                const editButton = document.createElement('button');
                editButton.className = 'btn-icon edit-entity';
                editButton.innerHTML = '<span class="icon">✏️</span>';
                editButton.title = 'Edit Entity';
                editButton.addEventListener('click', (e) => {
                    e.stopPropagation();
                    openEntityModal(node.id);
                });
                nodeActions.appendChild(editButton);
                
                // Add "Add Child" button for entities
                const addChildButton = document.createElement('button');
                addChildButton.className = 'btn-icon add-child';
                addChildButton.innerHTML = '<span class="icon">➕</span>';
                addChildButton.title = 'Add Child Entity';
                addChildButton.addEventListener('click', (e) => {
                    e.stopPropagation();
                    openEntityModal(null, node.id);
                });
                nodeActions.appendChild(addChildButton);
                
                // Add "Delete" button for entities (except root)
                if (node.parent_entity_id) {
                    const deleteButton = document.createElement('button');
                    deleteButton.className = 'btn-icon delete-entity';
                    deleteButton.innerHTML = '<span class="icon">🗑️</span>';
                    deleteButton.title = 'Delete Entity';
                    deleteButton.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (confirm(`Are you sure you want to delete ${node.name}?`)) {
                            deleteEntity(node.id);
                        }
                    });
                    nodeActions.appendChild(deleteButton);
                }
            }
            
            // Add the consolidated indicator for entities that consolidate
            if (node.type === _state.entityTypes.ENTITY && node.is_consolidated) {
                const consolidatedIndicator = document.createElement('span');
                consolidatedIndicator.className = 'consolidated-indicator';
                consolidatedIndicator.title = 'This entity consolidates its children';
                consolidatedIndicator.textContent = '🔄';
                nodeHeader.appendChild(consolidatedIndicator);
            }
            
            // Assemble the node header
            nodeHeader.appendChild(nodeTitle);
            nodeHeader.appendChild(nodeActions);
            nodeContainer.appendChild(nodeHeader);
            
            // Create children container if this node has children
            if (node.children && node.children.length > 0) {
                const childrenContainer = document.createElement('div');
                childrenContainer.className = 'node-children';
                
                // Create toggle button for expanding/collapsing children
                const toggleButton = document.createElement('button');
                toggleButton.className = 'toggle-children';
                toggleButton.textContent = '▼';
                toggleButton.addEventListener('click', () => {
                    childrenContainer.classList.toggle('collapsed');
                    toggleButton.textContent = childrenContainer.classList.contains('collapsed') ? '►' : '▼';
                });
                nodeHeader.insertBefore(toggleButton, nodeTitle);
                
                // Add all children
                node.children.forEach(child => {
                    const childNode = createHierarchyNode(child);
                    if (childNode) {
                        childrenContainer.appendChild(childNode);
                    }
                });
                
                nodeContainer.appendChild(childrenContainer);
            }
            
            return nodeContainer;
        } catch (error) {
            _debug(`Error creating node for ${node.name}: ${error.message}`, 'error');
            return null;
        }
    }

    /**
     * Deletes an entity
     * @param {string} entityId - ID of the entity to delete
     */
    async function deleteEntity(entityId) {
        _debug(`Attempting to delete entity: ${entityId}`);
        
        try {
            // Check if the entity has children
            if (_state.hierarchyData && _state.hierarchyData.entities[entityId]) {
                const entity = _state.hierarchyData.entities[entityId];
                const childEntities = entity.children.filter(child => child.type === _state.entityTypes.ENTITY);
                const childFunds = entity.children.filter(child => child.type === _state.entityTypes.FUND);
                
                if (childEntities.length > 0) {
                    _debug(`Entity has ${childEntities.length} child entities, cannot delete`, 'warn');
                    if (window.ui && typeof window.ui.showToast === 'function') {
                        window.ui.showToast(`Cannot delete entity with child entities. Move or delete child entities first.`, 'error');
                    } else {
                        alert(`Cannot delete entity with child entities. Move or delete child entities first.`);
                    }
                    return;
                }
                
                if (childFunds.length > 0) {
                    _debug(`Entity has ${childFunds.length} funds, cannot delete`, 'warn');
                    if (window.ui && typeof window.ui.showToast === 'function') {
                        window.ui.showToast(`Cannot delete entity with funds. Move or delete funds first.`, 'error');
                    } else {
                        alert(`Cannot delete entity with funds. Move or delete funds first.`);
                    }
                    return;
                }
            }
            
            // Check if we have an API to delete entities
            if (window.db && typeof window.db.deleteEntity === 'function') {
                await window.db.deleteEntity(entityId);
                _debug(`Entity deleted successfully: ${entityId}`);
                
                // Reload hierarchy data
                if (window.app && typeof window.app.loadEntityData === 'function') {
                    await window.app.loadEntityData();
                } else {
                    await loadHierarchyData(true);
                }
                
                // Show success message
                if (window.ui && typeof window.ui.showToast === 'function') {
                    window.ui.showToast(`Entity deleted successfully`, 'success');
                }
            } else {
                // No API available
                _debug('No deleteEntity API available', 'error');
                if (window.ui && typeof window.ui.showToast === 'function') {
                    window.ui.showToast(`Cannot delete entity: API not available`, 'error');
                } else {
                    alert(`Cannot delete entity: API not available`);
                }
            }
        } catch (error) {
            _debug(`Error deleting entity: ${error.message}`, 'error');
            
            if (window.ui && typeof window.ui.showToast === 'function') {
                window.ui.showToast(`Error deleting entity: ${error.message}`, 'error');
            } else {
                alert(`Error deleting entity: ${error.message}`);
            }
        }
    }

    /**
     * Opens the entity modal for creating or editing an entity
     * @param {string|null} entityId - ID of the entity to edit, or null for a new entity
     * @param {string|null} parentEntityId - ID of the parent entity for a new entity
     */
    function openEntityModal(entityId = null, parentEntityId = null) {
        _debug(`Opening entity modal (entityId: ${entityId}, parentEntityId: ${parentEntityId})`);
        
        try {
            const entityModal = document.getElementById('entity-modal');
            const modalTitle = document.getElementById('entity-modal-title-text');
            const entityIdInput = document.getElementById('entity-id-edit');
            const entityNameInput = document.getElementById('entity-name-input');
            const entityCodeInput = document.getElementById('entity-code-input');
            const entityParentSelect = document.getElementById('entity-parent-select');
            const entityConsolidatedCheckbox = document.getElementById('entity-consolidated-checkbox');
            const saveEntityBtn = document.getElementById('btn-save-entity');
            
            // Check if all required elements exist
            if (!entityModal) {
                _debug('Entity modal element not found', 'error');
                return;
            }
            
            if (!modalTitle || !entityNameInput || !saveEntityBtn) {
                _debug('Required modal elements not found', 'error');
                return;
            }
            
            // Set modal title based on whether we're editing or creating
            modalTitle.textContent = entityId ? 'Edit Entity' : 'Add New Entity';
            
            // If editing an existing entity, populate the form
            if (entityId && _state.hierarchyData && _state.hierarchyData.entities[entityId]) {
                const entity = _state.hierarchyData.entities[entityId];
                _debug(`Populating form with entity data: ${entity.name}`);
                
                if (entityIdInput) entityIdInput.value = entity.id;
                if (entityNameInput) entityNameInput.value = entity.name;
                if (entityCodeInput) entityCodeInput.value = entity.code;
                
                // Set parent entity if the select exists
                if (entityParentSelect) {
                    populateParentEntitySelect(entityParentSelect, entityId);
                    entityParentSelect.value = entity.parent_entity_id || '';
                }
                
                // Set consolidated checkbox if it exists
                if (entityConsolidatedCheckbox) {
                    entityConsolidatedCheckbox.checked = entity.is_consolidated;
                }
                
                // Show hierarchy preview if editing
                const previewContainer = document.getElementById('entity-modal-hierarchy-preview');
                if (previewContainer) {
                    previewContainer.style.display = 'block';
                    
                    const previewElement = document.getElementById('entity-hierarchy-preview-container');
                    if (previewElement) {
                        previewElement.innerHTML = '';
                        
                        // Create a simplified hierarchy preview
                        const path = getEntityHierarchyPath(entityId);
                        const pathHtml = path.map(e => `<div class="hierarchy-path-item">${e.name}</div>`).join(' › ');
                        
                        previewElement.innerHTML = `
                            <div class="hierarchy-path">${pathHtml}</div>
                        `;
                    }
                }
            } else {
                // Creating a new entity
                _debug('Setting up form for new entity');
                
                if (entityIdInput) entityIdInput.value = '';
                if (entityNameInput) entityNameInput.value = '';
                if (entityCodeInput) entityCodeInput.value = '';
                
                // Set parent entity if provided and the select exists
                if (entityParentSelect) {
                    populateParentEntitySelect(entityParentSelect);
                    entityParentSelect.value = parentEntityId || '';
                }
                
                // Default consolidated to false for new entities
                if (entityConsolidatedCheckbox) {
                    entityConsolidatedCheckbox.checked = false;
                }
                
                // Hide hierarchy preview for new entities
                const previewContainer = document.getElementById('entity-modal-hierarchy-preview');
                if (previewContainer) {
                    previewContainer.style.display = 'none';
                }
            }
            
            // Set up the save button event handler
            if (saveEntityBtn) {
                // Remove existing event listeners
                const newSaveBtn = saveEntityBtn.cloneNode(true);
                saveEntityBtn.parentNode.replaceChild(newSaveBtn, saveEntityBtn);
                
                // Add new event listener
                newSaveBtn.addEventListener('click', () => {
                    saveEntity(entityId);
                });
            }
            
            // Show the modal
            if (window.modals && typeof window.modals.openEntity === 'function') {
                // Use the dedicated helper that automatically handles state reset & population
                window.modals.openEntity(entityId);
            } else if (window.modals && typeof window.modals.open === 'function') {
                // Try generic open method
                window.modals.open('entity-modal');
            } else {
                // Fallback to direct manipulation
                entityModal.style.display = 'block';
            }
        } catch (error) {
            _debug(`Error opening entity modal: ${error.message}`, 'error');
            
            if (window.ui && typeof window.ui.showToast === 'function') {
                window.ui.showToast(`Error opening entity form: ${error.message}`, 'error');
            }
        }
    }

    /**
     * Populates the parent entity select dropdown
     * @param {HTMLSelectElement} selectElement - The select element to populate
     * @param {string|null} currentEntityId - ID of the current entity being edited (to exclude from options)
     */
    function populateParentEntitySelect(selectElement, currentEntityId = null) {
        _debug(`Populating parent entity select (currentEntityId: ${currentEntityId})`);
        
        if (!selectElement) {
            _debug('Select element not provided', 'error');
            return;
        }
        
        if (!_state.hierarchyData) {
            _debug('No hierarchy data available', 'warn');
            return;
        }
        
        try {
            // Clear existing options
            selectElement.innerHTML = '';
            
            // Add "No Parent" option
            const noParentOption = document.createElement('option');
            noParentOption.value = '';
            noParentOption.textContent = '-- No Parent (Top Level) --';
            selectElement.appendChild(noParentOption);
            
            // Get all entities
            const entities = _state.hierarchyData.flatList;
            
            // Check if we need to prevent circular references
            if (currentEntityId) {
                _debug(`Preventing circular references for entity ${currentEntityId}`);
                
                // Get all descendants of the current entity to exclude them
                const descendants = getEntityChildren(currentEntityId, false).map(e => e.id);
                
                // Add all entities except the current one and its descendants
                entities.forEach(entity => {
                    if (entity.id !== currentEntityId && !descendants.includes(entity.id)) {
                        const option = document.createElement('option');
                        option.value = entity.id;
                        option.textContent = entity.name;
                        selectElement.appendChild(option);
                    }
                });
            } else {
                // Add all entities
                entities.forEach(entity => {
                    const option = document.createElement('option');
                    option.value = entity.id;
                    option.textContent = entity.name;
                    selectElement.appendChild(option);
                });
            }
        } catch (error) {
            _debug(`Error populating parent entity select: ${error.message}`, 'error');
        }
    }

    /**
     * Saves an entity (creates new or updates existing)
     * @param {string|null} entityId - ID of the entity to update, or null for a new entity
     */
    async function saveEntity(entityId = null) {
        _debug(`Saving entity (entityId: ${entityId})`);
        
        try {
            const entityIdInput = document.getElementById('entity-id-edit');
            const entityNameInput = document.getElementById('entity-name-input');
            const entityCodeInput = document.getElementById('entity-code-input');
            const entityParentSelect = document.getElementById('entity-parent-select');
            const entityConsolidatedCheckbox = document.getElementById('entity-consolidated-checkbox');
            
            // Validate required fields
            if (!entityNameInput || !entityNameInput.value.trim()) {
                _debug('Entity name is required', 'warn');
                if (window.ui && typeof window.ui.showToast === 'function') {
                    window.ui.showToast('Entity name is required', 'error');
                } else {
                    alert('Entity name is required');
                }
                return;
            }
            
            // Prepare entity data
            const entityData = {
                id: entityId || (entityIdInput ? entityIdInput.value : null),
                name: entityNameInput.value.trim(),
                code: entityCodeInput && entityCodeInput.value.trim() 
                    ? entityCodeInput.value.trim() 
                    : generateEntityCode(entityNameInput.value),
                parent_entity_id: entityParentSelect && entityParentSelect.value 
                    ? entityParentSelect.value 
                    : null,
                is_consolidated: entityConsolidatedCheckbox 
                    ? entityConsolidatedCheckbox.checked 
                    : false,
                status: 'Active'
            };
            
            _debug(`Entity data prepared: ${JSON.stringify(entityData)}`);
            
            // Check for circular references
            if (entityData.parent_entity_id === entityData.id) {
                _debug('Circular reference detected - entity cannot be its own parent', 'error');
                if (window.ui && typeof window.ui.showToast === 'function') {
                    window.ui.showToast('An entity cannot be its own parent', 'error');
                } else {
                    alert('An entity cannot be its own parent');
                }
                return;
            }
            
            // Save the entity
            if (!window.db || typeof window.db.saveEntity !== 'function') {
                _debug('Database module not available or missing saveEntity method', 'error');
                if (window.ui && typeof window.ui.showToast === 'function') {
                    window.ui.showToast('Cannot save entity: Database API not available', 'error');
                } else {
                    alert('Cannot save entity: Database API not available');
                }
                return;
            }
            
            const savedEntity = await window.db.saveEntity(entityData);
            _debug('Entity saved successfully', savedEntity);
            
            // Close the modal
            if (window.modals && typeof window.modals.close === 'function') {
                window.modals.close('entity-modal');
            } else {
                const entityModal = document.getElementById('entity-modal');
                if (entityModal) {
                    entityModal.style.display = 'none';
                }
            }
            
            // Use app.loadEntityData() to ensure consistent updates across the application
            if (window.app && typeof window.app.loadEntityData === 'function') {
                await window.app.loadEntityData();
                _debug('Entity data reloaded via app.loadEntityData()');
            } else {
                // Fallback to local update if app.loadEntityData is not available
                await loadHierarchyData(true);
                initializeHierarchyVisualization(true);
            }
            
            // Show success message
            if (window.ui && typeof window.ui.showToast === 'function') {
                window.ui.showToast(
                    `Entity "${entityData.name}" ${entityId ? 'updated' : 'created'} successfully`, 
                    'success'
                );
            }
        } catch (error) {
            _debug(`Error saving entity: ${error.message}`, 'error');
            console.error(error); // Log the full error object for debugging
            
            if (window.ui && typeof window.ui.showToast === 'function') {
                window.ui.showToast(`Error saving entity: ${error.message}`, 'error');
            } else {
                alert(`Error saving entity: ${error.message}`);
            }
        }
    }

    /**
     * Generates an entity code from the entity name
     * @param {string} entityName - The name of the entity
     * @returns {string} Generated entity code
     */
    function generateEntityCode(entityName) {
        if (!entityName) return '';
        
        // Generate code from the first letters of each word, uppercase
        return entityName
            .split(/\s+/)
            .map(word => word.charAt(0).toUpperCase())
            .join('')
            .substring(0, 10);
    }

    /**
     * Handles entity selection from the dropdown
     * @param {Event} event - Change event
     */
    function handleEntitySelection(event) {
        const entityId = event.target.value;
        _debug(`Entity selected: ${entityId}`);
        
        _state.selectedEntityId = entityId;
        
        // Trigger entity change event for other components
        const changeEvent = new CustomEvent('entityChanged', {
            detail: { entityId }
        });
        document.dispatchEvent(changeEvent);
        
        // Update UI based on selected entity
        updateUIForSelectedEntity(entityId);
    }

    /**
     * Updates the UI based on the selected entity
     * @param {string} entityId - ID of the selected entity
     */
    function updateUIForSelectedEntity(entityId) {
        _debug(`Updating UI for selected entity: ${entityId}`);
        
        if (!_state.hierarchyData || !_state.hierarchyData.entities[entityId]) {
            _debug('Entity not found in hierarchy data', 'warn');
            return;
        }
        
        const entity = _state.hierarchyData.entities[entityId];
        
        // Update dashboard title or other UI elements
        const dashboardTitle = document.getElementById('dashboard-title');
        const dashboardCurrentEntity = document.getElementById('dashboard-current-entity');
        
        if (dashboardTitle) {
            dashboardTitle.textContent = 'Dashboard';
        }
        
        if (dashboardCurrentEntity) {
            dashboardCurrentEntity.textContent = `- ${entity.name}`;
        }
        
        // Trigger data reload for the selected entity
        if (window.app && typeof window.app.loadDashboardData === 'function') {
            window.app.loadDashboardData(_elements.consolidatedViewToggle?.checked || false);
        }
    }

    /**
     * Handles the consolidated view toggle
     * @param {Event} event - Change event
     */
    function handleConsolidatedViewToggle(event) {
        const isConsolidated = event.target.checked;
        _debug(`Consolidated view toggled: ${isConsolidated}`);
        
        // Update UI to show consolidated view
        updateConsolidatedView(isConsolidated);
        
        // Trigger consolidated view change event
        const changeEvent = new CustomEvent('consolidatedViewChanged', {
            detail: { isConsolidated }
        });
        document.dispatchEvent(changeEvent);
    }

    /**
     * Updates the UI to show consolidated view
     * @param {boolean} isConsolidated - Whether to show consolidated view
     */
    function updateConsolidatedView(isConsolidated) {
        _debug(`Updating consolidated view: ${isConsolidated}`);
        
        // Add consolidated class to body for CSS styling
        if (isConsolidated) {
            document.body.classList.add('consolidated-view');
        } else {
            document.body.classList.remove('consolidated-view');
        }
        
        // Reload data with consolidated flag
        if (window.app && typeof window.app.loadDashboardData === 'function') {
            window.app.loadDashboardData(isConsolidated);
        }
    }

    /**
     * Handles the "Add Entity" button click
     */
    function handleAddEntity() {
        _debug('Add entity button clicked');
        openEntityModal();
    }

    /**
     * Gets the full hierarchy path for an entity
     * @param {string} entityId - The entity ID
     * @returns {Array} Array of entities in the hierarchy path
     */
    function getEntityHierarchyPath(entityId) {
        _debug(`Getting hierarchy path for entity: ${entityId}`);
        
        if (!_state.hierarchyData || !_state.hierarchyData.entities[entityId]) {
            _debug('Entity not found in hierarchy data', 'warn');
            return [];
        }
        
        const path = [];
        let currentEntity = _state.hierarchyData.entities[entityId];
        
        // Add the current entity
        path.unshift(currentEntity);
        
        // Add all parent entities
        while (currentEntity.parent_entity_id && _state.hierarchyData.entities[currentEntity.parent_entity_id]) {
            currentEntity = _state.hierarchyData.entities[currentEntity.parent_entity_id];
            path.unshift(currentEntity);
        }
        
        return path;
    }

    /**
     * Gets all child entities for an entity (recursive)
     * @param {string} entityId - The entity ID
     * @param {boolean} includeFunds - Whether to include funds in the result
     * @returns {Array} Array of child entities
     */
    function getEntityChildren(entityId, includeFunds = false) {
        _debug(`Getting children for entity: ${entityId} (includeFunds: ${includeFunds})`);
        
        if (!_state.hierarchyData || !_state.hierarchyData.entities[entityId]) {
            _debug('Entity not found in hierarchy data', 'warn');
            return [];
        }
        
        const entity = _state.hierarchyData.entities[entityId];
        const children = [];
        
        // Add direct children
        entity.children.forEach(child => {
            if (child.type === _state.entityTypes.ENTITY || (includeFunds && child.type === _state.entityTypes.FUND)) {
                children.push(child);
            }
            
            // Recursively add grandchildren if this is an entity
            if (child.type === _state.entityTypes.ENTITY) {
                const grandchildren = getEntityChildren(child.id, includeFunds);
                children.push(...grandchildren);
            }
        });
        
        return children;
    }

    /**
     * Calculates consolidated financial data for an entity
     * @param {string} entityId - The entity ID
     * @returns {Object} Consolidated financial data
     */
    function calculateConsolidatedData(entityId) {
        _debug(`Calculating consolidated data for entity: ${entityId}`);
        
        if (!_state.hierarchyData || !_state.hierarchyData.entities[entityId]) {
            _debug('Entity not found in hierarchy data', 'warn');
            return null;
        }
        
        const entity = _state.hierarchyData.entities[entityId];
        
        // If this entity doesn't consolidate, just return its own data
        if (!entity.is_consolidated) {
            _debug(`Entity ${entity.name} does not consolidate, returning own data only`);
            return {
                entityId: entity.id,
                name: entity.name,
                code: entity.code,
                balance: calculateEntityBalance(entity.id),
                childEntities: [],
                isConsolidated: false
            };
        }
        
        // Get all child entities
        const childEntities = getEntityChildren(entity.id, false);
        _debug(`Found ${childEntities.length} child entities for consolidation`);
        
        // Calculate consolidated balance
        let consolidatedBalance = calculateEntityBalance(entity.id);
        
        // Add balances from child entities
        childEntities.forEach(childEntity => {
            consolidatedBalance += calculateEntityBalance(childEntity.id);
        });
        
        return {
            entityId: entity.id,
            name: entity.name,
            code: entity.code,
            balance: consolidatedBalance,
            childEntities: childEntities.map(child => ({
                entityId: child.id,
                name: child.name,
                code: child.code,
                balance: calculateEntityBalance(child.id)
            })),
            isConsolidated: true
        };
    }

    /**
     * Calculates the total balance for an entity (sum of all funds)
     * @param {string} entityId - The entity ID
     * @returns {number} Total balance
     */
    function calculateEntityBalance(entityId) {
        if (!_state.hierarchyData || !_state.hierarchyData.entities[entityId]) {
            return 0;
        }
        
        const entity = _state.hierarchyData.entities[entityId];
        let totalBalance = 0;
        
        // Sum up balances from all funds
        entity.children.forEach(child => {
            if (child.type === _state.entityTypes.FUND) {
                totalBalance += parseFloat(child.balance) || 0;
            }
        });
        
        return totalBalance;
    }

    // Public API
    const entityHierarchy = {
        init,
        loadHierarchyData,
        initializeHierarchyVisualization,
        getEntityHierarchyPath,
        getEntityChildren,
        calculateConsolidatedData,
        openEntityModal,
        deleteEntity
    };

    // Expose the public API to the window
    window.entityHierarchy = entityHierarchy;
    
    // Auto-initialize when document is ready
    document.addEventListener('DOMContentLoaded', function() {
        if (document.readyState === 'interactive' || document.readyState === 'complete') {
            init();
        }
    });

})(window);
