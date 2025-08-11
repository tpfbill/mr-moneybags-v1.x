/**
 * @file force-display.js
 * @description Script to force the UI to display data from the database
 * This script bypasses normal UI initialization and directly injects data
 */

// Function to load and inject the entity data
async function forceLoadEntityData() {
  console.log("Force Display: Starting entity data injection");
  
  try {
    // Fetch all entities directly from the API
    const entitiesResponse = await fetch('/api/entities', {
      credentials: 'include'
    });
    if (!entitiesResponse.ok) {
      throw new Error(`API error: ${entitiesResponse.status}`);
    }
    
    const entities = await entitiesResponse.json();
    console.log(`Force Display: Fetched ${entities.length} entities`);
    
    // Fetch all funds
    const fundsResponse = await fetch('/api/funds', {
      credentials: 'include'
    });
    if (!fundsResponse.ok) {
      throw new Error(`API error: ${fundsResponse.status}`);
    }
    
    const funds = await fundsResponse.json();
    console.log(`Force Display: Fetched ${funds.length} funds`);
    
    // 1. Update app state directly if app object exists
    if (window.app && window.app._state) {
      console.log("Force Display: Updating app state directly");
      window.app._state.entities = entities;
      window.app._state.funds = funds;
      
      // If app has a render method, call it
      if (typeof window.app.render === 'function') {
        console.log("Force Display: Calling app.render()");
        window.app.render();
      }
    }
    
    // 2. Update entity hierarchy module
    if (window.entityHierarchy) {
      console.log("Force Display: Updating entity hierarchy module");
      
      // Rebuild hierarchy data
      if (typeof window.entityHierarchy.loadHierarchyData === 'function') {
        console.log("Force Display: Calling entityHierarchy.loadHierarchyData()");
        await window.entityHierarchy.loadHierarchyData(true);
      }
      
      // Reinitialize visualization
      if (typeof window.entityHierarchy.initializeHierarchyVisualization === 'function') {
        console.log("Force Display: Calling entityHierarchy.initializeHierarchyVisualization()");
        window.entityHierarchy.initializeHierarchyVisualization(true);
      }
    }
    
    // 3. Update entity selector dropdown
    const entitySelector = document.getElementById('entity-selector');
    if (entitySelector) {
      console.log("Force Display: Updating entity selector dropdown");
      
      // Clear existing options
      entitySelector.innerHTML = '';
      
      // Find TPF_PARENT to put at top
      const tpfParent = entities.find(e => e.code === 'TPF_PARENT');
      if (tpfParent) {
        const option = document.createElement('option');
        option.value = tpfParent.id;
        option.textContent = `${tpfParent.name} (Consolidated)`;
        entitySelector.appendChild(option);
      }
      
      // Add all other entities
      entities.forEach(entity => {
        if (entity.code !== 'TPF_PARENT') {
          const option = document.createElement('option');
          option.value = entity.id;
          option.textContent = entity.name;
          entitySelector.appendChild(option);
        }
      });
      
      // Trigger change event
      const event = new Event('change');
      entitySelector.dispatchEvent(event);
    }
    
    // 4. Force activate Entities tab in Settings
    const entitiesTab = document.querySelector('.tab-item[data-tab="settings-entities"]');
    if (entitiesTab) {
      console.log("Force Display: Activating Settings > Entities tab");
      entitiesTab.click();
    }
    
    // 5. Force update any entity tables
    const entitiesTable = document.querySelector('#entities-table tbody');
    if (entitiesTable) {
      console.log("Force Display: Updating entities table");
      
      // Clear existing rows
      entitiesTable.innerHTML = '';
      
      // Add a row for each entity
      entities.forEach(entity => {
        const row = document.createElement('tr');
        
        // Find parent entity name
        let parentName = 'None';
        if (entity.parent_entity_id) {
          const parent = entities.find(e => e.id === entity.parent_entity_id);
          if (parent) {
            parentName = parent.name;
          }
        }
        
        row.innerHTML = `
          <td>${entity.name}</td>
          <td>${entity.code}</td>
          <td>${parentName}</td>
          <td>${entity.status}</td>
          <td>
            <button class="btn-edit" data-id="${entity.id}">Edit</button>
            <button class="btn-delete" data-id="${entity.id}">Delete</button>
          </td>
        `;
        
        entitiesTable.appendChild(row);
      });
    }
    
    console.log("Force Display: Data injection complete");
    alert("Data display forced successfully. The UI should now show your entities and funds.");
    
  } catch (error) {
    console.error("Force Display Error:", error);
    alert("Error forcing data display: " + error.message);
  }
}

// Execute the force display function when the script loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(forceLoadEntityData, 1000);
  });
} else {
  setTimeout(forceLoadEntityData, 1000);
}

// Expose globally for manual execution
window.forceLoadEntityData = forceLoadEntityData;

console.log("Force Display: Script loaded, will execute shortly");
